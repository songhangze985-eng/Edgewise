from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from redis.asyncio import Redis

from app.api.deps import get_current_user, get_redis
from app.core.redis_client import get_json, set_json
from app.models.schemas import (
    CodingAttemptRecord,
    CodingExplainUpdate,
    CodingSessionCreate,
    SessionResponse,
    UserInDB,
)
from app.research.pipeline import emit_server_event
from app.services.coding_session import (
    append_code_attempt,
    build_coding_session,
    score_coding_from_attempts,
    update_explain_transcript,
)
from app.services.session_service import create_interview_session
from app.models.schemas import InterviewSessionCreate

router = APIRouter(prefix="/coding", tags=["coding"])


@router.post("/sessions", response_model=SessionResponse, status_code=status.HTTP_201_CREATED)
async def create_coding_session(
    payload: CodingSessionCreate,
    current_user: UserInDB = Depends(get_current_user),
    redis: Redis = Depends(get_redis),
) -> SessionResponse:
    rounds, coding_meta = await build_coding_session(
        redis,
        mode=payload.mode,
        question_id=payload.question_id,
        duration_minutes=payload.duration_minutes,
    )
    topic = "编程面试模拟" if coding_meta["mode"] == "interview" else "编程笔试模拟"
    session = await create_interview_session(
        redis,
        current_user,
        InterviewSessionCreate(
            type="coding",
            topic=topic,
            difficulty=payload.difficulty,
            question_id=payload.question_id,
            metadata={
                "coding": coding_meta,
                "source": payload.source or "coding_lobby",
            },
        ),
    )
    raw = await get_json(redis, f"session:{session.id}")
    if raw:
        raw["rounds"] = rounds
        raw["code_attempts"] = []
        raw["explain_transcript"] = ""
        raw["metadata"] = {**(raw.get("metadata") or {}), "coding": coding_meta}
        await set_json(redis, f"session:{session.id}", raw)
        return SessionResponse.model_validate(raw)
    return session


@router.post("/sessions/{session_id}/attempts")
async def record_coding_attempt(
    session_id: str,
    payload: CodingAttemptRecord,
    current_user: UserInDB = Depends(get_current_user),
    redis: Redis = Depends(get_redis),
) -> dict:
    session = await get_json(redis, f"session:{session_id}")
    if session is None:
        raise HTTPException(status_code=404, detail="Session not found")
    if session["user_id"] != current_user.id and not current_user.is_admin:
        raise HTTPException(status_code=403, detail="Forbidden")

    now = datetime.now(timezone.utc).isoformat()
    attempt = {
        **payload.model_dump(),
        "recorded_at": now,
    }
    append_code_attempt(session, attempt)

    rounds = session.get("rounds") or []
    for rnd in rounds:
        for q in rnd.get("questions") or []:
            if q.get("id") == payload.question_id:
                q["tests_passed"] = payload.tests_passed
                q["tests_total"] = payload.tests_total
                q["last_language"] = payload.language
                if payload.tests_total and payload.tests_total > 0:
                    q["score"] = round(100.0 * payload.tests_passed / payload.tests_total, 1)

    session["updated_at"] = now
    await set_json(redis, f"session:{session_id}", session)

    event_name = "coding.run" if payload.kind == "run" else "coding.submit"
    await emit_server_event(
        redis,
        current_user.id,
        event_name,
        {
            "session_id": session_id,
            "question_id": payload.question_id,
            "language": payload.language,
            "tests_passed": payload.tests_passed,
            "tests_total": payload.tests_total,
            "kind": payload.kind,
        },
    )
    return {"ok": True, "attempt": attempt}


@router.patch("/sessions/{session_id}/explain", response_model=SessionResponse)
async def patch_explain_transcript(
    session_id: str,
    payload: CodingExplainUpdate,
    current_user: UserInDB = Depends(get_current_user),
    redis: Redis = Depends(get_redis),
) -> SessionResponse:
    session = await get_json(redis, f"session:{session_id}")
    if session is None:
        raise HTTPException(status_code=404, detail="Session not found")
    if session["user_id"] != current_user.id and not current_user.is_admin:
        raise HTTPException(status_code=403, detail="Forbidden")

    update_explain_transcript(session, payload.transcript, payload.speech_metrics)
    session["updated_at"] = datetime.now(timezone.utc).isoformat()
    await set_json(redis, f"session:{session_id}", session)

    word_count = len((payload.transcript or "").split())
    await emit_server_event(
        redis,
        current_user.id,
        "coding.explain_words",
        {
            "session_id": session_id,
            "word_count": word_count,
            "char_count": len(payload.transcript or ""),
        },
    )
    return SessionResponse.model_validate(session)


@router.post("/sessions/{session_id}/complete", response_model=SessionResponse)
async def complete_coding_session(
    session_id: str,
    current_user: UserInDB = Depends(get_current_user),
    redis: Redis = Depends(get_redis),
) -> SessionResponse:
    session = await get_json(redis, f"session:{session_id}")
    if session is None:
        raise HTTPException(status_code=404, detail="Session not found")
    if session["user_id"] != current_user.id and not current_user.is_admin:
        raise HTTPException(status_code=403, detail="Forbidden")

    now = datetime.now(timezone.utc).isoformat()
    session["status"] = "completed"
    session["completed_at"] = now
    session["updated_at"] = now
    final = score_coding_from_attempts(session)
    session["score"] = final
    session["score_status"] = "ok" if final is not None else "insufficient"
    coding = (session.get("metadata") or {}).get("coding") or {}
    session["duration_minutes"] = coding.get("duration_minutes")
    await set_json(redis, f"session:{session_id}", session)
    return SessionResponse.model_validate(session)
