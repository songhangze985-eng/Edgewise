"""Redis High-Hit-Rate Cache Layer (`redis_client.py`).

Implements Cache-Aside + Write-Through + Lazy Read-Repair over MongoDB (`mongo_client.py`):
  - Primary durability lives in MongoDB (`users`, `questions`, `surveys`, `sessions`, `lgd_rooms`,
    `resumes_jobs`, `conversation_memories`, `system_indexes`).
  - Redis serves strictly as the hot cache layer, rate-limiting counter store, and ephemeral lock broker.
  - Features:
    1. Real-time Cache Hit / Miss / Backfill / Read-Repair telemetry (`get_cache_telemetry()`).
    2. Jittered TTL (`base_ttl + random(0, 120)`) to prevent cache avalanche (防缓存雪崩).
    3. Null-Sentinel caching (`__EDGEWISE_NULL_CACHE_SENTINEL__`, 30s TTL) to prevent cache penetration (防缓存穿透).
    4. Aggregated collection list caching (`cache:questions:list_all`) for O(1) question-bank reads.
    5. Lazy Read-Repair: if an un-migrated legacy Redis key (`ttl == -1` without an expiry) is read,
       it is immediately synced to MongoDB before applying a cache TTL so legacy data never vanishes.
"""

from __future__ import annotations

import json
import logging
import random
from typing import Any

from redis.asyncio import Redis, from_url

from app.config import settings
from app.core.mongo_client import mongo_store

logger = logging.getLogger("edgewise.redis_cache")

redis_client: Redis | None = None

NULL_SENTINEL = "__EDGEWISE_NULL_CACHE_SENTINEL__"
NULL_SENTINEL_TTL = 30
QUESTIONS_LIST_CACHE_KEY = "cache:questions:list_all"

_CACHE_TELEMETRY: dict[str, int] = {
    "hits": 0,
    "misses": 0,
    "null_hits": 0,
    "mongo_backfills": 0,
    "lazy_read_repairs": 0,
    "writes": 0,
    "invalidations": 0,
}

# Track keys verified to exist in MongoDB in this worker process to keep Redis-hit latency zero-overhead
_SYNCED_KEYS_SEEN: set[str] = set()


def _resolve_ttl_with_jitter(key: str, explicit_ex: int | None = None) -> int:
    if explicit_ex is not None and explicit_ex > 0:
        return explicit_ex
    if key.startswith("question:") or key == QUESTIONS_LIST_CACHE_KEY:
        base = settings.REDIS_QUESTION_BANK_TTL
    else:
        base = settings.REDIS_DEFAULT_CACHE_TTL
    return max(60, base + random.randint(0, 120))


async def _safe_redis_set(redis: Redis, key: str, value: str, ex: int | None = None) -> None:
    try:
        await redis.set(key, value, ex=ex)
    except TypeError:
        await redis.set(key, value)


async def _safe_redis_delete(redis: Redis, key: str) -> None:
    if hasattr(redis, "delete"):
        try:
            await redis.delete(key)
        except Exception:
            pass


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
    """Write-Through: Persist document in MongoDB first, then populate Redis cache with jittered TTL."""
    _CACHE_TELEMETRY["writes"] += 1
    await mongo_store.upsert_by_cache_key(key, data)
    _SYNCED_KEYS_SEEN.add(key)
    ttl = _resolve_ttl_with_jitter(key, ex)
    serialized = json.dumps(data, ensure_ascii=False)
    await _safe_redis_set(redis, key, serialized, ex=ttl)
    if key.startswith("question:"):
        _CACHE_TELEMETRY["invalidations"] += 1
        await _safe_redis_delete(redis, QUESTIONS_LIST_CACHE_KEY)


async def _maybe_lazy_repair_legacy_key(redis: Redis, key: str, parsed: Any) -> None:
    """Ensure legacy Redis keys with no TTL (`ttl == -1`) are durably synced to MongoDB before expiring."""
    if not isinstance(parsed, dict) or key in _SYNCED_KEYS_SEEN:
        return
    is_legacy_permanent = False
    if hasattr(redis, "ttl"):
        try:
            ttl_val = await redis.ttl(key)
            if ttl_val == -1:
                is_legacy_permanent = True
        except Exception:
            pass
    if is_legacy_permanent:
        existing = await mongo_store.find_by_cache_key(key)
        if existing is None:
            await mongo_store.upsert_by_cache_key(key, parsed)
            _CACHE_TELEMETRY["lazy_read_repairs"] += 1
            logger.info("Lazy read-repair persisted legacy Redis key `%s` into MongoDB.", key)
    _SYNCED_KEYS_SEEN.add(key)


async def get_json(redis: Redis, key: str) -> dict[str, Any] | None:
    """Cache-Aside Read: Check Redis first; on miss, backfill from MongoDB with anti-penetration sentinel."""
    raw_value = await redis.get(key)
    if raw_value is not None:
        if raw_value == NULL_SENTINEL:
            _CACHE_TELEMETRY["hits"] += 1
            _CACHE_TELEMETRY["null_hits"] += 1
            return None
        _CACHE_TELEMETRY["hits"] += 1
        parsed = json.loads(raw_value)
        await _maybe_lazy_repair_legacy_key(redis, key, parsed)
        return parsed

    _CACHE_TELEMETRY["misses"] += 1
    doc = await mongo_store.find_by_cache_key(key)
    if doc is not None:
        _CACHE_TELEMETRY["mongo_backfills"] += 1
        _SYNCED_KEYS_SEEN.add(key)
        ttl = _resolve_ttl_with_jitter(key)
        await _safe_redis_set(redis, key, json.dumps(doc, ensure_ascii=False), ex=ttl)
        return doc

    # Cache null sentinel briefly to protect MongoDB from repeated lookups of missing IDs
    await _safe_redis_set(redis, key, NULL_SENTINEL, ex=NULL_SENTINEL_TTL)
    return None


async def invalidate_cache_key(redis: Redis, key: str) -> None:
    _CACHE_TELEMETRY["invalidations"] += 1
    _SYNCED_KEYS_SEEN.discard(key)
    await _safe_redis_delete(redis, key)


def get_cache_telemetry() -> dict[str, Any]:
    total = _CACHE_TELEMETRY["hits"] + _CACHE_TELEMETRY["misses"]
    hit_rate = round((_CACHE_TELEMETRY["hits"] / total) * 100.0, 2) if total > 0 else 100.0
    return {
        **_CACHE_TELEMETRY,
        "total_lookups": total,
        "hit_rate_pct": hit_rate,
    }


def reset_cache_telemetry() -> None:
    _SYNCED_KEYS_SEEN.clear()
    for k in _CACHE_TELEMETRY:
        _CACHE_TELEMETRY[k] = 0
