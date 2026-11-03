from __future__ import annotations

from fastapi import APIRouter, Depends
from redis.asyncio import Redis

from app.api.deps import get_current_user, get_redis
from app.models.schemas import (
    CaseClarifyRequest,
    CaseStepCompleteRequest,
    CaseSessionCreate,
    InterviewRoundConfig,
    InterviewRoundMix,
    InterviewSessionCreate,
    SessionResponse,
    UserInDB,
)
from app.services.case_flow import list_case_prompts
from app.services.case_service import handle_case_clarify, handle_case_step_complete
from app.services.session_service import create_interview_session

router = APIRouter(prefix="/case", tags=["case"])


@router.get("/prompts")
async def get_case_prompts() -> dict:
    return {"items": list_case_prompts(), "source": "谈锋自编练习题"}


@router.post("/sessions", response_model=SessionResponse, status_code=201)
async def create_case_session(
    payload: CaseSessionCreate,
    current_user: UserInDB = Depends(get_current_user),
    redis: Redis = Depends(get_redis),
) -> SessionResponse:
    round_type = "system_design" if payload.kind == "system_design" else "case"
    name = "系统设计 · 白板" if round_type == "system_design" else "Case · 商业分析"
    interview_payload = InterviewSessionCreate(
        type="interview",
        position=payload.position,
        difficulty=payload.difficulty,
        topic=payload.title or name,
        rounds=[
            InterviewRoundConfig(
                name=name,
                question_count=1,
                type=round_type,
                reverse_qa=False,
                mix=InterviewRoundMix(general=0, resume_specific=0, professional=0),
                case_id=payload.case_id,
            )
        ],
        metadata={
            "mode": "case",
            "case_entry": "dedicated_lobby",
            **(payload.metadata or {}),
        },
    )
    return await create_interview_session(redis, current_user, interview_payload)


@router.post("/sessions/{session_id}/clarify")
async def case_clarify(
    session_id: str,
    payload: CaseClarifyRequest,
    current_user: UserInDB = Depends(get_current_user),
    redis: Redis = Depends(get_redis),
) -> dict:
    return await handle_case_clarify(
        redis,
        session_id,
        current_user,
        round_index=payload.round_index,
        text=payload.text,
    )


@router.post("/sessions/{session_id}/step")
async def case_step_complete(
    session_id: str,
    payload: CaseStepCompleteRequest,
    current_user: UserInDB = Depends(get_current_user),
    redis: Redis = Depends(get_redis),
) -> dict:
    return await handle_case_step_complete(
        redis,
        session_id,
        current_user,
        round_index=payload.round_index,
        step_id=payload.step_id,
        answer=payload.answer,
        whiteboard_snapshot=payload.whiteboard_snapshot,
    )
