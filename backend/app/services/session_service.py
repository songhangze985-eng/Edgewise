from __future__ import annotations

from datetime import datetime, timezone
from typing import Any
from uuid import uuid4

from fastapi import HTTPException, status
from redis.asyncio import Redis

from app.core.redis_client import get_json, set_json
from app.models.schemas import InterviewSessionComplete, InterviewSessionCreate, SessionResponse, UserInDB
from app.research.pipeline import emit_server_event
from app.services.answer_validity import assess_answer
from app.services.interview_config import ROUND_WEIGHTS
from app.services.interview_rounds import build_session_rounds, normalize_round_configs
from app.services.job_service import get_job_for_user, match_job_to_resume
from app.services.logic_scorer import score_logic_answer
from app.services.hr_scorer import apply_hr_consistency, score_hr_answer
from app.services.negotiation_engine import load_negotiation_script, process_negotiation_turn
from app.services.professional_scorer import score_professional_answer
from app.services.research_service import merge_client_metadata_for_session, record_session_completion
from app.services.reverse_question_scorer import score_reverse_batch
from app.services.lgd_scorer import score_lgd_discussion
from app.services.structured_scorer import score_structured_answer
from app.services.structured_session import build_structured_session_rounds


def _now_strings() -> tuple[str, str, str]:
    now = datetime.now(timezone.utc)
    return now.isoformat(), now.date().isoformat(), now.strftime("%H:%M")


def _build_session_topic(payload: InterviewSessionCreate) -> str:
    if payload.topic:
        return payload.topic
    if payload.position:
        return f"{payload.position} 模拟面试"
    return "AI 面试训练"


def _compute_weighted_final(rounds: list[dict]) -> float | None:
    scored = [(i, r) for i, r in enumerate(rounds) if isinstance(r.get("score"), (int, float))]
    if not scored:
        return None
    total_weight = 0.0
    weighted = 0.0
    for idx, rnd in scored:
        w = ROUND_WEIGHTS[idx] if idx < len(ROUND_WEIGHTS) else ROUND_WEIGHTS[-1]
        total_weight += w
        weighted += w * float(rnd["score"])
    if total_weight <= 0:
        return None
    return round(weighted / total_weight, 1)


def _aggregate_logicality(rounds: list[dict]) -> float:
    totals: list[float] = []
    for rnd in rounds:
        for q in rnd.get("questions") or []:
            ls = q.get("logic_score") or {}
            if isinstance(ls, dict) and isinstance(ls.get("total"), (int, float)):
                totals.append(float(ls["total"]))
    if not totals:
        return 0.0
    return round(sum(totals) / len(totals), 1)


def _recompute_round_score(round_data: dict) -> None:
    if round_data.get("type") == "negotiation":
        neg = round_data.get("negotiation") or {}
        if neg.get("outcome") and isinstance(round_data.get("score"), (int, float)):
            round_data["completed_count"] = len(neg.get("turns") or [])
            return
        turns = neg.get("turns") or []
        turn_scores = [
            float(t.get("evaluation", {}).get("turn_score"))
            for t in turns
            if isinstance(t.get("evaluation", {}).get("turn_score"), (int, float))
        ]
        round_data["completed_count"] = len(turns)
        round_data["score"] = round(sum(turn_scores) / len(turn_scores), 1) if turn_scores else None
        return

    scores = [
        float(q["score"])
        for q in round_data.get("questions") or []
        if q.get("answer") is not None
        and str(q.get("answer")).strip()
        and isinstance(q.get("score"), (int, float))
    ]
    declined = [
        q
        for q in round_data.get("questions") or []
        if q.get("declined") and q.get("score") is None
    ]
    round_data["completed_count"] = len(scores) + len(declined)
    round_data["score"] = round(sum(scores) / len(scores), 1) if scores else None


def _compute_score_status(rounds: list[dict] | None) -> str:
    if not rounds:
        return "insufficient"
    answered = 0
    valid_count = 0
    for rnd in rounds:
        for q in rnd.get("questions") or []:
            ans = q.get("answer")
            if ans is None or not str(ans).strip():
                continue
            answered += 1
            if q.get("answer_valid") is True:
                valid_count += 1
    if answered == 0 or valid_count == 0:
        return "insufficient"
    return "ok"


