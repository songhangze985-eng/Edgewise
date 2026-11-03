from __future__ import annotations

from fastapi import APIRouter, Depends, Response, status
from redis.asyncio import Redis

from app.api.deps import get_current_user, get_redis
from app.models.schemas import (
    ScheduleCreate,
    ScheduleResponse,
    ScheduleUpdate,
    UserInDB,
)
from app.services import schedule_service

router = APIRouter(prefix="/schedule", tags=["schedule"])


@router.post("", response_model=ScheduleResponse, status_code=status.HTTP_201_CREATED)
async def post_schedule(
    payload: ScheduleCreate,
    current_user: UserInDB = Depends(get_current_user),
    redis: Redis = Depends(get_redis),
) -> ScheduleResponse:
    row = await schedule_service.create_schedule(
        redis,
        current_user.id,
        company=payload.company,
        stage=payload.stage,
        at=payload.at,
        job_id=payload.job_id,
        result=payload.result,
        note=payload.note,
    )
    return ScheduleResponse.model_validate(row)


@router.get("", response_model=list[ScheduleResponse])
async def get_schedule_list(
    current_user: UserInDB = Depends(get_current_user),
    redis: Redis = Depends(get_redis),
) -> list[ScheduleResponse]:
    rows = await schedule_service.list_schedules(redis, current_user.id)
    return [ScheduleResponse.model_validate(r) for r in rows]


@router.patch("/{schedule_id}", response_model=ScheduleResponse)
async def patch_schedule(
    schedule_id: str,
    payload: ScheduleUpdate,
    current_user: UserInDB = Depends(get_current_user),
    redis: Redis = Depends(get_redis),
) -> ScheduleResponse:
    row = await schedule_service.update_schedule(
        redis,
        current_user.id,
        schedule_id,
        company=payload.company,
        stage=payload.stage,
        at=payload.at,
        job_id=payload.job_id,
        clear_job_id=payload.clear_job_id,
        result=payload.result,
        note=payload.note,
    )
    return ScheduleResponse.model_validate(row)


@router.delete("/{schedule_id}", status_code=status.HTTP_204_NO_CONTENT, response_class=Response)
async def remove_schedule(
    schedule_id: str,
    current_user: UserInDB = Depends(get_current_user),
    redis: Redis = Depends(get_redis),
) -> Response:
    await schedule_service.delete_schedule(redis, current_user.id, schedule_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
