"""Pair follow-up practice sessions."""

from __future__ import annotations

import secrets
from datetime import datetime, timezone
from typing import Any

from fastapi import HTTPException, status
from redis.asyncio import Redis

from app.core.redis_client import get_json, set_json
from app.models.schemas import UserInDB
from app.research.pipeline import emit_server_event

MAX_ANSWER_LEN = 4000


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _pair_id() -> str:
    return secrets.token_urlsafe(9).replace("-", "").replace("_", "")[:12]


def _role_for_user(record: dict[str, Any], user_id: str) -> str | None:
    if record.get("inviter") == user_id:
        return "inviter"
    if record.get("invitee") == user_id:
        return "invitee"
    return None


def _can_see_peer(record: dict[str, Any], viewer_role: str) -> bool:
    if viewer_role == "inviter":
        return bool(record.get("visibility_inviter")) and bool(record.get("visibility_invitee"))
    if viewer_role == "invitee":
        return bool(record.get("visibility_invitee")) and bool(record.get("visibility_inviter"))
    return False


def _view_for_user(record: dict[str, Any], user_id: str | None) -> dict[str, Any]:
    role = _role_for_user(record, user_id) if user_id else None
    mutual = _can_see_peer(record, role) if role else False

    inviter_answer = record.get("inviter_answer")
    invitee_answer = record.get("invitee_answer")
    if not mutual:
        if role == "inviter":
            invitee_answer = None
        elif role == "invitee":
            inviter_answer = None
        else:
            inviter_answer = None
            invitee_answer = None

    return {
        "pair_id": record["id"],
        "probe_text": record.get("probe_text"),
        "inviter_answer": inviter_answer,
        "invitee_answer": invitee_answer,
        "visibility_inviter": bool(record.get("visibility_inviter")),
        "visibility_invitee": bool(record.get("visibility_invitee")),
        "viewer_role": role,
        "mutual_visible": mutual,
        "created_at": record.get("created_at"),
    }


async def create_pair(
    redis: Redis,
    user: UserInDB,
    *,
    probe_text: str,
    inviter_answer: str | None = None,
    share_id: str | None = None,
) -> dict[str, Any]:
    probe = (probe_text or "").strip()
    if len(probe) < 4:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Probe text too short")

    pid = _pair_id()
    now = _now_iso()
    record: dict[str, Any] = {
        "id": pid,
        "inviter": user.id,
        "probe_text": probe[:500],
        "inviter_answer": (inviter_answer or "").strip()[:MAX_ANSWER_LEN] or None,
        "invitee": None,
        "invitee_answer": None,
        "visibility_inviter": False,
        "visibility_invitee": False,
        "share_id": share_id,
        "created_at": now,
    }
    await set_json(redis, f"pair:{pid}", record)

    await emit_server_event(
        redis,
        user.id,
        "pair.created",
        {"pair_id": pid, "share_id": share_id},
    )
    return {"pair_id": pid, "pair_path": f"/pair/{pid}", "created_at": now}


async def get_pair(redis: Redis, pair_id: str, user: UserInDB | None) -> dict[str, Any]:
    record = await get_json(redis, f"pair:{pair_id}")
    if not record:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Pair session not found")

    user_id = user.id if user else None
    if user_id and not record.get("invitee") and record.get("inviter") != user_id:
        record["invitee"] = user_id
        await set_json(redis, f"pair:{pair_id}", record)

    return _view_for_user(record, user_id)


async def submit_pair_answer(
    redis: Redis,
    user: UserInDB,
    pair_id: str,
    answer: str,
) -> dict[str, Any]:
    record = await get_json(redis, f"pair:{pair_id}")
    if not record:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Pair session not found")

    text = (answer or "").strip()
    if not text:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Answer required")

    role = _role_for_user(record, user.id)
    if role is None:
        if not record.get("invitee"):
            record["invitee"] = user.id
            role = "invitee"
        else:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Pair is full")

    field = "inviter_answer" if role == "inviter" else "invitee_answer"
    record[field] = text[:MAX_ANSWER_LEN]
    record["updated_at"] = _now_iso()
    await set_json(redis, f"pair:{pair_id}", record)

    await emit_server_event(
        redis,
        user.id,
        "pair.answered",
        {"pair_id": pair_id, "role": role, "char_count": len(text)},
    )
    return _view_for_user(record, user.id)


async def set_pair_visibility(
    redis: Redis,
    user: UserInDB,
    pair_id: str,
    *,
    visible: bool,
) -> dict[str, Any]:
    record = await get_json(redis, f"pair:{pair_id}")
    if not record:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Pair session not found")

    role = _role_for_user(record, user.id)
    if role is None:
        if not record.get("invitee") and record.get("inviter") != user.id:
            record["invitee"] = user.id
            role = "invitee"
        else:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not a participant")

    key = "visibility_inviter" if role == "inviter" else "visibility_invitee"
    record[key] = bool(visible)
    record["updated_at"] = _now_iso()
    await set_json(redis, f"pair:{pair_id}", record)

    await emit_server_event(
        redis,
        user.id,
        "pair.visibility",
        {
            "pair_id": pair_id,
            "role": role,
            "visible": visible,
            "mutual": _can_see_peer(record, role),
        },
    )
    return _view_for_user(record, user.id)
