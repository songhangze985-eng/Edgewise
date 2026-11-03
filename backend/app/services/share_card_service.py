"""Shareable revision teaching cards (no PII on public reads)."""

from __future__ import annotations

import secrets
from datetime import datetime, timezone
from typing import Any

from fastapi import HTTPException, status
from redis.asyncio import Redis

from app.core.redis_client import get_json, set_json
from app.models.schemas import UserInDB
from app.research.pipeline import emit_server_event
from app.services.revision_feedback import GAP_LABELS, PROBE_BY_GAP

METHOD_BY_GAP: dict[str, str] = {
    "contribution": "解释个人贡献时，先区分团队目标和自己的具体行动。",
    "evidence": "补充结果时，尽量给出数字、周期、规模或具体方法，便于对方核查。",
    "structure": "重述经历时，可按「背景 → 任务 → 行动 → 结果」组织语言。",
    "causality": "说明关键决策时，讲清因为什么、采取了什么、最终产生了什么影响。",
    "relevance": "先点明题目在问什么，再给出与题眼直接相关的事例。",
}

MAX_EXCERPT_LEN = 80


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _share_id() -> str:
    return secrets.token_urlsafe(9).replace("-", "").replace("_", "")[:12]


def _find_question_in_session(session: dict[str, Any], qid: str) -> dict[str, Any] | None:
    for rnd in session.get("rounds") or []:
        for q in rnd.get("questions") or []:
            if q.get("id") == qid:
                return q
    return None


def _gap_from_question(question: dict[str, Any]) -> tuple[str, str, str]:
    rev = question.get("revision") or {}
    feedback = rev.get("feedback") or {}
    attempts = question.get("attempts") or []
    gap_key = feedback.get("gap_key") or feedback.get("gap_type")
    if not gap_key and attempts:
        last_fb = (attempts[-1].get("feedback") or {}) if attempts else {}
        gap_key = last_fb.get("gap_key") or last_fb.get("gap_type")
    if not gap_key:
        gap_key = "contribution"
    gap_key = str(gap_key)
    if gap_key not in METHOD_BY_GAP:
        gap_key = "contribution"
    method = METHOD_BY_GAP[gap_key]
    probe = (
        rev.get("feedback", {}).get("probe_question")
        or feedback.get("probe_question")
        or PROBE_BY_GAP.get(gap_key, PROBE_BY_GAP["contribution"])
    )
    return gap_key, method, probe


def _public_card(record: dict[str, Any]) -> dict[str, Any]:
    if record.get("revoked"):
        return {
            "share_id": record["id"],
            "revoked": True,
            "question_title": None,
            "gap_type": None,
            "gap_label": None,
            "method_text": None,
            "probe_text": None,
            "include_excerpt": False,
            "excerpt": None,
            "created_at": record.get("created_at"),
        }
    payload: dict[str, Any] = {
        "share_id": record["id"],
        "revoked": False,
        "question_title": record.get("question_title"),
        "gap_type": record.get("gap_type"),
        "gap_label": record.get("gap_label"),
        "method_text": record.get("method_text"),
        "probe_text": record.get("probe_text"),
        "include_excerpt": bool(record.get("include_excerpt")),
        "excerpt": record.get("excerpt") if record.get("include_excerpt") else None,
        "created_at": record.get("created_at"),
    }
    return payload


async def create_share_card(
    redis: Redis,
    user: UserInDB,
    *,
    session_id: str,
    question_id: str,
    include_excerpt: bool = False,
    excerpt: str | None = None,
) -> dict[str, Any]:
    session = await get_json(redis, f"session:{session_id}")
    if not session or session.get("user_id") != user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found")

    question = _find_question_in_session(session, question_id)
    if not question:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Question not found")

    rev = question.get("revision") or {}
    if not (rev.get("initial_answer") or rev.get("revised_answer") or question.get("answer")):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This question has no revision record to share",
        )

    gap_type, method_text, probe_text = _gap_from_question(question)
    clean_excerpt: str | None = None
    if include_excerpt and excerpt:
        clean_excerpt = excerpt.strip()[:MAX_EXCERPT_LEN]
        if not clean_excerpt:
            include_excerpt = False

    share_id = _share_id()
    now = _now_iso()
    record = {
        "id": share_id,
        "owner": user.id,
        "session_id": session_id,
        "qid": question_id,
        "question_title": (question.get("title") or "开放题")[:120],
        "gap_type": gap_type,
        "gap_label": GAP_LABELS.get(gap_type, gap_type),
        "method_text": method_text,
        "probe_text": probe_text,
        "include_excerpt": include_excerpt,
        "excerpt": clean_excerpt,
        "revoked": False,
        "created_at": now,
    }
    await set_json(redis, f"share:{share_id}", record)
    await redis.sadd(f"user:{user.id}:shares", share_id)

    await emit_server_event(
        redis,
        user.id,
        "share.card_created",
        {
            "share_id": share_id,
            "include_excerpt": include_excerpt,
            "gap_type": gap_type,
        },
    )
    return {
        "share_id": share_id,
        "share_path": f"/s/{share_id}",
        "include_excerpt": include_excerpt,
        "created_at": now,
    }


async def get_share_card_public(redis: Redis, share_id: str) -> dict[str, Any]:
    record = await get_json(redis, f"share:{share_id}")
    if not record:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Share card not found")
    return _public_card(record)


async def revoke_share_card(redis: Redis, user: UserInDB, share_id: str) -> dict[str, Any]:
    record = await get_json(redis, f"share:{share_id}")
    if not record:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Share card not found")
    if record.get("owner") != user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not your share card")

    record["revoked"] = True
    record["revoked_at"] = _now_iso()
    await set_json(redis, f"share:{share_id}", record)

    await emit_server_event(
        redis,
        user.id,
        "share.card_revoked",
        {"share_id": share_id},
    )
    return {"share_id": share_id, "revoked": True}
