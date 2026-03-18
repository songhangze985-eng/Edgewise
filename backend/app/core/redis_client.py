from __future__ import annotations

import json
from typing import Any

from redis.asyncio import Redis, from_url

from app.config import settings

redis_client: Redis | None = None


async def init_redis() -> Redis:
    global redis_client

    if redis_client is None:
        redis_client = from_url(
            settings.REDIS_URL,
            encoding="utf-8",
            decode_responses=True,
        )
        await redis_client.ping()

    return redis_client


def get_redis_client() -> Redis:
    if redis_client is None:
        raise RuntimeError("Redis client has not been initialized")
    return redis_client


async def close_redis() -> None:
    global redis_client

    if redis_client is not None:
        await redis_client.aclose()
        redis_client = None


async def set_json(redis: Redis, key: str, data: dict[str, Any], ex: int | None = None) -> None:
    await redis.set(key, json.dumps(data, ensure_ascii=False), ex=ex)


async def get_json(redis: Redis, key: str) -> dict[str, Any] | None:
    raw_value = await redis.get(key)
    if raw_value is None:
        return None
    return json.loads(raw_value)
