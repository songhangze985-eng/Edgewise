"""Idempotent Redis -> MongoDB Data & Index Migration Engine (`migration.py`).

Fixes the legacy split-brain / expiration risk:
  - Scans all existing Redis keys (via non-blocking `SCAN`) at startup or via Admin API / CLI
  - Migrates pre-existing JSON documents (`user:*`, `question:*`, `session:*`, `lgd_room:*`, `resume:*`, etc.)
    into MongoDB so applying Redis cache TTLs never causes legacy records to disappear.
  - Migrates all critical secondary indexes (`users:all`, `user:email:*`, `user:invite_code:*`,
    `user:*:sessions`, `questions:all`, `lgd_rooms:all`) and survey/research structures
    (`research:survey:state:*`, `research:survey:answers:*`, `research:survey:queue:*`, `research:survey:shown:*`).
"""

from __future__ import annotations

import asyncio
import hashlib
import json
import logging
from typing import Any

from redis.asyncio import Redis

from app.core.mongo_client import MongoDocumentStore, close_mongo, init_mongo, mongo_store
from app.core.redis_client import NULL_SENTINEL, close_redis, init_redis

logger = logging.getLogger("edgewise.migration")

_SKIP_PREFIXES = (
    "cache:",
    "rl:",
    "token:blacklist:",
    "lgd:lock:",
    "research:admin_stats:",
)

_JSON_DOC_PREFIXES = (
    "user:",
    "question:",
    "session:",
    "lgd_room:",
    "lgd_memory:",
    "lgd_report:",
    "resume:",
    "assessment:",
    "experience:",
    "series:",
    "org:",
    "research:posttest:",
    "research:blind:",
    "research:invite_event:",
    "memory:conv:",
)

_USER_INDEX_SUFFIXES = (
    ":sessions",
    ":resumes",
    ":jobs",
    ":stories",
    ":shares",
    ":schedules",
    ":question_uploads",
    ":resume_questions",
    ":org_mentor_sessions",
)


def _is_primary_json_doc_key(key: str) -> bool:
    if key.startswith(_SKIP_PREFIXES):
        return False
    if key == "series:all":
        return False
    if key.startswith(("user:email:", "user:invite_code:", "org:invite_code:")):
        return False
    if key.startswith("user:") and any(s in key for s in _USER_INDEX_SUFFIXES):
        return False
    if key.startswith("org:") and (":workshops" in key or ":members" in key or ":mentors" in key or ":workshop:" in key):
        return False
    return key.startswith(_JSON_DOC_PREFIXES)


def _parse_json_or_raw(raw: str) -> Any:
    try:
        return json.loads(raw)
    except (json.JSONDecodeError, TypeError):
        return raw


def _shown_item_path(item_id: Any) -> str | None:
    """Return a safe `items.<key>` path, skipping names Mongo would treat as nested or as operators."""
    key = str(item_id)
    if not key or key.startswith("$") or "." in key or "\x00" in key:
        return None
    return f"items.{key}"


async def _merge_missing_shown_items(
    store: MongoDocumentStore, user_id: str, pairs: list[tuple[Any, Any]],
) -> bool:
    """Insert Redis shown-item scores only where that item key is absent. Never replace sibling fields."""
    updates: list[tuple[str, float]] = []
    for item_id, score in pairs:
        path = _shown_item_path(item_id)
        if path is None:
            logger.warning("Skipping unsafe survey shown item key %r for user %s", item_id, user_id)
            continue
        updates.append((path, float(score)))
    if not updates:
        return False

    shown_key = f"survey:shown:{user_id}"
    collection = store.collection("surveys")
    created = await collection.insert_if_absent(shown_key, {
        "_cache_key": shown_key, "_collection": "surveys", "user_id": user_id, "doc_type": "survey_shown",
    })
    imported = created
    for path, score in updates:
        result = await collection.update_one(
            {"_id": shown_key, path: {"$exists": False}},
            {"$set": {path: score}},
            upsert=False,
        )
        imported = imported or bool(result["matched_count"])
    return imported


async def _import_missing_survey_fields(
    store: MongoDocumentStore, key: str, user_id: str, doc_type: str, raw_hash: dict[str, str],
) -> bool:
    collection = store.collection("surveys")
    await collection.insert_if_absent(key, {
        "_cache_key": key, "_collection": "surveys", "user_id": user_id, "doc_type": doc_type,
    })
    imported = False
    for field, raw in raw_hash.items():
        path = f"fields.{field}"
        result = await collection.update_one(
            {"_id": key, path: {"$exists": False}}, {"$set": {path: _parse_json_or_raw(raw)}}, upsert=False,
        )
        imported = imported or bool(result["matched_count"])
    return imported