def _score_status_from_transcript(transcript: list[dict] | None) -> str:
    if not transcript:
        return "insufficient"
    user_lines = [str(m.get("text") or "").strip() for m in transcript if m.get("role") == "user"]
    user_lines = [t for t in user_lines if t]
    if not user_lines:
        return "insufficient"
    if all(not assess_answer(t)["answer_valid"] for t in user_lines):
        return "insufficient"
    return "ok"


async def create_interview_session(
    redis: Redis,
    current_user: UserInDB,
    payload: InterviewSessionCreate,
) -> SessionResponse:
    created_at, date_value, time_value = _now_strings()
    session_id = uuid4().hex
    user_data = await get_json(redis, f"user:{current_user.id}") or current_user.model_dump()
    metadata = merge_client_metadata_for_session(user_data, payload.metadata)
    if payload.job_id:
        metadata["job_id"] = payload.job_id
    experiment_arm = metadata.get("experiment_arm") or (
        (user_data.get("experiment_assignment") or {}).get("arm")
    )

    round_configs = normalize_round_configs(
        [r.model_dump() for r in payload.rounds] if payload.rounds else None,
        experiment_arm=experiment_arm,
    )
    resume_id = metadata.get("resume_id")
    job_id = metadata.get("job_id") or payload.job_id
    session_position = payload.position
    jd_match: dict[str, Any] | None = None

    if job_id:
        job = await get_job_for_user(redis, current_user.id, job_id)
        if not session_position and (job.get("title") or "").strip():
            session_position = job["title"].strip()
        if resume_id:
            jd_match = await match_job_to_resume(
                redis, current_user.id, job_id, resume_id, emit_event=False
            )
        await emit_server_event(
            redis,
            current_user.id,
            "jd.used_in_session",
            {
                "job_id": job_id,
                "resume_id": resume_id,
                "session_id": session_id,
            },
        )

    session_rounds: list[dict] | None = None
    rounds_notice: str | None = None

    exp_prompts = metadata.get("experience_practice_questions")
    if (
        payload.type == "interview"
        and isinstance(exp_prompts, list)
        and exp_prompts
    ):
        from app.services.experience_service import build_experience_practice_rounds

        session_rounds = build_experience_practice_rounds(exp_prompts)

    if payload.type == "interview" and metadata.get("mode") == "structured":
        structured_cfg = metadata.get("structured") or {}
        session_rounds, rounds_notice = await build_structured_session_rounds(redis, structured_cfg)
        if session_rounds:
            metadata["structured"] = {
                **structured_cfg,
                "question_ids": [
                    q["id"]
                    for rnd in session_rounds
                    for q in (rnd.get("questions") or [])
                ],
            }
    elif payload.type == "interview" and not metadata.get("question_ids") and not session_rounds:
        session_rounds, rounds_notice = await build_session_rounds(
            redis,
            current_user.id,
            round_configs,
            resume_id=resume_id,
            difficulty=payload.difficulty,
            interview_type=metadata.get("interview_type"),
            position=session_position,
            jd_match=jd_match,
            negotiation_prefs=metadata.get("negotiation_prefs"),
            session_lang=metadata.get("lang"),
        )
        if rounds_notice:
            metadata["rounds_notice"] = rounds_notice
            if "放宽" in rounds_notice:
                await emit_server_event(
                    redis,
                    current_user.id,
                    "question.pool_relaxed",
                    {
                        "session_id": session_id,
                        "notice": rounds_notice,
                        "interview_type": metadata.get("interview_type"),
                        "position": payload.position,
                        "difficulty": payload.difficulty,
                    },
                )

    session_record = {
        "id": session_id,
        "user_id": current_user.id,
        "type": payload.type,
        "position": session_position,
        "difficulty": payload.difficulty,
        "topic": payload.topic or (f"{session_position} 模拟面试" if session_position else _build_session_topic(payload)),
        "question_id": payload.question_id,
        "status": "in_progress",
        "score": None,
        "duration_minutes": None,
        "date": date_value,
        "time": time_value,
        "created_at": created_at,
        "updated_at": created_at,
        "completed_at": None,
        "rounds": session_rounds,
        "metadata": metadata,
    }

    await set_json(redis, f"session:{session_id}", session_record)
    await redis.zadd(
        f"user:{current_user.id}:sessions",
        {session_id: datetime.now(timezone.utc).timestamp()},
    )
    metadata = session_record.get("metadata") or {}
    await emit_server_event(
        redis,
        current_user.id,
        "interview.session.created",
        {
            "session_id": session_id,
            "task_id": metadata.get("task_id"),
            "position": session_record.get("position"),
        },
    )
    if metadata.get("lang"):
        await emit_server_event(
            redis,
            current_user.id,
            "interview.lang",
            {
                "session_id": session_id,
                "lang": metadata.get("lang"),
            },
        )
    if session_rounds:
        await emit_server_event(
            redis,
            current_user.id,
            "interview.rounds.configured",
            {
                "session_id": session_id,
                "round_count": len(session_rounds),
                "rounds": [
                    {
                        "name": r["name"],
                        "question_count": len(r.get("questions") or []),
                    }
                    for r in session_rounds
                ],
            },
        )
    return SessionResponse.model_validate(session_record)


