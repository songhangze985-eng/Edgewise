from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from redis.asyncio import Redis

from app.api.deps import get_current_admin, get_current_token_payload, get_current_user, get_redis
from app.models.schemas import ExperienceReviewSubmit, ExperienceSubmit, ExperienceView, UserInDB
from app.services import experience_service
from app.services.auth_service import get_user_by_id

router = APIRouter(prefix="/experiences", tags=["experiences"])
optional_bearer = HTTPBearer(auto_error=False)


async def get_optional_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(optional_bearer),
    redis: Redis = Depends(get_redis),
) -> UserInDB | None:
    if credentials is None or credentials.scheme.lower() != "bearer":
        return None
    try:
        payload: dict[str, Any] = await get_current_token_payload(credentials, redis)
    except HTTPException:
        return None
    user_id = payload.get("sub")
    if not user_id:
        return None
    return await get_user_by_id(redis, user_id)


@router.post("", response_model=ExperienceView)
async def submit_experience(
    payload: ExperienceSubmit,
    current_user: UserInDB = Depends(get_current_user),
    redis: Redis = Depends(get_redis),
) -> ExperienceView:
    try:
        row = await experience_service.create_experience(
            redis,
            current_user.id,
            company=payload.company,
            role=payload.role,
            stage=payload.stage,
            date_month=payload.date_month,
            questions=payload.questions,
        )
    except ValueError as exc:
        code = str(exc)
        if code == "content_contains_private_contact":
            raise HTTPException(status_code=400, detail="请勿在面经中填写手机号、邮箱或身份证号") from exc
        if code == "questions_required":
            raise HTTPException(status_code=400, detail="请至少填写一道面试问题") from exc
        raise HTTPException(status_code=400, detail="提交失败") from exc
    return ExperienceView(**row)


@router.get("", response_model=list[ExperienceView])
async def list_experiences(
    company: str | None = Query(default=None, max_length=120),
    role: str | None = Query(default=None, max_length=120),
    stage: str | None = Query(default=None, max_length=80),
    redis: Redis = Depends(get_redis),
) -> list[ExperienceView]:
    rows = await experience_service.list_approved_experiences(
        redis,
        company=company,
        role=role,
        stage=stage,
    )
    return [ExperienceView(**row) for row in rows]


@router.get("/review-queue", response_model=list[ExperienceView])
async def list_experience_review_queue(
    _admin: UserInDB = Depends(get_current_admin),
    redis: Redis = Depends(get_redis),
) -> list[ExperienceView]:
    rows = await experience_service.list_pending_experiences(redis)
    return [ExperienceView(**row) for row in rows]


@router.get("/{experience_id}", response_model=ExperienceView)
async def read_experience(
    experience_id: str,
    current_user: UserInDB | None = Depends(get_optional_user),
    redis: Redis = Depends(get_redis),
) -> ExperienceView:
    viewer_id = current_user.id if current_user else None
    is_admin = bool(current_user and current_user.is_admin)
    row = await experience_service.get_experience_for_viewer(
        redis,
        experience_id,
        viewer_id=viewer_id,
        is_admin=is_admin,
    )
    if not row:
        raise HTTPException(status_code=404, detail="面经不存在或未公开")
    return ExperienceView(**row)


@router.post("/{experience_id}/review", response_model=ExperienceView)
async def review_experience(
    experience_id: str,
    payload: ExperienceReviewSubmit,
    admin: UserInDB = Depends(get_current_admin),
    redis: Redis = Depends(get_redis),
) -> ExperienceView:
    try:
        row = await experience_service.review_experience(
            redis,
            admin.id,
            experience_id,
            decision=payload.decision,
            note=payload.note,
        )
    except ValueError as exc:
        code = str(exc)
        if code == "not_found":
            raise HTTPException(status_code=404, detail="面经不存在") from exc
        if code == "not_pending":
            raise HTTPException(status_code=409, detail="该面经已审核") from exc
        raise HTTPException(status_code=400, detail="审核失败") from exc
    return ExperienceView(**row)
