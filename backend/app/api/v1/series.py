from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query
from redis.asyncio import Redis

from app.api.deps import get_current_admin, get_redis
from app.models.schemas import CreatorSeriesUpsert, CreatorSeriesView, MessageResponse, UserInDB
from app.services import series_service

router = APIRouter(prefix="/series", tags=["series"])


@router.get("", response_model=list[CreatorSeriesView])
async def list_creator_series(
    variant: str | None = Query(default=None, max_length=32),
    redis: Redis = Depends(get_redis),
) -> list[CreatorSeriesView]:
    rows = await series_service.list_series(redis, variant=variant)
    return [CreatorSeriesView(**row) for row in rows]


@router.get("/{series_id}", response_model=CreatorSeriesView)
async def read_creator_series(
    series_id: str,
    redis: Redis = Depends(get_redis),
) -> CreatorSeriesView:
    row = await series_service.get_series(redis, series_id)
    if not row:
        raise HTTPException(status_code=404, detail="专栏不存在")
    return CreatorSeriesView(**row)


@router.put("/{series_id}", response_model=CreatorSeriesView)
async def upsert_creator_series(
    series_id: str,
    payload: CreatorSeriesUpsert,
    _admin: UserInDB = Depends(get_current_admin),
    redis: Redis = Depends(get_redis),
) -> CreatorSeriesView:
    row = await series_service.upsert_series(redis, series_id, payload.model_dump(exclude_none=True))
    return CreatorSeriesView(**row)