def _store_delivery_fields(
    question: dict,
    *,
    speech: dict | None,
    delivery: dict | None,
    presence: dict | None = None,
) -> None:
    if speech is not None:
        question["speech"] = speech
    if delivery is not None:
        question["delivery"] = delivery
    if presence is not None:
        question["presence"] = presence


async def score_interview_answer(
    redis: Redis,
    session_id: str,
    current_user: UserInDB,
    *,
    round_index: int,
    question_index: int,
    answer_text: str,
    stt_failed: bool = False,
    declined_personal: bool = False,
    speech: dict | None = None,
    delivery: dict | None = None,
    presence: dict | None = None,
    take_no: int | None = None,
    takes_used: int | None = None,
) -> dict:
    session = await get_json(redis, f"session:{session_id}")
    if session is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found")
    if session["user_id"] != current_user.id and not current_user.is_admin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You do not have access to this session")

    rounds = session.get("rounds") or []
    if round_index >= len(rounds):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid round index")
    questions = rounds[round_index].get("questions") or []
    if question_index >= len(questions):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid question index")

    question = questions[question_index]
    qtype = question.get("type") or "professional"
    if declined_personal and qtype == "hr" and question.get("declinable"):
        question["answer"] = None
        question["declined"] = True
        question["score"] = None
        question["logic_score"] = None
        question["logic_rule_version"] = None
        question["answer_valid"] = True
        question["invalid_reason"] = None
        _recompute_round_score(rounds[round_index])
        session["rounds"] = rounds
        session["updated_at"] = datetime.now(timezone.utc).isoformat()
        await set_json(redis, f"session:{session_id}", session)
        return {
            "round_index": round_index,
            "question_index": question_index,
            "type": qtype,
            "score": None,
            "declined": True,
        }

    question["answer"] = answer_text
    question["declined"] = False
    _store_delivery_fields(question, speech=speech, delivery=delivery, presence=presence)
    session_meta = session.get("metadata") or {}
    interview_lang = session_meta.get("lang") or question.get("lang")
    if session_meta.get("mode") == "one_way" or session_meta.get("interview_mode") == "one_way":
        if take_no is not None:
            question["final_take_no"] = take_no
        if takes_used is not None:
            question["takes_used"] = takes_used
        elif take_no is not None:
            question["takes_used"] = take_no

    validity = assess_answer(answer_text, stt_failed=stt_failed)
    question["answer_valid"] = validity["answer_valid"]
    question["invalid_reason"] = validity["invalid_reason"]

    if not validity["answer_valid"]:
        if validity["score"] is None:
            question["score"] = None
            question["logic_score"] = None
            question["logic_rule_version"] = None
        elif qtype == "structured":
            structured_cfg = session_meta.get("structured") or {}
            panel_size = int(structured_cfg.get("panel_size") or 5)
            structured_result = score_structured_answer(
                answer_text,
                structured_category=question.get("structured_category"),
                question_title=question.get("title") or "",
                panel_size=panel_size,
                session_id=session_id,
                question_index=question_index,
            )
            question["structured_score"] = structured_result
            question["structured_rule_version"] = structured_result["structured_rule_version"]
            question["score"] = float(structured_result["panel_final"])
            question["logic_score"] = None
            question["logic_rule_version"] = None
        elif qtype in ("general", "resume_specific", "hr"):
            logic = score_logic_answer(
                answer_text,
                question_title=question.get("title") or "",
                keywords=question.get("keywords") or [],
                lang=interview_lang,
            )
            question["logic_score"] = logic
            question["logic_rule_version"] = logic["logic_rule_version"]
            question["score"] = float(logic["total"])
            if qtype == "hr":
                meta = session.setdefault("metadata", {})
                signals = meta.setdefault("hr_consistency_signals", {})
                adj = apply_hr_consistency(
                    {"theme": question.get("theme"), "answer": answer_text},
                    signals,
                )
                question["score"] = max(0.0, min(100.0, float(logic["total"]) + adj))
                meta["hr_consistency_signals"] = signals
        else:
            question["score"] = float(validity["score"])
            question["logic_score"] = None
            question["logic_rule_version"] = None
        await emit_server_event(
            redis,
            session["user_id"],
            "question.invalid",
            {
                "session_id": session_id,
                "round_index": round_index,
                "question_index": question_index,
                "reason": validity["invalid_reason"],
                "type": qtype,
            },
        )
    elif qtype == "hr":
        meta = session.setdefault("metadata", {})
        signals = meta.setdefault("hr_consistency_signals", {})
        hr_result = score_hr_answer(
            answer_text,
            question_title=question.get("title") or "",
            keywords=question.get("keywords") or [],
            theme=question.get("theme") or "motivation",
            session_signals=signals,
            declined=False,
        )
        question["logic_score"] = hr_result.get("logic_score")
        question["logic_rule_version"] = hr_result.get("logic_rule_version")
        question["score"] = hr_result.get("score")
        meta["hr_consistency_signals"] = signals
    elif qtype in ("general", "resume_specific"):
        logic = score_logic_answer(
            answer_text,
            question_title=question.get("title") or "",
            keywords=question.get("keywords") or [],
            lang=interview_lang,
        )
        question["logic_score"] = logic
        question["logic_rule_version"] = logic["logic_rule_version"]
        question["score"] = float(logic["total"])
    elif qtype == "structured":
        structured_cfg = session_meta.get("structured") or {}
        panel_size = int(structured_cfg.get("panel_size") or 5)
        structured_result = score_structured_answer(
            answer_text,
            structured_category=question.get("structured_category"),
            question_title=question.get("title") or "",
            panel_size=panel_size,
            session_id=session_id,
            question_index=question_index,
        )
        question["structured_score"] = structured_result
        question["structured_rule_version"] = structured_result["structured_rule_version"]
        question["score"] = float(structured_result["panel_final"])
        question["logic_score"] = None
        question["logic_rule_version"] = None
        await emit_server_event(
            redis,
            session["user_id"],
            "structured.category_score",
            {
                "session_id": session_id,
                "round_index": round_index,
                "question_index": question_index,
                "category": structured_result.get("category"),
                "panel_final": structured_result.get("panel_final"),
                "simulated": True,
            },
        )
    else:
        score, _reason = score_professional_answer(answer_text)
        question["score"] = score
        question["logic_score"] = None
        question["logic_rule_version"] = None

    _recompute_round_score(rounds[round_index])
    session["rounds"] = rounds
    session["updated_at"] = datetime.now(timezone.utc).isoformat()
    await set_json(redis, f"session:{session_id}", session)

    await emit_server_event(
        redis,
        session["user_id"],
        "question.type",
        {"session_id": session_id, "type": qtype, "round_index": round_index},
    )
    payload: dict[str, Any] = {
        "round_index": round_index,
        "question_index": question_index,
        "type": qtype,
        "score": question["score"],
        "logic_score": question.get("logic_score"),
    }
    if qtype == "structured":
        payload["structured_score"] = question.get("structured_score")
    return payload


