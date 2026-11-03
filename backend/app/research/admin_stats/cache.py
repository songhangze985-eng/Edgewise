from __future__ import annotations

import hashlib
import json
from datetime import datetime, timezone
from typing import Any

from redis.asyncio import Redis

CACHE_PREFIX = "research:stats:cache:"
CACHE_TTL = 600


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def normalize_params(params: dict[str, Any]) -> str:
    cleaned = {k: v for k, v in sorted(params.items()) if v is not None and v != ""}
    return hashlib.sha1(json.dumps(cleaned, sort_keys=True).encode("utf-8")).hexdigest()


async def get_cached(redis: Redis, endpoint: str, params: dict[str, Any]) -> dict[str, Any] | None:
    key = f"{CACHE_PREFIX}{endpoint}:{normalize_params(params)}"
    raw = await redis.get(key)
    if not raw:
        return None
    try:
        payload = json.loads(raw)
    except json.JSONDecodeError:
        return None
    payload["cache_hit"] = True
    return payload


async def set_cached(redis: Redis, endpoint: str, params: dict[str, Any], body: dict[str, Any]) -> None:
    key = f"{CACHE_PREFIX}{endpoint}:{normalize_params(params)}"
    body = {**body, "computed_at": body.get("computed_at") or _now_iso(), "cache_hit": False}
    await redis.set(key, json.dumps(body, ensure_ascii=False), ex=CACHE_TTL)


async def invalidate_stats_cache(redis: Redis) -> None:
    cursor = 0
    while True:
        cursor, keys = await redis.scan(cursor=cursor, match=f"{CACHE_PREFIX}*", count=100)
        if keys:
            await redis.unlink(*keys)
        if cursor == 0:
            break
