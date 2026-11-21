from __future__ import annotations

import json
import hashlib
import logging
import random
import re
from datetime import datetime, timezone
from typing import Any

from redis.asyncio import Redis

from app.core.redis_client import get_json
from app.core.mongo_client import mongo_store, key_to_collection_and_id
from app.research.keys import blind_pool_key
from app.research.derive import get_auto_fields, get_auto_value_raw, set_auto_field
from app.research.events import user_has_research_consent

BLIND_RUBRIC = (
    "blind_score_material",
    "blind_score_structure",
    "blind_score_evidence",
    "blind_score_followup",
)
logger = logging.getLogger(__name__)


def blind_pool_document_key(payload: str) -> str:
    return f"research:blind:pool:{hashlib.sha256(payload.encode('utf-8')).hexdigest()}"


async def enqueue_posttest_for_blind_review(
    redis: Redis, user_id: str, answer: str, *,
    posttest_session_id: str | None = None, consent_accepted_at: str | None = None,
) -> None:
    if consent_accepted_at is None:
        user_data = await get_json(redis, f"user:{user_id}") or {}
        consent_accepted_at = (user_data.get("research_consent") or {}).get("accepted_at")
    item = {"user_id": user_id, "answer": answer, "consent_accepted_at": consent_accepted_at}
    if posttest_session_id:
        item["posttest_session_id"] = posttest_session_id
    payload = json.dumps(item, ensure_ascii=False)
    if await _insert_pending_review(payload):
        await redis.sadd(blind_pool_key(), payload)


async def _insert_pending_review(payload: str) -> bool:
    key = blind_pool_document_key(payload)
    collection, doc_id = key_to_collection_and_id(key)
    record = {"_cache_key": key, "_collection": collection,
              "doc_type": "blind_review_pool", "payload": payload, "status": "pending"}
    item = json.loads(payload)
    session_id = item.get("posttest_session_id") if isinstance(item, dict) else None
    if session_id:
        record.update(posttest_session_id=session_id, review_count=0, reviews=[])
    return await mongo_store.collection(collection).insert_if_absent(doc_id, record)


async def _review_allowed(redis: Redis, item: dict[str, Any]) -> bool:
    user_id = item.get("user_id")
    if not isinstance(user_id, str) or not user_id:
        return False
    user_data = await get_json(redis, f"user:{user_id}")
    if not user_has_research_consent(user_data):
        return False
    consent = user_data.get("research_consent") or {}
    cycle = item.get("consent_accepted_at")
    if cycle is None:
        return not consent.get("had_declined")
    return cycle == consent.get("accepted_at")


async def list_blind_review_batch(
    redis: Redis, *, limit: int = 10, reviewer_id: str | None = None,
) -> list[dict[str, Any]]:
    cached = await redis.smembers(blind_pool_key())
    docs = await mongo_store.list_collection_docs(
        "surveys", {"doc_type": "blind_review_pool", "status": "pending"}, limit=10000,
    )
    members = {doc["payload"] for doc in docs if doc.get("payload")}
    for payload in cached - members:
        key = blind_pool_document_key(payload)
        doc = await mongo_store.find_by_cache_key(key)
        if doc is None:
            try:
                item = json.loads(payload)
            except (TypeError, ValueError):
                continue
            if not isinstance(item, dict) or item.get("posttest_session_id"):
                continue
            if await _insert_pending_review(payload):
                members.add(payload)
        elif doc.get("status") == "completed":
            await redis.srem(blind_pool_key(), payload)
        elif doc.get("status") == "pending":
            members.add(payload)
    missing = members - cached
    if missing:
        await redis.sadd(blind_pool_key(), *missing)
    pool = list(members)
    random.shuffle(pool)
    batch: list[dict[str, Any]] = []
    retry_items = []
    if reviewer_id is not None:
        retryable = await mongo_store.list_collection_docs(
            "surveys", {"doc_type": "blind_review_pool", "status": "retryable", "reviewer_id": reviewer_id},
            limit=10000,
        )
        retry_items = [
            (doc["payload"], doc["submitted_scores"]) for doc in retryable
            if isinstance(doc.get("payload"), str) and isinstance(doc.get("submitted_scores"), dict)
        ]
    retry_payloads = {payload for payload, _ in retry_items}
    candidates = retry_items + [(payload, None) for payload in pool if payload not in retry_payloads]
    for raw, retry_scores in candidates:
        try:
            item = json.loads(raw)
        except json.JSONDecodeError:
            continue
        if not isinstance(item, dict) or not await _review_allowed(redis, item):
            continue
        if item.get("posttest_session_id"):
            doc = await mongo_store.find_by_cache_key(blind_pool_document_key(raw)) or {}
            if doc.get("status") != "pending" or item["user_id"] == reviewer_id:
                continue
            if reviewer_id and any(review["reviewer_id"] == reviewer_id for review in doc.get("reviews", [])):
                continue
        batch.append(
            {
                "review_token": blind_pool_document_key(raw).rsplit(":", 1)[1],
                "answer": item.get("answer"),
            }
        )
        if retry_scores is not None:
            batch[-1]["retry_scores"] = retry_scores
        if len(batch) >= limit:
            break
    return batch