async def post_negotiation_turn(
    redis: Redis,
    session_id: str,
    current_user: UserInDB,
    *,
    round_index: int,
    message: str,
) -> dict:
    session = await get_json(redis, f"session:{session_id}")
    if session is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found")
    if session["user_id"] != current_user.id and not current_user.is_admin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You do not have access to this session")

    rounds = session.get("rounds") or []
    if round_index >= len(rounds):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid round index")
    round_data = rounds[round_index]
    if round_data.get("type") != "negotiation":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Round is not a negotiation round")

    negotiation = dict(round_data.get("negotiation") or {})
    result = process_negotiation_turn(negotiation, message)
    round_data["negotiation"] = negotiation
    if result.get("done") and result.get("round_score") is not None:
        round_data["score"] = result["round_score"]
    _recompute_round_score(round_data)
    if result.get("done") and round_data.get("score") is None and result.get("round_score") is not None:
        round_data["score"] = result["round_score"]
    rounds[round_index] = round_data
    session["rounds"] = rounds
    session["updated_at"] = datetime.now(timezone.utc).isoformat()
    await set_json(redis, f"session:{session_id}", session)

    await emit_server_event(
        redis,
        session["user_id"],
        "negotiation.turn",
        {
            "session_id": session_id,
            "round_index": round_index,
            "turn_index": len(negotiation.get("turns") or []) - 1,
            "state": result.get("state"),
            "done": result.get("done"),
        },
    )
    if result.get("done"):
        await emit_server_event(
            redis,
            session["user_id"],
            "negotiation.turns",
            {
                "session_id": session_id,
                "round_index": round_index,
                "turn_count": len(negotiation.get("turns") or []),
                "outcome": result.get("outcome"),
            },
        )

    return {
        "round_index": round_index,
        "negotiation": negotiation,
        "hr_reply": result.get("hr_reply"),
        "state": result.get("state"),
        "offer": result.get("offer"),
        "done": result.get("done"),
        "evaluation": result.get("evaluation"),
        "round_score": round_data.get("score"),
        "disclaimer": result.get("disclaimer"),
    }


