from __future__ import annotations

import json
from datetime import date

from redis.asyncio import Redis

from app.core.redis_client import get_json
from app.models.schemas import DashboardOverview, SessionResponse


def _parse_sessions(session_payloads: list[str | None]) -> list[dict]:
    sessions: list[dict] = []
    for payload in session_payloads:
        if payload:
            sessions.append(json.loads(payload))
    sessions.sort(key=lambda item: item.get("created_at", ""), reverse=True)
    return sessions


def _calculate_streak(sessions: list[dict]) -> int:
    unique_dates = sorted(
        {
            date.fromisoformat((session.get("completed_at") or session["created_at"])[:10])
            for session in sessions
        },
        reverse=True,
    )
    if not unique_dates:
        return 0

    streak = 1
    for current_day, next_day in zip(unique_dates, unique_dates[1:]):
        if (current_day - next_day).days == 1:
            streak += 1
            continue
        break
    return streak


async def get_dashboard_overview(redis: Redis, user_id: str) -> DashboardOverview:
    session_ids = await redis.zrevrange(f"user:{user_id}:sessions", 0, -1)
    raw_sessions = await redis.mget([f"session:{session_id}" for session_id in session_ids]) if session_ids else []
    sessions = _parse_sessions(raw_sessions)
    scores = [float(session["score"]) for session in sessions if session.get("score") is not None]
    user = await get_json(redis, f"user:{user_id}") or {}

    avg_score = round(sum(scores) / len(scores), 2) if scores else 0.0
    return DashboardOverview(
        total_sessions=len(sessions),
        avg_score=avg_score,
        streak=_calculate_streak(sessions),
        credits=int(user.get("credits", 0)),
    )


async def get_recent_sessions(redis: Redis, user_id: str, limit: int = 10) -> list[SessionResponse]:
    session_ids = await redis.zrevrange(f"user:{user_id}:sessions", 0, max(limit - 1, 0))
    raw_sessions = await redis.mget([f"session:{session_id}" for session_id in session_ids]) if session_ids else []
    sessions = _parse_sessions(raw_sessions)
    return [SessionResponse.model_validate(session) for session in sessions[:limit]]
