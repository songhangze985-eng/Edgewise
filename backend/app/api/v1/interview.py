from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from redis.asyncio import Redis

from app.api.deps import get_current_user, get_redis
from app.models.schemas import (
    InterviewAnswerScoreRequest,
    InterviewSessionComplete,
    InterviewSessionCreate,
    InterviewSessionMetadataUpdate,
    NegotiationTurnRequest,
    QuestionAttemptRequest,
    ResearchFollowupUpdate,
    FollowupRequest,
    ReverseQaSubmit,
    RevisionDecisionRequest,
    SessionResponse,
    UserInDB,
)
from app.services.followup_service import handle_question_followup
from app.services.research_service import apply_research_followup
from app.services.revision_service import apply_revision_decision, record_question_attempt
from app.services.session_service import (
    complete_interview_session,
    create_interview_session,
    get_session_by_id,
    patch_interview_session_metadata,
    post_negotiation_turn,
    score_interview_answer,
    submit_reverse_qa,
)

router = APIRouter(prefix="/interview", tags=["interview"])


@router.post("/sessions", response_model=SessionResponse, status_code=status.HTTP_201_CREATED)
async def create_session(
    payload: InterviewSessionCreate,
    current_user: UserInDB = Depends(get_current_user),
    redis: Redis = Depends(get_redis),
) -> SessionResponse:
    return await create_interview_session(redis, current_user, payload)


@router.get("/sessions/{session_id}", response_model=SessionResponse)
async def get_session(
    session_id: str,
    current_user: UserInDB = Depends(get_current_user),
    redis: Redis = Depends(get_redis),
) -> SessionResponse:
    session = await get_session_by_id(redis, session_id)
    if session is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Session not found",
        )
    if session.user_id != current_user.id and not current_user.is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have access to this session",
        )
    return session


@router.post("/sessions/{session_id}/score-answer")
async def score_answer(
    session_id: str,
    payload: InterviewAnswerScoreRequest,
    current_user: UserInDB = Depends(get_current_user),
    redis: Redis = Depends(get_redis),
) -> dict:
    return await score_interview_answer(
        redis,
        session_id,
        current_user,
        round_index=payload.round_index,
        question_index=payload.question_index,
        answer_text=payload.answer_text,
        stt_failed=payload.stt_failed,
        speech=payload.speech,
        delivery=payload.delivery,
        presence=payload.presence,
        take_no=payload.take_no,
        takes_used=payload.takes_used,
        declined_personal=payload.declined_personal,
    )


@router.post("/sessions/{session_id}/negotiation/turn")
async def negotiation_turn(
    session_id: str,
    payload: NegotiationTurnRequest,
    current_user: UserInDB = Depends(get_current_user),
    redis: Redis = Depends(get_redis),
) -> dict:
    return await post_negotiation_turn(
        redis,
        session_id,
        current_user,
        round_index=payload.round_index,
        message=payload.message,
    )


@router.post("/sessions/{session_id}/reverse-qa")
async def reverse_qa_submit(
    session_id: str,
    payload: ReverseQaSubmit,
    current_user: UserInDB = Depends(get_current_user),
    redis: Redis = Depends(get_redis),
) -> dict:
    return await submit_reverse_qa(
        redis,
        session_id,
        current_user,
        round_index=payload.round_index,
        questions=payload.questions,
    )


@router.post("/sessions/{session_id}/questions/{qid}/attempts")
async def post_question_attempt(
    session_id: str,
    qid: str,
    payload: QuestionAttemptRequest,
    current_user: UserInDB = Depends(get_current_user),
    redis: Redis = Depends(get_redis),
) -> dict:
    return await record_question_attempt(
        redis,
        session_id,
        qid,
        current_user,
        round_index=payload.round_index,
        question_index=payload.question_index,
        answer_text=payload.answer_text,
        stt_failed=payload.stt_failed,
        speech=payload.speech,
        delivery=payload.delivery,
    )


@router.post("/sessions/{session_id}/questions/{qid}/followup")
async def post_question_followup(
    session_id: str,
    qid: str,
    payload: FollowupRequest,
    current_user: UserInDB = Depends(get_current_user),
    redis: Redis = Depends(get_redis),
) -> dict:
    return await handle_question_followup(
        redis,
        session_id,
        qid,
        current_user,
        round_index=payload.round_index,
        question_index=payload.question_index,
        answer_text=payload.answer_text,
        stt_failed=payload.stt_failed,
        speech=payload.speech,
        delivery=payload.delivery,
    )


@router.post("/sessions/{session_id}/questions/{qid}/revision-decision")
async def post_revision_decision(
    session_id: str,
    qid: str,
    payload: RevisionDecisionRequest,
    current_user: UserInDB = Depends(get_current_user),
    redis: Redis = Depends(get_redis),
) -> dict:
    if payload.decision == "skip":
        return await apply_revision_decision(
            redis,
            session_id,
            qid,
            current_user,
            round_index=payload.round_index,
            question_index=payload.question_index,
            decision="decline",
            skip=True,
        )
    return await apply_revision_decision(
        redis,
        session_id,
        qid,
        current_user,
        round_index=payload.round_index,
        question_index=payload.question_index,
        decision=payload.decision,
        revised_text=payload.revised_text,
        decline_reason=payload.decline_reason,
        probe_answer=payload.probe_answer,
        feedback_viewed=payload.feedback_viewed,
    )


@router.patch("/sessions/{session_id}/metadata", response_model=SessionResponse)
async def update_session_metadata(
    session_id: str,
    payload: InterviewSessionMetadataUpdate,
    current_user: UserInDB = Depends(get_current_user),
    redis: Redis = Depends(get_redis),
) -> SessionResponse:
    return await patch_interview_session_metadata(
        redis, session_id, current_user, payload.metadata
    )


@router.post("/sessions/{session_id}/complete", response_model=SessionResponse)
async def complete_session(
    session_id: str,
    payload: InterviewSessionComplete,
    current_user: UserInDB = Depends(get_current_user),
    redis: Redis = Depends(get_redis),
) -> SessionResponse:
    return await complete_interview_session(redis, session_id, current_user, payload)


@router.post("/sessions/{session_id}/research-followup", response_model=SessionResponse)
async def submit_research_followup(
    session_id: str,
    payload: ResearchFollowupUpdate,
    current_user: UserInDB = Depends(get_current_user),
    redis: Redis = Depends(get_redis),
) -> SessionResponse:
    session = await apply_research_followup(
        redis,
        session_id,
        current_user,
        payload.model_dump(exclude_unset=True),
    )
    return SessionResponse.model_validate(session)