async def _scan_all_keys(redis: Redis) -> list[str]:
    if hasattr(redis, "scan"):
        keys: list[str] = []
        cursor: int | str = 0
        while True:
            cursor, batch = await redis.scan(cursor=cursor, count=200)
            keys.extend(str(k) for k in batch)
            if int(cursor) == 0:
                break
        return keys

    # Support test doubles without .scan()
    collected: set[str] = set()
    for attr in ("data", "hashes", "zsets", "sets", "lists", "streams"):
        store_map = getattr(redis, attr, None)
        if isinstance(store_map, dict):
            collected.update(str(k) for k in store_map.keys())
    return sorted(collected)


async def _migrate_json_doc_key(redis: Redis, store: MongoDocumentStore, key: str, stats: dict[str, int]) -> None:
    raw = await redis.get(key)
    if not raw or raw == NULL_SENTINEL:
        return
    try:
        parsed = json.loads(raw)
    except (json.JSONDecodeError, TypeError):
        return
    if not isinstance(parsed, dict):
        return

    existing = await store.find_by_cache_key(key)
    if existing is None:
        await store.upsert_by_cache_key(key, parsed)
        stats["migrated_docs"] += 1
    else:
        redis_ts = str(parsed.get("updated_at") or "")
        mongo_ts = str(existing.get("updated_at") or "")
        if redis_ts and redis_ts > mongo_ts:
            await store.upsert_by_cache_key(key, parsed)
            stats["migrated_docs"] += 1
        else:
            stats["skipped_existing"] += 1


