"""Persist answer attempts and revision decisions on interview session questions."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any
from uuid import uuid4

from fastapi import HTTPException, status
from redis.asyncio import Redis

from app.core.redis_client import get_json, set_json
from app.models.schemas import UserInDB
from app.research.pipeline import emit_server_event
from app.services.answer_validity import assess_answer
from app.services.logic_scorer import score_logic_answer
from app.services.professional_scorer import score_professional_answer
from app.services.revision_feedback import OPEN_TYPES, default_feedback_provider


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _find_question(
    session: dict[str, Any],
    qid: str,
    *,
    round_index: int | None,
    question_index: int | None,
) -> tuple[int, int, dict[str, Any]] | None:
    rounds = session.get("rounds") or []
    if round_index is not None and question_index is not None:
        if round_index < len(rounds):
            questions = rounds[round_index].get("questions") or []
            if question_index < len(questions):
                q = questions[question_index]
                if q.get("id") == qid:
                    return round_index, question_index, q
        return None

    for ri, rnd in enumerate(rounds):
        for qi, q in enumerate(rnd.get("questions") or []):
            if q.get("id") == qid:
                return ri, qi, q
    return None


def _session_assigned(session: dict[str, Any]) -> bool:
    meta = session.get("metadata") or {}
    return meta.get("source") == "experiment_assigned_practice"


async def _bump_revision_stats(
    redis: Redis,
    user_id: str,
    *,
    field: str,
    increment: int = 1,
) -> None:
    key = f"user:{user_id}:revision_stats"
    await redis.hincrby(key, field, increment)
    await redis.hset(key, "updated_at", _now_iso())


def _recompute_round_score(round_data: dict) -> None:
    scores = [
        float(q["score"])
        for q in round_data.get("questions") or []
        if q.get("answer") is not None
        and str(q.get("answer")).strip()
        and isinstance(q.get("score"), (int, float))
    ]
    round_data["completed_count"] = len(scores)
    round_data["score"] = round(sum(scores) / len(scores), 1) if scores else None


def _apply_answer_score(question: dict, answer_text: str, *, stt_failed: bool = False) -> None:
    qtype = question.get("type") or "professional"
    validity = assess_answer(answer_text, stt_failed=stt_failed)
    question["answer"] = answer_text
    question["answer_valid"] = validity["answer_valid"]
    question["invalid_reason"] = validity["invalid_reason"]

    if not validity["answer_valid"]:
        if validity["score"] is None:
            question["score"] = None
            question["logic_score"] = None
            question["logic_rule_version"] = None
        elif qtype in OPEN_TYPES:
            logic = score_logic_answer(
                answer_text,
                question_title=question.get("title") or "",
                keywords=question.get("keywords") or [],
                lang=question.get("lang"),
            )
            question["logic_score"] = logic
            question["logic_rule_version"] = logic["logic_rule_version"]
            question["score"] = float(logic["total"])
        else:
            question["score"] = float(validity["score"])
            question["logic_score"] = None
            question["logic_rule_version"] = None
    elif qtype in OPEN_TYPES:
        logic = score_logic_answer(
            answer_text,
            question_title=question.get("title") or "",
            keywords=question.get("keywords") or [],
            lang=question.get("lang"),
        )
        question["logic_score"] = logic
        question["logic_rule_version"] = logic["logic_rule_version"]
        question["score"] = float(logic["total"])
    else:
        score, _reason = score_professional_answer(answer_text)
        question["score"] = score
        question["logic_score"] = None
        question["logic_rule_version"] = None


async def record_question_attempt(
    redis: Redis,
    session_id: str,
    qid: str,
    current_user: UserInDB,
    *,
    round_index: int,
    question_index: int,
    answer_text: str,
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
    qtype = question.get("type") or "professional"
    assigned = _session_assigned(session)

    attempts: list[dict[str, Any]] = list(question.get("attempts") or [])
    attempt_id = uuid4().hex
    ts = _now_iso()
    attempt = {
        "id": attempt_id,
        "answer_text": answer_text,
        "stt_failed": stt_failed,
        "created_at": ts,
        "kind": "initial" if not attempts else "resubmit",
    }
    if speech is not None:
        attempt["speech"] = speech
    if delivery is not None:
        attempt["delivery"] = delivery
    attempts.append(attempt)
    question["attempts"] = attempts

    _apply_answer_score(question, answer_text, stt_failed=stt_failed)
    if speech is not None:
        question["speech"] = speech
    if delivery is not None:
        question["delivery"] = delivery

    feedback = None
    revision: dict[str, Any] | None = question.get("revision")
    if revision is None and qtype in OPEN_TYPES and (answer_text or "").strip() and not stt_failed:
        try:
            feedback = default_feedback_provider.build(
                answer_text=answer_text,
                question_title=question.get("title") or "",
                keywords=question.get("keywords") or [],
                question_type=qtype,
            )
        except Exception:
            feedback = None

        if feedback:
            revision = {
                "status": "feedback_ready",
                "assigned": assigned,
                "initial_answer": answer_text,
                "feedback": feedback,
                "feedback_shown_at": None,
                "decision": None,
                "decline_reason": None,
                "revised_answer": None,
                "probe_answer": None,
                "skipped": False,
                "created_at": ts,
            }
            question["revision"] = revision

    rounds = session.get("rounds") or []
    _recompute_round_score(rounds[ri])
    session["rounds"] = rounds
    session["updated_at"] = ts
    await set_json(redis, f"session:{session_id}", session)

    await _bump_revision_stats(redis, session["user_id"], field="attempts_total")
    if feedback:
        await _bump_revision_stats(redis, session["user_id"], field="feedback_generated")

    return {
        "session_id": session_id,
        "question_id": qid,
        "round_index": ri,
        "question_index": qi,
        "attempt_id": attempt_id,
        "score": question.get("score"),
        "logic_score": question.get("logic_score"),
        "feedback": feedback,
        "revision": revision,
        "assigned": assigned,
    }


async def apply_revision_decision(
    redis: Redis,
    session_id: str,
    qid: str,
    current_user: UserInDB,
    *,
    round_index: int,
    question_index: int,
    decision: str,
    revised_text: str | None = None,
    decline_reason: str | None = None,
    probe_answer: str | None = None,
    feedback_viewed: bool = False,
    skip: bool = False,
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
    ts = _now_iso()
    revision: dict[str, Any] = dict(question.get("revision") or {})

    if skip or not revision:
        question["revision"] = None
        rounds = session.get("rounds") or []
        session["rounds"] = rounds
        session["updated_at"] = ts
        await set_json(redis, f"session:{session_id}", session)
        return {"session_id": session_id, "question_id": qid, "revision": None, "assigned": assigned}

    if feedback_viewed and not revision.get("feedback_shown_at"):
        revision["feedback_shown_at"] = ts

    props_base = {
        "session_id": session_id,
        "question_id": qid,
        "round_index": ri,
        "question_index": qi,
        "assigned": assigned,
        "gap_key": (revision.get("feedback") or {}).get("gap_key"),
    }

    if decision == "decline":
        reason = (decline_reason or "").strip()
        if not reason:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Decline requires a reason")
        revision["decision"] = "decline"
        revision["decline_reason"] = reason
        revision["status"] = "declined"
        revision["completed_at"] = ts
        if probe_answer and probe_answer.strip():
            revision["probe_answer"] = probe_answer.strip()
        question["revision"] = revision
        await _bump_revision_stats(redis, session["user_id"], field="declined_total")
        if not assigned:
            await emit_server_event(
                redis,
                session["user_id"],
                "revision.decision",
                {**props_base, "decision": "decline"},
            )
            await emit_server_event(
                redis,
                session["user_id"],
                "feedback.reject",
                {**props_base, "reason": reason},
            )
            if probe_answer and probe_answer.strip():
                await emit_server_event(
                    redis,
                    session["user_id"],
                    "revision.probe_answered",
                    {**props_base, "source": "after_decline"},
                )
                await emit_server_event(
                    redis,
                    session["user_id"],
                    "interview.followup.answer",
                    props_base,
                )

    elif decision == "revise":
        text = (revised_text or "").strip()
        if not text:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Revised answer required")
        revision["decision"] = "revise"
        revision["revised_answer"] = text
        revision["status"] = "revised"
        revision["completed_at"] = ts
        if probe_answer and probe_answer.strip():
            revision["probe_answer"] = probe_answer.strip()

        attempts = list(question.get("attempts") or [])
        attempts.append(
            {
                "id": uuid4().hex,
                "answer_text": text,
                "stt_failed": False,
                "created_at": ts,
                "kind": "revision",
            }
        )
        question["attempts"] = attempts
        _apply_answer_score(question, text, stt_failed=False)
        question["revision"] = revision

        await _bump_revision_stats(redis, session["user_id"], field="revised_total")
        if not assigned:
            await emit_server_event(
                redis,
                session["user_id"],
                "revision.decision",
                {**props_base, "decision": "revise"},
            )
            await emit_server_event(
                redis,
                session["user_id"],
                "revision.submitted",
                props_base,
            )
            await emit_server_event(
                redis,
                session["user_id"],
                "answer.revise",
                props_base,
            )
            if probe_answer and probe_answer.strip():
                await emit_server_event(
                    redis,
                    session["user_id"],
                    "revision.probe_answered",
                    {**props_base, "source": "after_revise"},
                )
                await emit_server_event(
                    redis,
                    session["user_id"],
                    "interview.followup.answer",
                    props_base,
                )
    else:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid decision")

    if feedback_viewed and not assigned:
        await emit_server_event(
            redis,
            session["user_id"],
            "revision.feedback_shown",
            props_base,
        )
        await emit_server_event(
            redis,
            session["user_id"],
            "feedback.view",
            props_base,
        )

    rounds = session.get("rounds") or []
    _recompute_round_score(rounds[ri])
    session["rounds"] = rounds
    session["updated_at"] = ts
    await set_json(redis, f"session:{session_id}", session)

    return {
        "session_id": session_id,
        "question_id": qid,
        "round_index": ri,
        "question_index": qi,
        "revision": question.get("revision"),
        "score": question.get("score"),
        "logic_score": question.get("logic_score"),
        "assigned": assigned,
    }
