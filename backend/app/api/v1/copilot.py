from __future__ import annotations

from fastapi import APIRouter, Depends
from redis.asyncio import Redis

from app.api.deps import get_current_user, get_redis
from app.models.schemas import (
    CopilotMicroTaskDoneRequest,
    CopilotTriageRequest,
    CopilotTriageResponse,
    MessageResponse,
    UserInDB,
)
from app.services.copilot_triage import record_micro_task_done, run_copilot_triage

router = APIRouter(prefix="/copilot", tags=["copilot"])


@router.post("/triage", response_model=CopilotTriageResponse)
async def post_copilot_triage(
    payload: CopilotTriageRequest,
    current_user: UserInDB = Depends(get_current_user),
    redis: Redis = Depends(get_redis),
) -> CopilotTriageResponse:
    result = await run_copilot_triage(
        redis,
        current_user.id,
        message=payload.message,
        rejected_need=payload.rejected_need,
        clarify_answer=payload.clarify_answer,
    )
    return CopilotTriageResponse.model_validate(result)


@router.post("/triage/micro-done", response_model=MessageResponse)
async def post_copilot_micro_done(
    payload: CopilotMicroTaskDoneRequest,
    current_user: UserInDB = Depends(get_current_user),
    redis: Redis = Depends(get_redis),
) -> MessageResponse:
    await record_micro_task_done(
        redis,
        current_user.id,
        triage_id=payload.triage_id,
        need=payload.need,
        answer_summary=payload.answer,
    )
    return MessageResponse(message="ok")
