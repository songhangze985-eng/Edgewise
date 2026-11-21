from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from redis.asyncio import Redis

from app.api.deps import get_current_user, get_redis
from app.core.redis_client import get_json, set_json
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
from app.services.recruiting_dossier_service import (
    analyze_lgd_footprint_for_hr,
    build_hr_cross_stage_opening,
    generate_hr_pressure_followup_probe,
    run_resume_screener_agent,
)
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


class ResumeScreenerRequest(BaseModel):
    position: str = "AI 产品经理"
    education: str = ""
    core_project: str = ""
    skills_text: str = ""
    api_key: str | None = None
    base_url: str | None = None
    model: str | None = None


class LgdFootprintRequest(BaseModel):
    position: str = "AI 产品经理"
    init_offer_k: int = 20
    pressure_mode: bool = True
    lgd_score: float | int | None = None
    lgd_transcript: list[dict[str, Any]] = Field(default_factory=list)


class HrPressureProbeRequest(BaseModel):
    candidate_answer: str
    position: str = "AI 产品经理"
    expected_salary_k: int = 26
    floor_k: int = 20
    internship_commitment: str = "5days_6months"


@router.post("/sessions/{session_id}/resume-screener")
async def run_session_resume_screener(
    session_id: str,
    payload: ResumeScreenerRequest,
    current_user: UserInDB = Depends(get_current_user),
    redis: Redis = Depends(get_redis),
) -> dict[str, Any]:
    raw_session = await get_json(redis, f"session:{session_id}")
    if raw_session is not None:
        if raw_session.get("user_id") != current_user.id and not current_user.is_admin:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")

    dossier = run_resume_screener_agent(
        position=payload.position,
        education=payload.education,
        core_project=payload.core_project,
        skills_text=payload.skills_text,
        api_key_override=payload.api_key,
        base_url_override=payload.base_url,
        model_override=payload.model,
    )
    if raw_session is not None:
        meta = dict(raw_session.get("metadata") or {})
        meta["candidate_dossier"] = dossier
        raw_session["metadata"] = meta
        await set_json(redis, f"session:{session_id}", raw_session)
    return dossier


@router.post("/sessions/{session_id}/lgd-footprint")
async def record_session_lgd_footprint(
    session_id: str,
    payload: LgdFootprintRequest,
    current_user: UserInDB = Depends(get_current_user),
    redis: Redis = Depends(get_redis),
) -> dict[str, Any]:
    raw_session = await get_json(redis, f"session:{session_id}")
    dossier = None
    if raw_session is not None:
        if raw_session.get("user_id") != current_user.id and not current_user.is_admin:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")
        dossier = (raw_session.get("metadata") or {}).get("candidate_dossier")

    footprint = analyze_lgd_footprint_for_hr(
        payload.lgd_transcript,
        lgd_score=payload.lgd_score,
    )
    hr_opening = build_hr_cross_stage_opening(
        position=payload.position,
        init_offer_k=payload.init_offer_k,
        dossier=dossier,
        lgd_footprint=footprint,
        pressure_mode=payload.pressure_mode,
    )
    if raw_session is not None:
        meta = dict(raw_session.get("metadata") or {})
        meta["lgd_footprint"] = footprint
        raw_session["metadata"] = meta
        await set_json(redis, f"session:{session_id}", raw_session)
    return {
        "lgd_footprint": footprint,
        "hr_opening": hr_opening,
    }


@router.post("/sessions/{session_id}/hr-pressure-probe")
async def create_session_hr_pressure_probe(
    session_id: str,
    payload: HrPressureProbeRequest,
    current_user: UserInDB = Depends(get_current_user),
    redis: Redis = Depends(get_redis),
) -> dict[str, Any]:
    raw_session = await get_json(redis, f"session:{session_id}")
    dossier = None
    lgd_footprint = None
    if raw_session is not None:
        if raw_session.get("user_id") != current_user.id and not current_user.is_admin:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")
        meta = raw_session.get("metadata") or {}
        dossier = meta.get("candidate_dossier")
        lgd_footprint = meta.get("lgd_footprint")

    return generate_hr_pressure_followup_probe(
        candidate_answer=payload.candidate_answer,
        position=payload.position,
        dossier=dossier,
        lgd_footprint=lgd_footprint,
        expected_salary_k=payload.expected_salary_k,
        floor_k=payload.floor_k,
        internship_commitment=payload.internship_commitment,
    )


class PostDeepDiveProbesRequest(BaseModel):
    candidate_answer: str = ""
    position: str = "AI 产品经理 / Agent 应用工程师"
    resume_json: dict[str, Any] | None = None
    lgd_report_json: dict[str, Any] | None = None


@router.get("/taxonomy")
async def get_interview_taxonomy_and_handoff(
    current_user: UserInDB = Depends(get_current_user),
    redis: Redis = Depends(get_redis),
) -> dict[str, Any]:
    from app.services.single_interview_taxonomy import (
        build_lgd_report_json,
        build_resume_handoff_json,
        generate_post_deep_dive_handoff_probes,
        get_single_interview_taxonomy_catalog,
    )

    saved_lgd_report = await get_json(redis, f"lgd_report:{current_user.id}")
    lgd_report_json = saved_lgd_report if isinstance(saved_lgd_report, dict) else build_lgd_report_json([])
    resume_handoff = build_resume_handoff_json()
    handoff = generate_post_deep_dive_handoff_probes(
        resume_json=resume_handoff,
        lgd_report_json=lgd_report_json,
    )
    return {
        "taxonomy": get_single_interview_taxonomy_catalog(),
        "context_handoff": handoff,
    }


@router.post("/sessions/{session_id}/post-deep-dive-probes")
async def create_session_post_deep_dive_probes(
    session_id: str,
    payload: PostDeepDiveProbesRequest,
    current_user: UserInDB = Depends(get_current_user),
    redis: Redis = Depends(get_redis),
) -> dict[str, Any]:
    from app.services.single_interview_taxonomy import (
        build_lgd_report_json,
        build_resume_handoff_json,
        generate_post_deep_dive_handoff_probes,
    )

    raw_session = await get_json(redis, f"session:{session_id}")
    session_meta: dict[str, Any] = {}
    if raw_session is not None:
        if raw_session.get("user_id") != current_user.id and not current_user.is_admin:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")
        session_meta = dict(raw_session.get("metadata") or {})

    existing_handoff = session_meta.get("context_handoff") or {}
    saved_lgd_report = (
        payload.lgd_report_json
        or existing_handoff.get("lgd_report_json")
        or session_meta.get("lgd_report")
        or await get_json(redis, f"lgd_report:{current_user.id}")
        or build_lgd_report_json([])
    )
    resume_id = session_meta.get("resume_id")
    resume_record = await get_json(redis, f"resume:{resume_id}") if resume_id else None
    resume_json = (
        payload.resume_json
        or existing_handoff.get("resume_json")
        or build_resume_handoff_json(
            resume_record,
            position=payload.position or raw_session.get("position") if raw_session else payload.position,
            dossier=session_meta.get("candidate_dossier"),
        )
    )

    probes_bundle = generate_post_deep_dive_handoff_probes(
        candidate_answer=payload.candidate_answer,
        resume_json=resume_json,
        lgd_report_json=saved_lgd_report,
    )
    if raw_session is not None:
        session_meta["context_handoff"] = probes_bundle
        session_meta["handoff_probes_triggered"] = True
        raw_session["metadata"] = session_meta
        await set_json(redis, f"session:{session_id}", raw_session)
    return probes_bundle


