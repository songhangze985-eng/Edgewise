from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from redis.asyncio import Redis

from app.api.deps import get_current_user, get_redis
from app.models.schemas import (
    AssessmentAnswerSubmit,
    AssessmentSessionResponse,
    UserInDB,
)
from app.research.pipeline import emit_server_event
from app.services import assessment_service

router = APIRouter(prefix="/assessment", tags=["assessment"])


@router.post("/sessions", response_model=AssessmentSessionResponse, status_code=status.HTTP_201_CREATED)
async def create_assessment_session(
    current_user: UserInDB = Depends(get_current_user),
    redis: Redis = Depends(get_redis),
) -> AssessmentSessionResponse:
    row = await assessment_service.create_assessment_session(redis, current_user.id)
    return AssessmentSessionResponse.model_validate(row)


@router.post("/sessions/{assessment_id}/answers", response_model=AssessmentSessionResponse)
async def post_assessment_answer(
    assessment_id: str,
    payload: AssessmentAnswerSubmit,
    current_user: UserInDB = Depends(get_current_user),
    redis: Redis = Depends(get_redis),
) -> AssessmentSessionResponse:
    try:
        row = await assessment_service.record_assessment_answer(
            redis,
            current_user.id,
            assessment_id,
            section=payload.section,
            item_id=payload.item_id or "",
            choice_index=payload.choice_index,
            choice=payload.choice,
            time_spent_sec=payload.time_spent_sec,
            block_category=payload.block_category,
            block_time_spent_sec=payload.block_time_spent_sec,
        )
    except KeyError as exc:
        if str(exc) == "not_found":
            raise HTTPException(status_code=404, detail="Assessment not found") from None
        raise HTTPException(status_code=404, detail="Item not found") from None
    except PermissionError:
        raise HTTPException(status_code=403, detail="Forbidden") from None
    except ValueError as exc:
        msg = str(exc)
        if msg == "already_completed":
            raise HTTPException(status_code=409, detail="Assessment already completed") from None
        raise HTTPException(status_code=400, detail=msg) from None
    return AssessmentSessionResponse.model_validate(row)


@router.post("/sessions/{assessment_id}/complete", response_model=AssessmentSessionResponse)
async def complete_assessment_session(
    assessment_id: str,
    current_user: UserInDB = Depends(get_current_user),
    redis: Redis = Depends(get_redis),
) -> AssessmentSessionResponse:
    try:
        row = await assessment_service.complete_assessment_session(
            redis, current_user.id, assessment_id
        )
    except KeyError:
        raise HTTPException(status_code=404, detail="Assessment not found") from None
    except PermissionError:
        raise HTTPException(status_code=403, detail="Forbidden") from None

    report = row.get("report") or {}
    apt = report.get("aptitude") or {}
    per = report.get("personality") or {}
    await emit_server_event(
        redis,
        current_user.id,
        "assessment.completed",
        {
            "assessment_id": assessment_id,
            "aptitude_by_category": apt.get("by_category"),
            "personality_consistency_score": per.get("consistency_score"),
            "personality_low_consistency": per.get("low_consistency"),
        },
    )
    return AssessmentSessionResponse.model_validate(row)
