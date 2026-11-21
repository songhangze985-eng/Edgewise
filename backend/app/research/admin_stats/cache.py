from __future__ import annotations

import hashlib
import json
from datetime import datetime, timezone
from typing import Any
from uuid import uuid4

from redis.asyncio import Redis

CACHE_PREFIX = "research:stats:cache:"
CACHE_TTL = 600
CACHE_GENERATION_KEY = "research:stats:generation"


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def normalize_params(params: dict[str, Any]) -> str:
    cleaned = {k: v for k, v in sorted(params.items()) if v is not None and v != ""}
    return hashlib.sha1(json.dumps(cleaned, sort_keys=True).encode("utf-8")).hexdigest()


async def get_cache_generation(redis: Redis) -> str | None:
    return await redis.get(CACHE_GENERATION_KEY)


async def get_cached(redis: Redis, generation: str, endpoint: str, params: dict[str, Any]) -> dict[str, Any] | None:
    key = f"{CACHE_PREFIX}{generation}:{endpoint}:{normalize_params(params)}"
    raw = await redis.get(key)
    if not raw:
        return None
    try:
        payload = json.loads(raw)
    except json.JSONDecodeError:
        return None
    payload["cache_hit"] = True
    return payload


async def set_cached(redis: Redis, generation: str, endpoint: str, params: dict[str, Any], body: dict[str, Any]) -> None:
    key = f"{CACHE_PREFIX}{generation}:{endpoint}:{normalize_params(params)}"
    body = {**body, "computed_at": body.get("computed_at") or _now_iso(), "cache_hit": False}
    await redis.set(key, json.dumps(body, ensure_ascii=False), ex=CACHE_TTL)


async def invalidate_stats_cache(redis: Redis) -> None:
    await redis.set(CACHE_GENERATION_KEY, uuid4().hex)
