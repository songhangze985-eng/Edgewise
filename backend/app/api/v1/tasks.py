from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from redis.asyncio import Redis

from app.api.deps import get_redis
from app.services.task_stats_service import get_task_stats, increment_task_stat

router = APIRouter(prefix="/tasks", tags=["tasks"])


@router.post("/{slug}/visit")
async def post_task_visit(
    slug: str,
    redis: Redis = Depends(get_redis),
) -> dict[str, str]:
    slug = slug.strip()
    if not slug or len(slug) > 64 or "/" in slug:
        raise HTTPException(status_code=400, detail="Invalid task slug")
    await increment_task_stat(redis, slug, "visits")
    return {"status": "ok"}


@router.get("/{slug}/stats")
async def read_task_stats(
    slug: str,
    redis: Redis = Depends(get_redis),
) -> dict[str, int]:
    slug = slug.strip()
    if not slug:
        raise HTTPException(status_code=400, detail="Invalid task slug")
    return await get_task_stats(redis, slug)
