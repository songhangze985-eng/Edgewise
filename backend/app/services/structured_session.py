"""Build interview sessions for structured (civil / SOE) practice mode."""

from __future__ import annotations

import random
from typing import Any

from redis.asyncio import Redis

from app.core.redis_client import get_json
from app.data.structured_seed import CATEGORY_DISPLAY, STRUCTURED_CATEGORIES


async def _load_structured_questions(redis: Redis) -> list[dict]:
    ids = await redis.smembers("questions:all")
    out: list[dict] = []
    for qid in ids:
        q = await get_json(redis, f"question:{qid}")
        if q and q.get("type") == "structured":
            out.append(q)
    return out


def _question_payload(q: dict) -> dict:
    return {
        "id": q["id"],
        "title": q["title"],
        "type": "structured",
        "structured_category": q.get("structured_category") or "analysis",
        "category_label": CATEGORY_DISPLAY.get(q.get("structured_category") or "analysis", "结构化"),
        "assessment_points": q.get("assessment_points"),
        "answer_structure": q.get("answer_structure"),
        "source_label": "谈锋自编练习题",
        "answer": None,
        "score": None,
    }


async def build_structured_session_rounds(
    redis: Redis,
    structured: dict[str, Any],
) -> tuple[list[dict], str | None]:
    pool = await _load_structured_questions(redis)
    if not pool:
        return [], "结构化练习题尚未初始化，请重启后端或联系管理员。"

    kind = (structured.get("kind") or "civil").lower()
    by_cat: dict[str, list[dict]] = {c: [] for c in STRUCTURED_CATEGORIES}
    for q in pool:
        cat = q.get("structured_category") or "analysis"
        if cat in by_cat:
            by_cat[cat].append(q)

    rng = random.Random()

    if kind == "soe":
        count = int(structured.get("question_count") or 4)
        count = max(2, min(6, count))
        chosen = rng.sample(pool, k=min(count, len(pool)))
        per_min = int(structured.get("per_question_minutes") or 4)
        per_min = max(2, min(8, per_min))
        round_name = "国企银行 · 半结构化"
    else:
        chosen = []
        for cat in STRUCTURED_CATEGORIES:
            candidates = by_cat.get(cat) or []
            if candidates:
                chosen.append(rng.choice(candidates))
        if len(chosen) < len(STRUCTURED_CATEGORIES):
            extras = [q for q in pool if q not in chosen]
            rng.shuffle(extras)
            for q in extras:
                if len(chosen) >= 5:
                    break
                if q not in chosen:
                    chosen.append(q)
        per_min = None
        round_name = "公考 · 结构化"

    questions = [_question_payload(q) for q in chosen]
    round_data: dict[str, Any] = {
        "name": round_name,
        "type": "structured",
        "question_count": len(questions),
        "questions": questions,
        "completed_count": 0,
        "score": None,
    }
    if kind == "soe":
        round_data["per_question_minutes"] = per_min

    structured_meta = dict(structured)
    structured_meta["question_ids"] = [q["id"] for q in questions]
    if kind == "civil":
        structured_meta["show_all_questions"] = bool(structured.get("show_all_questions", True))

    notice = None
    return [round_data], notice
