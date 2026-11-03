from __future__ import annotations

from fastapi import APIRouter, Depends, Query, Response, status
from redis.asyncio import Redis

from app.api.deps import get_current_user, get_redis
from app.models.schemas import JobCreate, JobMatchResponse, JobResponse, UserInDB
from app.services.job_service import create_job, delete_job, get_job_for_user, list_jobs, match_job_to_resume

router = APIRouter(prefix="/jobs", tags=["jobs"])


@router.post("", response_model=JobResponse, status_code=status.HTTP_201_CREATED)
async def post_job(
    payload: JobCreate,
    current_user: UserInDB = Depends(get_current_user),
    redis: Redis = Depends(get_redis),
) -> JobResponse:
    job = await create_job(
        redis,
        current_user.id,
        raw_text=payload.raw_text,
        title=payload.title,
        keywords=payload.keywords,
    )
    return JobResponse.model_validate(job)


@router.get("", response_model=list[JobResponse])
async def get_jobs(
    current_user: UserInDB = Depends(get_current_user),
    redis: Redis = Depends(get_redis),
) -> list[JobResponse]:
    jobs = await list_jobs(redis, current_user.id)
    return [JobResponse.model_validate(j) for j in jobs]


@router.get("/{job_id}", response_model=JobResponse)
async def get_job(
    job_id: str,
    current_user: UserInDB = Depends(get_current_user),
    redis: Redis = Depends(get_redis),
) -> JobResponse:
    job = await get_job_for_user(redis, current_user.id, job_id)
    from app.services import job_service

    return JobResponse.model_validate(job_service._public_job_view(job))


@router.delete("/{job_id}", status_code=status.HTTP_204_NO_CONTENT, response_class=Response)
async def remove_job(
    job_id: str,
    current_user: UserInDB = Depends(get_current_user),
    redis: Redis = Depends(get_redis),
) -> Response:
    await delete_job(redis, current_user.id, job_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/{job_id}/match", response_model=JobMatchResponse)
async def get_job_match(
    job_id: str,
    resume_id: str = Query(min_length=8, max_length=64),
    current_user: UserInDB = Depends(get_current_user),
    redis: Redis = Depends(get_redis),
) -> JobMatchResponse:
    match = await match_job_to_resume(redis, current_user.id, job_id, resume_id)
    return JobMatchResponse.model_validate(match)
