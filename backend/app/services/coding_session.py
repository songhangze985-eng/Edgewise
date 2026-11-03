"""Build and update coding practice sessions."""

from __future__ import annotations

import random
from typing import Any

from redis.asyncio import Redis

from app.core.redis_client import get_json
from app.data.coding_seed import CODING_FOLLOWUP_TEMPLATES, SEED_CODING_QUESTIONS


async def _load_coding_questions(redis: Redis) -> list[dict]:
    question_ids = await redis.smembers("questions:all")
    pool: list[dict] = []
    for qid in sorted(question_ids):
        q = await get_json(redis, f"question:{qid}")
        if q and q.get("type") == "coding":
            pool.append(q)
    if not pool:
        pool = list(SEED_CODING_QUESTIONS)
    return pool


def _question_to_round_item(q: dict) -> dict:
    return {
        "id": q["id"],
        "title": q["title"],
        "category": q.get("category") or "编程题",
        "difficulty": q.get("difficulty") or "中等",
        "type": "coding",
        "coding_language": q.get("coding_language") or "javascript",
        "entry_point": q.get("entry_point") or "solution",
        "problem_statement": q.get("problem_statement") or q.get("title"),
        "signature": q.get("signature") or q.get("starter_code") or "",
        "starter_code": q.get("starter_code") or q.get("signature") or "",
        "samples": q.get("samples") or [],
        "hidden_tests": q.get("hidden_tests") or [],
        "follow_ups": q.get("follow_ups") or CODING_FOLLOWUP_TEMPLATES,
        "tags": q.get("tags") or [],
        "score": None,
        "tests_passed": None,
        "tests_total": None,
    }


async def build_coding_session(
    redis: Redis,
    *,
    mode: str,
    question_id: str | None = None,
    duration_minutes: int | None = None,
) -> tuple[list[dict], dict[str, Any]]:
    pool = await _load_coding_questions(redis)
    by_id = {q["id"]: q for q in pool}

    mode_key = (mode or "interview").lower()
    if mode_key not in ("interview", "exam"):
        mode_key = "interview"

    selected: list[dict] = []
    if question_id and question_id in by_id:
        selected = [by_id[question_id]]
    elif mode_key == "interview":
        selected = [random.choice(pool)]
    else:
        count = min(4, max(3, len(pool)))
        selected = random.sample(pool, k=min(count, len(pool)))

    questions = [_question_to_round_item(q) for q in selected]
    if mode_key == "interview":
        dur = duration_minutes or 40
        if dur < 30:
            dur = 30
        if dur > 45:
            dur = 45
    else:
        dur = duration_minutes or 120

    rounds = [
        {
            "name": "编程题",
            "type": "coding",
            "question_count": len(questions),
            "questions": questions,
        }
    ]

    coding_meta: dict[str, Any] = {
        "mode": mode_key,
        "duration_minutes": dur,
        "question_ids": [q["id"] for q in questions],
        "current_question_index": 0,
        "followups_enabled": mode_key == "interview",
        "followup_templates": CODING_FOLLOWUP_TEMPLATES,
    }
    return rounds, coding_meta


def append_code_attempt(session: dict, attempt: dict) -> None:
    attempts = session.setdefault("code_attempts", [])
    attempts.append(attempt)


def update_explain_transcript(session: dict, transcript: str, speech_metrics: dict | None = None) -> None:
    session["explain_transcript"] = transcript
    meta = session.setdefault("metadata", {})
    coding = meta.setdefault("coding", {})
    if speech_metrics:
        coding["explain_speech_metrics"] = speech_metrics


def score_coding_from_attempts(session: dict) -> float | None:
    rounds = session.get("rounds") or []
    scores: list[float] = []
    for rnd in rounds:
        for q in rnd.get("questions") or []:
            passed = q.get("tests_passed")
            total = q.get("tests_total")
            if isinstance(passed, int) and isinstance(total, int) and total > 0:
                scores.append(round(100.0 * passed / total, 1))
                q["score"] = scores[-1]
    if not scores:
        return None
    return round(sum(scores) / len(scores), 1)
