from __future__ import annotations

import json
import random
from typing import Any

from redis.asyncio import Redis

from app.core.redis_client import get_json
from app.research.keys import auto_hash_key, blind_pool_key
from app.research.derive import set_auto_field

BLIND_RUBRIC = (
    "blind_score_material",
    "blind_score_structure",
    "blind_score_evidence",
    "blind_score_followup",
)


async def enqueue_posttest_for_blind_review(redis: Redis, user_id: str, answer: str) -> None:
    payload = json.dumps({"user_id": user_id, "answer": answer}, ensure_ascii=False)
    await redis.sadd(blind_pool_key(), payload)


async def list_blind_review_batch(redis: Redis, *, limit: int = 10) -> list[dict[str, Any]]:
    members = await redis.smembers(blind_pool_key())
    pool = list(members)
    random.shuffle(pool)
    batch: list[dict[str, Any]] = []
    for raw in pool[:limit]:
        try:
            item = json.loads(raw)
        except json.JSONDecodeError:
            continue
        batch.append(
            {
                "review_token": raw,
                "answer": item.get("answer"),
            }
        )
    return batch


async def submit_blind_scores(
    redis: Redis,
    review_token: str,
    scores: dict[str, int],
    *,
    reviewer_id: str,
) -> None:
    for key, value in scores.items():
        if key not in BLIND_RUBRIC:
            continue
        if not 1 <= int(value) <= 5:
            raise ValueError(f"{key} must be 1-5")
    try:
        item = json.loads(review_token)
    except json.JSONDecodeError as exc:
        raise ValueError("Invalid review token") from exc
    user_id = item.get("user_id")
    if not user_id:
        raise ValueError("Missing user in review token")

    for key, value in scores.items():
        if key in BLIND_RUBRIC:
            field = key
            existing = await redis.hget(auto_hash_key(user_id), field)
            if existing:
                field = f"{key}:{reviewer_id}"
            await set_auto_field(redis, user_id, field, int(value))

    await redis.srem(blind_pool_key(), review_token)