async def submit_blind_scores(
    redis: Redis,
    review_token: str,
    scores: dict[str, int],
    *,
    reviewer_id: str,
) -> None:
    if not scores or not any(key in BLIND_RUBRIC for key in scores):
        raise ValueError("At least one rubric score is required")
    for key, value in scores.items():
        if key not in BLIND_RUBRIC:
            continue
        if not 1 <= int(value) <= 5:
            raise ValueError(f"{key} must be 1-5")
    if not re.fullmatch(r"[0-9a-f]{64}", review_token):
        raise ValueError("Invalid review token")
    stored = await mongo_store.find_by_cache_key(f"research:blind:pool:{review_token}")
    if not stored:
        raise ValueError("Review item is unavailable or already completed")
    raw = stored.get("payload")
    if not isinstance(raw, str) or blind_pool_document_key(raw).rsplit(":", 1)[1] != review_token:
        raise ValueError("Invalid review item")
    try:
        item = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise ValueError("Invalid review item") from exc
    if not isinstance(item, dict):
        raise ValueError("Invalid review item")
    user_id = item.get("user_id")
    if not user_id:
        raise ValueError("Missing user in review token")
    if not await _review_allowed(redis, item):
        raise ValueError("Review item is unavailable for the current consent period")

    collection_name, doc_id = key_to_collection_and_id(blind_pool_document_key(raw))
    submitted = {key: int(value) for key, value in scores.items() if key in BLIND_RUBRIC}
    if item.get("posttest_session_id"):
        if reviewer_id == user_id:
            raise ValueError("Reviewers cannot score their own answer")
        if set(submitted) != set(BLIND_RUBRIC):
            raise ValueError("All four rubric scores are required")
        await _submit_independent_review(doc_id, submitted, reviewer_id)
        return

    if stored.get("status") not in ("pending", "retryable"):
        raise ValueError("Review item is unavailable or already completed")
    prior_status = stored["status"]
    if prior_status == "retryable" and (
        stored.get("reviewer_id") != reviewer_id or stored.get("submitted_scores") != submitted
    ):
        raise ValueError("Retry requires the original reviewer and unchanged scores")

    collection = mongo_store.collection(collection_name)
    claim = await collection.update_one(
        {"_id": doc_id, "status": prior_status},
        {"$set": {"status": "processing", "submitted_scores": submitted, "reviewer_id": reviewer_id,
                  "processing_started_at": datetime.now(timezone.utc).isoformat()}},
        upsert=False,
    )
    if not claim.get("matched_count"):
        raise ValueError("Review item is unavailable or already being processed")

    processing = {"_id": doc_id, "status": "processing"}
    try:
        destination_fields = stored.get("projection_fields")
        if destination_fields is None:
            await get_auto_fields(redis, user_id)
            destination_fields = {}
            for key in submitted:
                existing = await get_auto_value_raw(redis, user_id, key)
                destination_fields[key] = f"{key}:{reviewer_id}" if existing else key
            await collection.update_one(
                processing, {"$set": {"projection_fields": destination_fields}}, upsert=False,
            )
        for key, value in submitted.items():
            await set_auto_field(redis, user_id, destination_fields[key], value)
        await collection.update_one(processing, {"$set": {"status": "completed"}}, upsert=False)
    except Exception:
        logger.exception("Blind review projection failed")
        try:
            await collection.update_one(processing, {"$set": {"status": "retryable"}}, upsert=False)
        except Exception:
            logger.exception("Could not mark the blind review as retryable")
        raise

    await redis.srem(blind_pool_key(), raw)


async def _submit_independent_review(doc_id: str, scores: dict[str, int], reviewer_id: str) -> None:
    collection = mongo_store.collection("surveys")
    # There are only two slots. A competing writer can advance the count at most twice.
    for _ in range(3):
        doc = await collection.find_one({"_id": doc_id})
        if not doc:
            break
        reviews = doc.get("reviews") or []
        for review in reviews:
            if review["reviewer_id"] == reviewer_id:
                if review["scores"] == scores:
                    return
                raise ValueError("This reviewer has already submitted different scores")
        if doc.get("status") != "pending" or len(reviews) >= 2:
            break
        new_reviews = [*reviews, {
            "reviewer_id": reviewer_id, "scores": scores,
            "submitted_at": datetime.now(timezone.utc).isoformat(),
        }]
        result = await collection.update_one(
            {"_id": doc_id, "status": "pending", "review_count": len(reviews)},
            {"$set": {"reviews": new_reviews, "review_count": len(new_reviews),
                      "status": "completed" if len(new_reviews) == 2 else "pending"}},
            upsert=False,
        )
        if result["matched_count"]:
            return
    raise ValueError("Review item is unavailable or already completed")


async def get_posttest_review_export(session_id: str) -> dict[str, Any] | None:
    doc = await mongo_store.collection("surveys").find_one({
        "doc_type": "blind_review_pool", "posttest_session_id": session_id,
    })
    if not doc:
        return None
    return {
        "required_reviews": 2,
        "reviews": [{"scores": review["scores"], "submitted_at": review["submitted_at"]}
                    for review in doc.get("reviews", [])],
    }


async def get_independent_review_progress(redis: Redis) -> dict[str, int] | None:
    limit = 10000
    records = await mongo_store.list_collection_docs(
        "surveys", {"doc_type": "blind_review_pool", "review_count": {"$in": [0, 1, 2]}},
        limit=limit + 1,
    )
    if len(records) > limit:
        return None
    counts = [0, 0, 0]
    for record in records:
        try:
            item = json.loads(record.get("payload") or "")
        except (TypeError, ValueError):
            continue
        if isinstance(item, dict) and await _review_allowed(redis, item):
            counts[record["review_count"]] += 1
    return {"awaiting_first": counts[0], "awaiting_second": counts[1], "completed": counts[2]}
