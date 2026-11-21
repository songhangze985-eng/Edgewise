"""System Storage, Redis Cache Hit Telemetry & Rate-Limit Observability API (`storage.py`).

Protected by strict Admin authentication (`get_current_admin`) so database configuration,
collection counts, and migration operations are never exposed to unauthenticated callers.
"""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends
from redis.asyncio import Redis

from app.api.deps import get_current_admin, get_redis
from app.core.migration import migrate_redis_to_mongo
from app.core.mongo_client import mongo_store
from app.core.rate_limiter import api_rate_limiter
from app.core.redis_client import get_cache_telemetry
from app.models.schemas import UserInDB
from app.research.events import get_stalled_event_receipt_counts
from app.services.research_service import get_stalled_posttest_receipt_counts

router = APIRouter(prefix="/system", tags=["system"])


@router.get("/storage-status")
async def get_system_storage_status(
    _admin: UserInDB = Depends(get_current_admin),
) -> dict[str, Any]:
    mongo_stats = await mongo_store.get_storage_stats()
    cache_stats = get_cache_telemetry()
    ratelimit_stats = api_rate_limiter.get_telemetry()
    return {
        "architecture": "mongodb_primary_document_store + redis_hot_cache_and_ratelimiter",
        "mongodb": mongo_stats,
        "redis_cache": cache_stats,
        "rate_limiter": ratelimit_stats,
        "research_event_receipts": await get_stalled_event_receipt_counts(),
        "posttest_submission_receipts": await get_stalled_posttest_receipt_counts(),
    }


@router.post("/migrate-redis-to-mongo")
async def trigger_redis_to_mongo_migration(
    _admin: UserInDB = Depends(get_current_admin),
    redis: Redis = Depends(get_redis),
) -> dict[str, Any]:
    """Admin-triggered idempotent migration of legacy Redis documents & indexes into MongoDB."""
    reconciled = await mongo_store.reconcile_fallback_to_live()
    migration_report = await migrate_redis_to_mongo(redis, mongo_store)
    storage_stats = await mongo_store.get_storage_stats()
    if mongo_store.degraded:
        status = "degraded"
    elif migration_report.get("errors"):
        status = "completed_with_errors"
    elif storage_stats.get("pending_fallback_collections"):
        status = "completed_with_conflicts"
    else:
        status = "completed"
    return {
        "status": status,
        "reconciled_fallback_docs": reconciled,
        "migration": migration_report,
        "engine_mode": mongo_store.mode,
        "degraded": mongo_store.degraded,
        "pending_fallback_collections": storage_stats.get("pending_fallback_collections", 0),
    }
