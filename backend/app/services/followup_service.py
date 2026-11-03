"""Persist and generate interview follow-up chains on session questions."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from fastapi import HTTPException, status
from redis.asyncio import Redis

from app.core.redis_client import get_json, set_json
from app.models.schemas import UserInDB
from app.research.pipeline import emit_server_event
from app.services.answer_validity import assess_answer
from app.services.followup_engine import (
    OPEN_TYPES,
    _build_context_text,
    default_followup_provider,
    effective_max_layers,
    followup_experiment_limits,
    gap_is_filled,
    next_followup_layer,
    pick_followup_gap,
    revision_probe_gap,
    revision_probe_text,
)
from app.services.revision_service import _find_question, _session_assigned


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


async def _resume_snippet(redis: Redis, session: dict[str, Any]) -> str | None:
    meta = session.get("metadata") or {}
    resume_id = meta.get("resume_id")
    if not resume_id:
        return None
    resume = await get_json(redis, f"resume:{resume_id}")
    if not resume:
        return None
    preview = (resume.get("preview_text") or "").strip()
    if preview:
        return preview[:120]
    parsed = resume.get("parsed_data") or {}
    projects = parsed.get("projects") or []
    if projects and isinstance(projects[0], dict):
        name = (projects[0].get("name") or projects[0].get("title") or "").strip()
        if name:
            return name[:80]
    return None


def _pending_followup(followups: list[dict[str, Any]]) -> dict[str, Any] | None:
    if not followups:
        return None
    last = followups[-1]
    if (last.get("text") or "").strip() and not (last.get("answer") or "").strip():
        return last
    return None


async def handle_question_followup(
    redis: Redis,
    session_id: str,
    qid: str,
    current_user: UserInDB,
    *,
    round_index: int,
    question_index: int,
    answer_text: str | None = None,
    stt_failed: bool = False,
    speech: dict[str, Any] | None = None,
    delivery: dict[str, Any] | None = None,
) -> dict[str, Any]:
    session = await get_json(redis, f"session:{session_id}")
    if session is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found")
    if session["user_id"] != current_user.id and not current_user.is_admin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You do not have access to this session")

    located = _find_question(
        session,
        qid,
        round_index=round_index,
        question_index=question_index,
    )
    if located is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Question not found in session")

    ri, qi, question = located
    assigned = _session_assigned(session)
    qtype = question.get("type") or "professional"
    ts = _now_iso()
    followups: list[dict[str, Any]] = list(question.get("followups") or [])

    user_data = await get_json(redis, f"user:{session['user_id']}") or {}
    meta = session.get("metadata") or {}
    exp_limits = followup_experiment_limits(user_data, meta)
    max_layers = effective_max_layers(
        followup_intensity=meta.get("followup_intensity"),
        difficulty=session.get("difficulty"),
        experiment_max=exp_limits.get("max_layers"),
        enabled=bool(exp_limits.get("enabled")),
    )

    props_base = {
        "session_id": session_id,
        "question_id": qid,
        "round_index": ri,
        "question_index": qi,
        "assigned": assigned,
    }

    if max_layers <= 0 or qtype not in OPEN_TYPES:
        return {"followup": None, "followups": followups, "assigned": assigned}

    main_answer = (question.get("answer") or "").strip()
    if not main_answer:
        return {"followup": None, "followups": followups, "assigned": assigned}

    if question.get("answer_valid") is False:
        return {"followup": None, "followups": followups, "assigned": assigned}

    pending = _pending_followup(followups)
    if answer_text is not None:
        text = (answer_text or "").strip()
        validity = assess_answer(text, stt_failed=stt_failed)
        if pending is None and followups:
            pending = followups[-1] if not (followups[-1].get("answer") or "").strip() else None

        if pending is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="No pending follow-up to answer",
            )

        pending["answer"] = text if text else None
        pending["answered_at"] = ts
        pending["answer_valid"] = validity["answer_valid"]
        pending["stt_failed"] = stt_failed
        if speech is not None:
            pending["speech"] = speech
        if delivery is not None:
            pending["delivery"] = delivery

        if not validity["answer_valid"]:
            question["followups"] = followups
            session["rounds"][ri]["questions"][qi] = question
            session["updated_at"] = ts
            await set_json(redis, f"session:{session_id}", session)
            if not assigned:
                await emit_server_event(
                    redis,
                    session["user_id"],
                    "followup.answered",
                    {**props_base, "layer": pending.get("layer"), "valid": False},
                )
            return {"followup": None, "followups": followups, "assigned": assigned}

        if not assigned:
            await emit_server_event(
                redis,
                session["user_id"],
                "followup.answered",
                {
                    **props_base,
                    "layer": pending.get("layer"),
                    "gap_type": pending.get("gap_type"),
                    "valid": True,
                },
            )

        gap_key = pending.get("gap_type") or ""
        context = _build_context_text(main_answer, followups)
        if gap_key and not gap_is_filled(
            context,
            gap_key,
            question_title=question.get("title") or "",
            keywords=question.get("keywords") or [],
        ):
            question["followups"] = followups
            session["rounds"][ri]["questions"][qi] = question
            session["updated_at"] = ts
            await set_json(redis, f"session:{session_id}", session)
            return {"followup": None, "followups": followups, "assigned": assigned}

        question["followups"] = followups
        session["rounds"][ri]["questions"][qi] = question
        session["updated_at"] = ts
        await set_json(redis, f"session:{session_id}", session)
        pending = None

    elif pending is not None:
        layer = int(pending.get("layer") or 1)
        followup_payload = {
            "layer": layer,
            "gap_type": pending.get("gap_type"),
            "text": pending.get("text"),
        }
        return {"followup": followup_payload, "followups": followups, "assigned": assigned}

    answered_layers = len([f for f in followups if (f.get("answer") or "").strip()])
    if answered_layers >= max_layers:
        return {"followup": None, "followups": followups, "assigned": assigned}

    layer = next_followup_layer(followups)
    if layer > max_layers:
        return {"followup": None, "followups": followups, "assigned": assigned}

    context = _build_context_text(main_answer, followups)
    exclude: set[str] = {str(f.get("gap_type")) for f in followups if f.get("gap_type")}
    if exp_limits.get("merge_revision_probe"):
        probed = revision_probe_gap(question)
        if probed:
            exclude.add(probed)

    gap_type = pick_followup_gap(
        context,
        question_title=question.get("title") or "",
        keywords=question.get("keywords") or [],
        exclude=exclude,
    )
    if not gap_type:
        return {"followup": None, "followups": followups, "assigned": assigned}

    resume_snippet = await _resume_snippet(redis, session)
    text = default_followup_provider.build(
        layer=layer,
        gap_type=gap_type,
        question_title=question.get("title") or "",
        answer_context=context,
        keywords=question.get("keywords") or [],
        resume_snippet=resume_snippet,
    )
    if not text:
        return {"followup": None, "followups": followups, "assigned": assigned}

    if exp_limits.get("merge_revision_probe") and layer == 1:
        probe_text = revision_probe_text(question)
        if probe_text and probe_text.strip() == text.strip():
            return {"followup": None, "followups": followups, "assigned": assigned}

    entry = {
        "layer": layer,
        "gap_type": gap_type,
        "text": text,
        "answer": None,
        "ts": ts,
    }
    followups.append(entry)
    question["followups"] = followups
    session["rounds"][ri]["questions"][qi] = question
    session["updated_at"] = ts
    await set_json(redis, f"session:{session_id}", session)

    if not assigned:
        await emit_server_event(
            redis,
            session["user_id"],
            "followup.shown",
            {**props_base, "layer": layer, "gap_type": gap_type},
        )

    return {
        "followup": {"layer": layer, "gap_type": gap_type, "text": text},
        "followups": followups,
        "assigned": assigned,
    }