async def migrate_redis_to_mongo(
    redis: Redis,
    store: MongoDocumentStore | None = None,
) -> dict[str, Any]:
    """Scan Redis keys and idempotently persist any un-migrated documents and indexes into MongoDB."""
    target_store = store or mongo_store
    stats: dict[str, int] = {
        "scanned_keys": 0,
        "migrated_docs": 0,
        "migrated_indexes": 0,
        "migrated_surveys": 0,
        "migrated_events": 0,
        "skipped_existing": 0,
        "errors": 0,
    }

    keys = await _scan_all_keys(redis)
    stats["scanned_keys"] = len(keys)

    for key in keys:
        try:
            if key == "research:blind_review:pool":
                for payload in await redis.smembers(key):
                    digest = hashlib.sha256(payload.encode("utf-8")).hexdigest()
                    doc_key = f"research:blind:pool:{digest}"
                    if await target_store.find_by_cache_key(doc_key) is None:
                        record = {"doc_type": "blind_review_pool", "payload": payload, "status": "pending"}
                        try:
                            item = json.loads(payload)
                        except (TypeError, ValueError):
                            continue
                        if isinstance(item, dict) and item.get("posttest_session_id"):
                            # Redis holds only the queue payload, without submitted reviews.
                            continue
                        await target_store.upsert_by_cache_key(doc_key, record)
                        stats["migrated_surveys"] += 1
                continue
            if _is_primary_json_doc_key(key):
                await _migrate_json_doc_key(redis, target_store, key, stats)
                continue

            if key.startswith("user:email:"):
                uid = await redis.get(key)
                if uid:
                    email = key.split("user:email:", 1)[1]
                    await target_store.upsert_by_cache_key(key, {"email": email, "user_id": str(uid)})
                    stats["migrated_indexes"] += 1
                continue

            if key.startswith("user:invite_code:"):
                uid = await redis.get(key)
                if uid:
                    code = key.split("user:invite_code:", 1)[1]
                    await target_store.upsert_by_cache_key(key, {"invite_code": code, "user_id": str(uid)})
                    stats["migrated_indexes"] += 1
                continue

            if key in ("users:all", "questions:all", "lgd_rooms:all", "series:all") and hasattr(redis, "smembers"):
                members = await redis.smembers(key)
                if members:
                    await target_store.update_nested_fields(
                        key,
                        nested_attr="members",
                        updates={str(m): True for m in members},
                    )
                    stats["migrated_indexes"] += 1
                continue

            if key.startswith("user:") and key.endswith(":sessions") and hasattr(redis, "zrange"):
                user_id = key[len("user:") : -len(":sessions")]
                pairs = await redis.zrange(key, 0, -1, withscores=True)
                if pairs:
                    await target_store.update_nested_fields(
                        key,
                        nested_attr="scores",
                        updates={str(sid): float(score) for sid, score in pairs},
                        base_fields={"user_id": user_id},
                    )
                    stats["migrated_indexes"] += 1
                continue

            if key.startswith("research:survey:") and key.endswith(":state") and hasattr(redis, "hgetall"):
                user_id = key[len("research:survey:") : -len(":state")]
                raw_hash = await redis.hgetall(key)
                if raw_hash:
                    imported = await _import_missing_survey_fields(
                        target_store, f"survey:state:{user_id}", user_id, "survey_state", raw_hash,
                    )
                    stats["migrated_surveys"] += int(imported)
                continue

            if key.startswith("research:survey:") and key.endswith(":queue") and hasattr(redis, "zrange"):
                user_id = key[len("research:survey:") : -len(":queue")]
                pairs = await redis.zrange(key, 0, -1, withscores=True)
                if pairs:
                    queue_key = f"survey:queue:{user_id}"
                    collection = target_store.collection("surveys")
                    payload = {
                        "_cache_key": queue_key, "_collection": "surveys", "user_id": user_id,
                        "doc_type": "survey_queue", "items": {str(item_id): float(score) for item_id, score in pairs},
                    }
                    if await collection.insert_if_absent(queue_key, payload):
                        stats["migrated_surveys"] += 1
                    else:
                        updated = await collection.update_one(
                            {"_id": queue_key, "queue_version": None}, {"$set": payload}, upsert=False,
                        )
                        stats["migrated_surveys"] += int(bool(updated["matched_count"]))
                continue

            if key.startswith("research:survey:") and key.endswith(":shown") and hasattr(redis, "zrange"):
                user_id = key[len("research:survey:") : -len(":shown")]
                pairs = await redis.zrange(key, 0, -1, withscores=True)
                if pairs:
                    imported = await _merge_missing_shown_items(target_store, user_id, pairs)
                    stats["migrated_surveys"] += int(imported)
                continue

            if key.startswith("research:survey:") and hasattr(redis, "hgetall"):
                user_id = key.split("research:survey:", 1)[1]
                raw_hash = await redis.hgetall(key)
                if raw_hash:
                    summary_key = f"survey:answers:{user_id}"
                    collection = target_store.collection("surveys")
                    await collection.insert_if_absent(summary_key, {
                        "_cache_key": summary_key, "_collection": "surveys",
                        "user_id": user_id, "doc_type": "survey_answers",
                    })
                    imported = False
                    for item_id, val in raw_hash.items():
                        parsed = _parse_json_or_raw(val)
                        if not isinstance(parsed, dict):
                            continue
                        item_path = f"answers.{item_id}"
                        result = await collection.update_one(
                            {"_id": summary_key, item_path: None}, {"$set": {item_path: parsed}}, upsert=False,
                        )
                        if not result["matched_count"]:
                            continue
                        answer_key = f"survey:answer:{user_id}:{item_id}"
                        await collection.insert_if_absent(answer_key, {
                            **parsed, "_cache_key": answer_key, "_collection": "surveys", "user_id": user_id, "item_id": item_id,
                        })
                        imported = True
                    stats["migrated_surveys"] += int(imported)
                continue

            if key.startswith("research:auto:") and hasattr(redis, "hgetall"):
                user_id = key.split("research:auto:", 1)[1]
                is_meta = user_id.endswith(":meta")
                if is_meta:
                    user_id = user_id[:-len(":meta")]
                user_id = user_id.split(":cycle:", 1)[0]
                raw_hash = await redis.hgetall(key)
                if raw_hash:
                    doc_type = "research_auto_meta" if is_meta else "research_auto"
                    imported = await _import_missing_survey_fields(target_store, key, user_id, doc_type, raw_hash)
                    stats["migrated_surveys"] += int(imported)
                continue

            if key.startswith("research:event:") and hasattr(redis, "xrange"):
                user_id = key.split("research:event:", 1)[1]
                start = "-"
                while True:
                    entries = await redis.xrange(key, min=start, max="+", count=1000)
                    if not entries:
                        break
                    ev_col = target_store.collection("research_events")
                    for entry_id, fields in entries:
                        doc_id = f"{user_id}:{entry_id}"
                        if await ev_col.find_one({"_id": doc_id}) is None:
                            props = _parse_json_or_raw(fields.get("props") or "{}")
                            await ev_col.insert_one(
                                {
                                    "_id": doc_id,
                                    "user_id": user_id,
                                    "stream_entry_id": entry_id,
                                    "event": fields.get("event"),
                                    "ts": fields.get("ts"),
                                    "props": props if isinstance(props, dict) else {},
                                }
                            )
                            stats["migrated_events"] += 1
                    if len(entries) < 1000:
                        break
                    start = f"({entries[-1][0]}"
        except Exception as exc:
            stats["errors"] += 1
            logger.warning("Migration skipped key `%s` due to error: %s", key, exc)

    logger.info("Redis->MongoDB migration summary: %s", stats)
    return stats


async def _cli_main() -> None:
    store = await init_mongo()
    redis = await init_redis()
    try:
        report = await migrate_redis_to_mongo(redis, store)
        print(json.dumps(report, ensure_ascii=False, indent=2))
    finally:
        await close_redis()
        await close_mongo()


if __name__ == "__main__":
    asyncio.run(_cli_main())