async def submit_reverse_qa(
    redis: Redis,
    session_id: str,
    current_user: UserInDB,
    *,
    round_index: int,
    questions: list[str],
) -> dict:
    session = await get_json(redis, f"session:{session_id}")
    if session is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found")
    if session["user_id"] != current_user.id and not current_user.is_admin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You do not have access to this session")

    rounds = session.get("rounds") or []
    if round_index >= len(rounds):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid round index")
    round_data = rounds[round_index]
    if not round_data.get("reverse_qa"):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Reverse Q&A not enabled for this round")

    cleaned = [(q or "").strip() for q in questions if (q or "").strip()][:3]
    if cleaned:
        items = score_reverse_batch(cleaned)
    else:
        script = load_negotiation_script()
        samples = list(script.get("sample_reverse_questions") or [])[:3]
        items = [{"question": s, "category": "sample", "score": None} for s in samples]

    round_data["reverse_qa_items"] = items
    rounds[round_index] = round_data
    session["rounds"] = rounds
    session["updated_at"] = datetime.now(timezone.utc).isoformat()
    await set_json(redis, f"session:{session_id}", session)

    await emit_server_event(
        redis,
        session["user_id"],
        "reverse_qa.count",
        {
            "session_id": session_id,
            "round_index": round_index,
            "count": len(cleaned),
            "skipped": len(cleaned) == 0,
        },
    )

    return {
        "round_index": round_index,
        "items": items,
        "skipped": len(cleaned) == 0,
        "sample_only": len(cleaned) == 0,
    }


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
    rounds = session.get("rounds") or []
    if payload.metadata and payload.metadata.get("rounds"):
        session["rounds"] = payload.metadata["rounds"]
        rounds = session["rounds"]
    final_from_rounds = _compute_weighted_final(rounds) if rounds else None
    transcript = payload.transcript or payload.messages
    score_status = _compute_score_status(rounds) if rounds else _score_status_from_transcript(transcript)
    if payload.metadata and payload.metadata.get("score_status"):
        score_status = payload.metadata["score_status"]
    if score_status == "insufficient":
        session["score"] = None
    else:
        session["score"] = final_from_rounds if final_from_rounds is not None else payload.score
    session["score_status"] = score_status
    session["duration_minutes"] = payload.duration_minutes
    session["completed_at"] = now
    session["updated_at"] = now
    dimensions = dict(payload.dimensions or {})
    if rounds:
        logicality = _aggregate_logicality(rounds)
        dimensions["logicality"] = logicality
        dimensions.setdefault("logic", logicality)
        metadata_round_scores = [
            {"name": r.get("name"), "score": r.get("score"), "completed_count": r.get("completed_count")}
            for r in rounds
            if r.get("score") is not None
        ]
    else:
        metadata_round_scores = []
    metadata = {
        **session.get("metadata", {}),
        "dimensions": dimensions,
        "round_scores": metadata_round_scores,
        "score_status": score_status,
    }
    research_path = dict(metadata.get("research_path") or {})
    research_path["answered_at"] = now
    metadata["research_path"] = research_path
    if payload.metadata:
        metadata = {**metadata, **payload.metadata}
        metadata["research_path"] = {**research_path, **(metadata.get("research_path") or {})}
        if payload.metadata.get("rounds"):
            session["rounds"] = payload.metadata["rounds"]
            rounds = session["rounds"]
            metadata["round_scores"] = [
                {"name": r.get("name"), "score": r.get("score"), "completed_count": r.get("completed_count")}
                for r in rounds
                if r.get("score") is not None
            ]
    if transcript:
        metadata["transcript"] = transcript
        metadata["messages"] = payload.messages or transcript

    if session.get("type") == "lgd" and transcript:
        lgd_meta = metadata.get("lgd") or {}
        lgd_metrics = score_lgd_discussion(
            transcript,
            user_role=metadata.get("user_role") or lgd_meta.get("user_role"),
            participant_count=int(metadata.get("participant_count") or lgd_meta.get("participant_count") or 8),
            user_was_reporter=metadata.get("user_was_reporter") if metadata.get("user_was_reporter") is not None else lgd_meta.get("user_was_reporter"),
        )
        session["lgd_metrics"] = lgd_metrics
        metadata["lgd_metrics"] = lgd_metrics
        if lgd_metrics.get("timeline"):
            metadata["lgd_timeline"] = lgd_metrics["timeline"]
        if not lgd_metrics.get("spoke"):
            score_status = "insufficient"
            session["score"] = None
        else:
            score_status = _score_status_from_transcript(transcript)
            if score_status == "ok" and session.get("score") is None and lgd_metrics.get("overall_score") is not None:
                session["score"] = lgd_metrics["overall_score"]
        dims_suggested = lgd_metrics.get("dimensions_suggested") or {}
        for key, val in dims_suggested.items():
            if isinstance(val, (int, float)) and key not in dimensions:
                dimensions[key] = float(val)
        metadata["dimensions"] = dimensions
        metadata["score_status"] = score_status
        session["score_status"] = score_status
        await emit_server_event(
            redis,
            session["user_id"],
            "lgd.metrics",
            {
                "session_id": session_id,
                "spoke": lgd_metrics.get("spoke"),
                "overall_score": lgd_metrics.get("overall_score"),
            },
        )

    session["metadata"] = metadata

    await set_json(redis, f"session:{session_id}", session)
    await record_session_completion(redis, session)
    await emit_server_event(
        redis,
        session["user_id"],
        "interview.complete",
        {
            "session_id": session_id,
            "metadata": metadata,
            "score_status": score_status,
        },
    )
    if score_status == "insufficient":
        await emit_server_event(
            redis,
            session["user_id"],
            "report.insufficient",
            {"session_id": session_id},
        )
    return SessionResponse.model_validate(session)


async def patch_interview_session_metadata(
    redis: Redis,
    session_id: str,
    current_user: UserInDB,
    metadata_patch: dict[str, Any],
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

    if session.get("status") == "completed":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot update metadata for a completed session",
        )

    now = datetime.now(timezone.utc).isoformat()
    session["metadata"] = {**session.get("metadata", {}), **metadata_patch}
    session["updated_at"] = now

    await set_json(redis, f"session:{session_id}", session)
    return SessionResponse.model_validate(session)
