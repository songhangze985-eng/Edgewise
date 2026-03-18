from __future__ import annotations

from fastapi import APIRouter, Depends
from redis.asyncio import Redis

from app.api.deps import get_current_user, get_redis
from app.models.schemas import DashboardOverview, SessionResponse, UserInDB
from app.services.dashboard_service import get_dashboard_overview, get_recent_sessions

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


@router.get("/overview", response_model=DashboardOverview)
async def overview(
    current_user: UserInDB = Depends(get_current_user),
    redis: Redis = Depends(get_redis),
) -> DashboardOverview:
    return await get_dashboard_overview(redis, current_user.id)


@router.get("/recent-sessions", response_model=list[SessionResponse])
async def recent_sessions(
    current_user: UserInDB = Depends(get_current_user),
    redis: Redis = Depends(get_redis),
) -> list[SessionResponse]:
    return await get_recent_sessions(redis, current_user.id, limit=10)
