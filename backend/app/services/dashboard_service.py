from __future__ import annotations

from datetime import date

from redis.asyncio import Redis

from app.core.index_store import get_user_session_ids
from app.core.redis_client import get_json
from app.models.schemas import DashboardOverview, SessionResponse


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


async def _load_user_sessions(redis: Redis, user_id: str, *, limit: int | None = None) -> list[dict]:
    stop = max(limit - 1, 0) if limit is not None else -1
    session_ids = await get_user_session_ids(redis, user_id, start=0, stop=stop)
    sessions: list[dict] = []
    for session_id in session_ids:
        doc = await get_json(redis, f"session:{session_id}")
        if doc:
            sessions.append(doc)
    sessions.sort(key=lambda item: item.get("created_at", ""), reverse=True)
    return sessions[:limit] if limit is not None else sessions


async def get_dashboard_overview(redis: Redis, user_id: str) -> DashboardOverview:
    sessions = await _load_user_sessions(redis, user_id)
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
    sessions = await _load_user_sessions(redis, user_id, limit=limit)
    return [SessionResponse.model_validate(session) for session in sessions]
