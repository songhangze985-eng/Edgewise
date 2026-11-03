from __future__ import annotations

import csv
import hashlib
import io
import json
from typing import Any

from redis.asyncio import Redis

from app.core.redis_client import get_json
from app.models.schemas import UserInDB
from app.research.derive import derive_daily_aggregates, get_auto_fields
from app.research.events import ingest_client_events
from app.research.keys import RULE_VERSION, SURVEY_ITEMS_VERSION, survey_hash_key
from app.research.survey_engine import get_pending_survey_items, load_survey_items, record_survey_response
from app.research.blind_review import list_blind_review_batch, submit_blind_scores


def _anonymize_user_id(user_id: str) -> str:
    digest = hashlib.sha256(user_id.encode("utf-8")).hexdigest()
    return f"anon_{digest[:16]}"


async def ingest_events(redis: Redis, user: UserInDB, events: list[dict[str, Any]]) -> tuple[int, list[str]]:
    event_ids = await ingest_client_events(redis, user.id, events)
    return len(event_ids), event_ids


async def pending_survey(
    redis: Redis,
    user: UserInDB,
    *,
    context: str | None,
) -> dict[str, Any]:
    user_data = await get_json(redis, f"user:{user.id}") or {}
    auto = await get_auto_fields(redis, user.id)
    j1_done = bool(user_data.get("posttest_completed_at") or auto.get("J1"))
    return await get_pending_survey_items(
        redis,
        user.id,
        context=context,
        posttest_j1_done=j1_done,
    )


async def submit_survey_answers(
    redis: Redis,
    user: UserInDB,
    answers: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    from app.research.admin_stats.cache import invalidate_stats_cache

    results: list[dict[str, Any]] = []
    for item in answers:
        record = await record_survey_response(
            redis,
            user.id,
            item["item_id"],
            value=item.get("value"),
            skipped=bool(item.get("skipped")),
        )
        results.append({"item_id": item["item_id"], **record})
    await invalidate_stats_cache(redis)
    return results


async def run_daily_derive(redis: Redis, user_id: str | None = None) -> int:
    if user_id:
        await derive_daily_aggregates(redis, user_id)
        return 1
    user_ids = await redis.smembers("users:all")
    for uid in user_ids:
        user_data = await get_json(redis, f"user:{uid}")
        consent = (user_data or {}).get("research_consent") or {}
        if consent.get("accepted") and not consent.get("withdrawn_at"):
            await derive_daily_aggregates(redis, uid)
    return len(user_ids)


async def export_research_panel(redis: Redis, *, anonymize: bool) -> str:
    user_ids = await redis.smembers("users:all")
    lines: list[str] = []
    for user_id in user_ids:
        user_data = await get_json(redis, f"user:{user_id}")
        if not user_data:
            continue
        consent = user_data.get("research_consent") or {}
        if not consent.get("accepted"):
            continue
        auto = await get_auto_fields(redis, user_id)
        survey_raw = await redis.hgetall(survey_hash_key(user_id))
        survey: dict[str, Any] = {}
        for key, val in survey_raw.items():
            try:
                survey[key] = json.loads(val)
            except json.JSONDecodeError:
                survey[key] = val
        assignment = user_data.get("experiment_assignment") or {}
        document = {
            "user_id": _anonymize_user_id(user_id) if anonymize else user_id,
            "experiment_arm": assignment.get("arm"),
            "experiment_assignment": assignment,
            "auto": auto,
            "survey": survey,
            "rule_version": RULE_VERSION,
            "survey_items_version": SURVEY_ITEMS_VERSION,
            "consent_version": consent.get("version"),
        }
        lines.append(json.dumps(document, ensure_ascii=False))
    return "\n".join(lines) + ("\n" if lines else "")


async def export_research_panel_csv(redis: Redis, *, anonymize: bool) -> str:
    user_ids = await redis.smembers("users:all")
    buffer = io.StringIO()
    writer = csv.writer(buffer)
    survey_ids = [item["id"] for item in load_survey_items()]
    writer.writerow(
        ["user_id", "experiment_arm", "rule_version", "survey_items_version", "auto_json", "survey_json"]
        + survey_ids
    )
    for user_id in user_ids:
        user_data = await get_json(redis, f"user:{user_id}")
        if not user_data:
            continue
        consent = user_data.get("research_consent") or {}
        if not consent.get("accepted"):
            continue
        auto = await get_auto_fields(redis, user_id)
        survey_raw = await redis.hgetall(survey_hash_key(user_id))
        survey_parsed: dict[str, Any] = {}
        for key, val in survey_raw.items():
            try:
                survey_parsed[key] = json.loads(val)
            except json.JSONDecodeError:
                survey_parsed[key] = val
        assignment = user_data.get("experiment_assignment") or {}
        user_col = _anonymize_user_id(user_id) if anonymize else user_id
        row = [
            user_col,
            assignment.get("arm"),
            RULE_VERSION,
            SURVEY_ITEMS_VERSION,
            json.dumps(auto, ensure_ascii=False),
            json.dumps(survey_parsed, ensure_ascii=False),
        ]
        for item_id in survey_ids:
            entry = survey_parsed.get(item_id)
            if isinstance(entry, dict):
                row.append(entry.get("value") if entry.get("status") == "answered" else entry.get("status"))
            else:
                row.append(None)
        writer.writerow(row)
    return buffer.getvalue()


async def blind_review_pending(redis: Redis, limit: int = 10) -> list[dict[str, Any]]:
    return await list_blind_review_batch(redis, limit=limit)


async def blind_review_submit(redis: Redis, reviewer_id: str, payload: dict[str, Any]) -> None:
    await submit_blind_scores(
        redis,
        payload["review_token"],
        payload.get("scores") or {},
        reviewer_id=reviewer_id,
    )
