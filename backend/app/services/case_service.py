"""Persist case / system design step progress on interview sessions."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from fastapi import HTTPException, status
from redis.asyncio import Redis

from app.core.redis_client import get_json, set_json
from app.models.schemas import UserInDB
from app.services.case_flow import (
    default_case_interviewer,
    step_ids_for_kind,
)
from app.services.research_service import emit_server_event


def _case_round_types() -> frozenset[str]:
    return frozenset({"case", "system_design"})


def _get_case_question(round_data: dict[str, Any]) -> dict[str, Any]:
    questions = round_data.get("questions") or []
    if not questions:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Case round has no question")
    return questions[0]


async def handle_case_clarify(
    redis: Redis,
    session_id: str,
    current_user: UserInDB,
    *,
    round_index: int,
    text: str,
) -> dict[str, Any]:
    session = await get_json(redis, f"session:{session_id}")
    if session is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found")
    if session["user_id"] != current_user.id and not current_user.is_admin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You do not have access to this session")

    rounds = session.get("rounds") or []
    if round_index >= len(rounds):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid round index")
    round_data = rounds[round_index]
    if round_data.get("type") not in _case_round_types():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Not a case round")

    question = _get_case_question(round_data)
    case_id = question.get("case_id")
    if not case_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Missing case_id")

    reply = default_case_interviewer.respond_clarification(case_id, text)
    log = list(question.get("clarifications_log") or [])
    log.append(
        {
            "question": (text or "").strip(),
            "reply": reply.get("reply"),
            "matched": reply.get("matched"),
            "ts": datetime.now(timezone.utc).isoformat(),
        }
    )
    question["clarifications_log"] = log[-30:]
    round_data["questions"] = [question]
    rounds[round_index] = round_data
    session["rounds"] = rounds
    session["updated_at"] = datetime.now(timezone.utc).isoformat()
    await set_json(redis, f"session:{session_id}", session)
    return {"round_index": round_index, **reply}


async def handle_case_step_complete(
    redis: Redis,
    session_id: str,
    current_user: UserInDB,
    *,
    round_index: int,
    step_id: str,
    answer: str,
    whiteboard_snapshot: dict[str, Any] | None = None,
) -> dict[str, Any]:
    session = await get_json(redis, f"session:{session_id}")
    if session is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found")
    if session["user_id"] != current_user.id and not current_user.is_admin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You do not have access to this session")

    rounds = session.get("rounds") or []
    if round_index >= len(rounds):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid round index")
    round_data = rounds[round_index]
    if round_data.get("type") not in _case_round_types():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Not a case round")

    question = _get_case_question(round_data)
    case_id = question.get("case_id")
    kind = question.get("kind") or round_data.get("type")
    if kind == "case":
        allowed = step_ids_for_kind("case")
    else:
        allowed = step_ids_for_kind("system_design")

    if step_id not in allowed:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid step id")

    evaluation = default_case_interviewer.evaluate_step(case_id, step_id, answer)
    steps = list(question.get("case_steps") or [])
    steps.append(
        {
            "step": step_id,
            "answer": (answer or "").strip(),
            "checklist": evaluation.get("checklist"),
            "score": evaluation.get("score"),
            "ts": datetime.now(timezone.utc).isoformat(),
        }
    )
    question["case_steps"] = steps
    if whiteboard_snapshot is not None:
        question["whiteboard_snapshot"] = whiteboard_snapshot

    step_index = allowed.index(step_id)
    next_index = min(step_index + 1, len(allowed) - 1)
    if step_index < len(allowed) - 1:
        question["current_step_index"] = step_index + 1
    else:
        question["current_step_index"] = step_index
        scores = [s.get("score") for s in steps if isinstance(s.get("score"), (int, float))]
        if scores:
            question["score"] = round(sum(scores) / len(scores), 1)
            round_data["score"] = question["score"]
            round_data["completed_count"] = 1

    round_data["questions"] = [question]
    rounds[round_index] = round_data
    session["rounds"] = rounds
    session["updated_at"] = datetime.now(timezone.utc).isoformat()
    await set_json(redis, f"session:{session_id}", session)

    await emit_server_event(
        redis,
        session["user_id"],
        "case.step_completed",
        {
            "session_id": session_id,
            "round_index": round_index,
            "step_id": step_id,
            "case_id": case_id,
            "score": evaluation.get("score"),
            "checklist_passed": evaluation.get("passed"),
            "checklist_total": evaluation.get("total"),
        },
    )

    next_step = allowed[question["current_step_index"]] if question["current_step_index"] < len(allowed) else None
    done = step_index >= len(allowed) - 1
    next_prompt = (
        default_case_interviewer.prompt_for_step(case_id, next_step) if next_step and not done else None
    )
    return {
        "round_index": round_index,
        "step_id": step_id,
        "evaluation": evaluation,
        "done": done,
        "next_step_id": next_step if not done else None,
        "next_prompt": next_prompt,
        "round_score": round_data.get("score"),
        "data_tables": default_case_interviewer.data_tables_for_case(case_id)
        if step_id in ("data", "estimation")
        else [],
    }
