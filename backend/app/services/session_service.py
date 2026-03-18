from __future__ import annotations

from datetime import datetime, timezone
from typing import Any
from uuid import uuid4

from fastapi import HTTPException, status
from redis.asyncio import Redis

from app.core.redis_client import get_json, set_json
from app.models.schemas import InterviewSessionComplete, InterviewSessionCreate, SessionResponse, UserInDB


def _now_strings() -> tuple[str, str, str]:
    now = datetime.now(timezone.utc)
    return now.isoformat(), now.date().isoformat(), now.strftime("%H:%M")


def _build_session_topic(payload: InterviewSessionCreate) -> str:
    if payload.topic:
        return payload.topic
    if payload.position:
        return f"{payload.position} 模拟面试"
    return "AI 面试训练"


async def create_interview_session(
    redis: Redis,
    current_user: UserInDB,
    payload: InterviewSessionCreate,
) -> SessionResponse:
    created_at, date_value, time_value = _now_strings()
    session_id = uuid4().hex
    session_record = {
        "id": session_id,
        "user_id": current_user.id,
        "type": payload.type,
        "position": payload.position,
        "difficulty": payload.difficulty,
        "topic": _build_session_topic(payload),
        "question_id": payload.question_id,
        "status": "in_progress",
        "score": None,
        "duration_minutes": None,
        "date": date_value,
        "time": time_value,
        "created_at": created_at,
        "updated_at": created_at,
        "completed_at": None,
        "metadata": payload.metadata,
    }

    await set_json(redis, f"session:{session_id}", session_record)
    await redis.zadd(
        f"user:{current_user.id}:sessions",
        {session_id: datetime.now(timezone.utc).timestamp()},
    )
    return SessionResponse.model_validate(session_record)


async def get_session_by_id(redis: Redis, session_id: str) -> SessionResponse | None:
    session = await get_json(redis, f"session:{session_id}")
    if session is None:
        return None
    return SessionResponse.model_validate(session)


async def complete_interview_session(
    redis: Redis,
    session_id: str,
    current_user: UserInDB,
    payload: InterviewSessionComplete,
) -> SessionResponse:
    session = await get_json(redis, f"session:{session_id}")
    if session is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Session not found",
        )

    if session["user_id"] != current_user.id and not current_user.is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have access to this session",
        )

    now = datetime.now(timezone.utc).isoformat()
    session["status"] = "completed"
    session["score"] = payload.score
    session["duration_minutes"] = payload.duration_minutes
    session["completed_at"] = now
    session["updated_at"] = now
    session["metadata"] = {
        **session.get("metadata", {}),
        "dimensions": payload.dimensions,
    }

    await set_json(redis, f"session:{session_id}", session)
    return SessionResponse.model_validate(session)
