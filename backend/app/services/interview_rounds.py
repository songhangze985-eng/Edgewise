"""Build multi-round question plans for 1v1 interview sessions."""

from __future__ import annotations

import random
import re
from typing import Any

from redis.asyncio import Redis

from app.core.redis_client import get_json
from app.services.hr_questions import hr_question_session_item, pick_hr_questions
from app.services.interview_config import DEFAULT_MIX, DEFAULT_ROUND_NAMES, ROUNDS_FORCED_BY_ARM
from app.services.job_service import annotate_overlap_deep_dig, build_gap_fill_session_question
from app.services.negotiation_engine import init_negotiation_block
from app.services.case_flow import build_case_question_item, get_case_definition, pick_default_case_id

INTERVIEW_TYPE_CATEGORIES: dict[str, list[str]] = {
    "structured": ["行为题", "专业知识", "逻辑题"],
    "semi": ["行为题", "压力题", "案例分析"],
    "behavioral": ["行为题"],
    "pressure": ["压力题"],
}

DIFFICULTY_TO_LABEL: dict[str, str] = {
    "easy": "简单",
    "medium": "中等",
    "hard": "困难",
}

ROLE_SPECIFIC_TERMS = (
    "react",
    "vue",
    "angular",
    "python",
    "java",
    "golang",
    "redis",
    "kubernetes",
    "sql",
    "fastapi",
    "spring",
)


def _difficulty_label(difficulty: str | None) -> str | None:
    if not difficulty:
        return None
    return DIFFICULTY_TO_LABEL.get(difficulty, difficulty)


def _is_general_position(position: str | None) -> bool:
    pos = (position or "").strip().lower()
    return not pos or "通用" in pos


def _question_matches_job(question: dict, position: str | None) -> bool:
    pos = (position or "").strip().lower()
    if not pos or "通用" in pos:
        return True
    haystack = " ".join(
        [
            question.get("title") or "",
            question.get("category") or "",
            " ".join(question.get("tags") or []),
        ]
    ).lower()
    tokens = [t for t in re.split(r"[\s/·、，,]+", pos) if len(t) >= 2]
    if not tokens:
        return True
    return any(t in haystack for t in tokens)


def _exclude_role_specific_for_general(question: dict, *, interview_type: str | None, position: str | None) -> bool:
    if interview_type != "structured" or not _is_general_position(position):
        return False
    hay = " ".join(
        [
            question.get("title") or "",
            " ".join(question.get("tags") or []),
        ]
    ).lower()
    return any(term in hay for term in ROLE_SPECIFIC_TERMS)


def _question_lang(q: dict) -> str:
    raw = (q.get("lang") or "zh-CN").strip()
    if raw.lower().startswith("en"):
        return "en-US"
    return "zh-CN"


def _filter_pool(
    pool: list[dict],
    *,
    categories: list[str] | None,
    difficulty_label: str | None,
    position: str | None,
    interview_type: str | None,
    session_lang: str | None = None,
) -> list[dict]:
    filtered = pool
    lang_key = "en-US" if (session_lang or "").lower().startswith("en") else "zh-CN"
    filtered = [q for q in filtered if _question_lang(q) == lang_key]
    if categories:
        cat_set = set(categories)
        filtered = [q for q in filtered if q.get("category") in cat_set]
    if difficulty_label:
        filtered = [q for q in filtered if q.get("difficulty") == difficulty_label]
    filtered = [q for q in filtered if _question_matches_job(q, position)]
    filtered = [
        q for q in filtered if not _exclude_role_specific_for_general(q, interview_type=interview_type, position=position)
    ]
    return filtered


def normalize_round_configs(
    rounds: list[dict[str, Any]] | None,
    *,
    experiment_arm: str | None = None,
) -> list[dict[str, Any]]:
    if ROUNDS_FORCED_BY_ARM and experiment_arm and experiment_arm in ROUNDS_FORCED_BY_ARM:
        rounds = [
            {**r, "type": "standard", "reverse_qa": False}
            for r in ROUNDS_FORCED_BY_ARM[experiment_arm]
        ]

    if not rounds:
        rounds = []
        for i in range(3):
            rounds.append(
                {
                    "name": DEFAULT_ROUND_NAMES[i],
                    "question_count": 3,
                    "mix": dict(DEFAULT_MIX),
                }
            )

    normalized: list[dict[str, Any]] = []
    for i, raw in enumerate(rounds[:5]):
        mix = raw.get("mix") or DEFAULT_MIX
        round_type = raw.get("type") or "standard"
        if round_type not in ("standard", "hr", "negotiation", "case", "system_design"):
            round_type = "standard"
        q_count = max(1, min(8, int(raw.get("question_count") or 3)))
        if round_type == "negotiation":
            q_count = 0
        if round_type in ("case", "system_design"):
            q_count = 1
        entry: dict[str, Any] = {
            "name": raw.get("name") or DEFAULT_ROUND_NAMES[min(i, len(DEFAULT_ROUND_NAMES) - 1)],
            "question_count": q_count,
            "type": round_type,
            "reverse_qa": bool(raw.get("reverse_qa")),
            "mix": {
                "general": max(0, int(mix.get("general", 1))),
                "resume_specific": max(0, int(mix.get("resume_specific", 1))),
                "professional": max(0, int(mix.get("professional", 1))),
            },
        }
        if raw.get("case_id"):
            entry["case_id"] = raw["case_id"]
        normalized.append(entry)
    return normalized


def _allocate_slots(question_count: int, mix: dict[str, int]) -> dict[str, int]:
    total_ratio = mix["general"] + mix["resume_specific"] + mix["professional"]
    if total_ratio <= 0:
        mix = dict(DEFAULT_MIX)
        total_ratio = 3

    raw = {
        "general": question_count * mix["general"] / total_ratio,
        "resume_specific": question_count * mix["resume_specific"] / total_ratio,
        "professional": question_count * mix["professional"] / total_ratio,
    }
    counts = {k: int(raw[k]) for k in raw}
    remainder = question_count - sum(counts.values())
    order = sorted(raw.keys(), key=lambda k: raw[k] - counts[k], reverse=True)
    idx = 0
    while remainder > 0:
        counts[order[idx % len(order)]] += 1
        remainder -= 1
        idx += 1
    return counts


async def _load_question_pools(
    redis: Redis,
    user_id: str,
    *,
    has_resume: bool,
) -> tuple[list[dict], list[dict], list[dict]]:
    all_ids = await redis.smembers("questions:all")
    general: list[dict] = []
    professional: list[dict] = []
    resume_specific: list[dict] = []

    for qid in all_ids:
        q = await get_json(redis, f"question:{qid}")
        if not q:
            continue
        qtype = q.get("type") or "professional"
        if qtype == "general":
            general.append(q)
        elif qtype == "resume_specific":
            if q.get("user_id") == user_id:
                resume_specific.append(q)
        else:
            if q.get("category") != "通用题":
                professional.append(q)

    if not has_resume:
        resume_specific = []
    return general, resume_specific, professional


def _pick_from_pool(pool: list[dict], count: int, used_ids: set[str]) -> list[dict]:
    available = [q for q in pool if q["id"] not in used_ids]
    random.shuffle(available)
    picked = available[:count]
    for q in picked:
        used_ids.add(q["id"])
    return picked


def _resume_overlap_score(question: dict, overlap_terms: set[str]) -> int:
    if not overlap_terms:
        return 0
    q_keys = {str(k).strip().lower() for k in (question.get("keywords") or [])}
    q_keys.update(str(t).strip().lower() for t in (question.get("tags") or []))
    hay = " ".join(
        [question.get("title") or "", question.get("source_project") or ""]
    ).lower()
    score = len(q_keys & {t.lower() for t in overlap_terms})
    for term in overlap_terms:
        if term.lower() in hay:
            score += 1
    return score


def _pick_resume_with_jd(
    pool: list[dict],
    count: int,
    used_ids: set[str],
    *,
    overlap_terms: set[str],
    jd_only_terms: list[str],
) -> list[dict]:
    """Resume slots: gap-fill for jd-only keywords, then overlap-prioritized resume questions."""
    if count <= 0:
        return []

    items: list[dict] = []
    gap_terms = list(jd_only_terms)
    random.shuffle(gap_terms)
    gap_slots = min(count, len(gap_terms))
    for kw in gap_terms[:gap_slots]:
        items.append(build_gap_fill_session_question(kw))

    remaining = count - len(items)
    if remaining <= 0:
        return items

    available = [q for q in pool if q["id"] not in used_ids]
    available.sort(key=lambda q: _resume_overlap_score(q, overlap_terms), reverse=True)
    picked = available[:remaining]
    for q in picked:
        used_ids.add(q["id"])
    items.extend(picked)
    return items


def _question_session_item(q: dict) -> dict[str, Any]:
    qtype = q.get("type") or "professional"
    return {
        "id": q["id"],
        "type": qtype,
        "title": q["title"],
        "lang": _question_lang(q),
        "category": q.get("category"),
        "keywords": q.get("keywords") or [],
        "source_project": q.get("source_project"),
        "answer": None,
        "score": None,
        "logic_score": None,
        "logic_rule_version": None,
        "answer_valid": None,
        "invalid_reason": None,
    }


async def build_session_rounds(
    redis: Redis,
    user_id: str,
    round_configs: list[dict[str, Any]],
    *,
    resume_id: str | None,
    difficulty: str | None,
    interview_type: str | None,
    position: str | None,
    jd_match: dict[str, Any] | None = None,
    negotiation_prefs: dict[str, Any] | None = None,
    session_lang: str | None = None,
) -> tuple[list[dict[str, Any]], str | None]:
    """Returns (rounds, notice)."""
    has_resume = bool(resume_id)
    general_pool, resume_pool, professional_pool = await _load_question_pools(
        redis, user_id, has_resume=has_resume
    )

    notices: list[str] = []
    if not has_resume:
        notices.append("上传简历可解锁专属追问")

    interview_type_key = interview_type or "structured"
    if (session_lang or "").lower().startswith("en"):
        categories = ["General"]
    else:
        categories = INTERVIEW_TYPE_CATEGORIES.get(interview_type_key, INTERVIEW_TYPE_CATEGORIES["structured"])
    difficulty_label = _difficulty_label(difficulty)

    def typed_pool(base: list[dict]) -> list[dict]:
        return _filter_pool(
            base,
            categories=categories,
            difficulty_label=difficulty_label,
            position=position,
            interview_type=interview_type_key,
            session_lang=session_lang,
        )

    filtered_general = typed_pool(general_pool)
    filtered_resume = typed_pool(resume_pool)
    filtered_professional = typed_pool(professional_pool)

    used_ids: set[str] = set()
    session_rounds: list[dict[str, Any]] = []
    pool_relaxed = False
    overlap_terms: set[str] = set()
    jd_only_terms: list[str] = []
    if jd_match:
        overlap_terms = {str(t) for t in (jd_match.get("overlap") or [])}
        jd_only_terms = list(jd_match.get("jd_only") or [])

    for cfg in round_configs:
        round_type = cfg.get("type") or "standard"
        if round_type == "hr":
            hr_picks = pick_hr_questions(cfg.get("question_count") or 3)
            question_items = [hr_question_session_item(q) for q in hr_picks]
            session_rounds.append(
                {
                    "name": cfg["name"],
                    "type": "hr",
                    "reverse_qa": bool(cfg.get("reverse_qa")),
                    "questions": question_items,
                    "completed_count": 0,
                    "score": None,
                    "reverse_qa_items": [],
                }
            )
            continue

        if round_type == "negotiation":
            prefs = negotiation_prefs or {}
            floor_k = float(prefs.get("salary_floor_k") or 15)
            ceiling_k = prefs.get("salary_ceiling_k")
            ceiling_val = float(ceiling_k) if ceiling_k is not None else None
            session_rounds.append(
                {
                    "name": cfg["name"],
                    "type": "negotiation",
                    "reverse_qa": bool(cfg.get("reverse_qa")),
                    "questions": [],
                    "negotiation": init_negotiation_block(floor_k=floor_k, ceiling_k=ceiling_val),
                    "completed_count": 0,
                    "score": None,
                    "reverse_qa_items": [],
                }
            )
            continue

        if round_type in ("case", "system_design"):
            case_id = cfg.get("case_id") or pick_default_case_id(round_type)
            if not case_id or not get_case_definition(case_id):
                case_id = pick_default_case_id(round_type)
            if not case_id:
                continue
            round_index = len(session_rounds)
            question_item = build_case_question_item(case_id=case_id, round_index=round_index)
            session_rounds.append(
                {
                    "name": cfg["name"],
                    "type": round_type,
                    "reverse_qa": bool(cfg.get("reverse_qa")),
                    "questions": [question_item],
                    "completed_count": 0,
                    "score": None,
                    "reverse_qa_items": [],
                }
            )
            continue

        counts = _allocate_slots(cfg["question_count"], cfg["mix"])
        if not has_resume and counts["resume_specific"] > 0:
            counts["general"] += counts["resume_specific"]
            counts["resume_specific"] = 0

        round_questions: list[dict] = []
        round_questions.extend(_pick_from_pool(filtered_general, counts["general"], used_ids))
        if jd_match and counts["resume_specific"] > 0:
            round_questions.extend(
                _pick_resume_with_jd(
                    filtered_resume,
                    counts["resume_specific"],
                    used_ids,
                    overlap_terms=overlap_terms,
                    jd_only_terms=jd_only_terms,
                )
            )
        else:
            round_questions.extend(_pick_from_pool(filtered_resume, counts["resume_specific"], used_ids))
        round_questions.extend(_pick_from_pool(filtered_professional, counts["professional"], used_ids))

        needed = cfg["question_count"] - len(round_questions)
        if needed > 0:
            relaxed_job_general = _filter_pool(
                general_pool,
                categories=categories,
                difficulty_label=difficulty_label,
                position=None,
                interview_type=interview_type_key,
                session_lang=session_lang,
            )
            relaxed_job_prof = _filter_pool(
                professional_pool,
                categories=categories,
                difficulty_label=difficulty_label,
                position=None,
                interview_type=interview_type_key,
                session_lang=session_lang,
            )
            relaxed_job_resume = _filter_pool(
                resume_pool,
                categories=categories,
                difficulty_label=difficulty_label,
                position=None,
                interview_type=interview_type_key,
                session_lang=session_lang,
            )
            fallback = relaxed_job_general + relaxed_job_prof + relaxed_job_resume
            before = len(round_questions)
            round_questions.extend(_pick_from_pool(fallback, needed, used_ids))
            if len(round_questions) > before:
                if "当前岗位匹配题目较少" not in " ".join(notices):
                    notices.append("当前岗位匹配题目较少，已放宽岗位条件选题。")
                pool_relaxed = True

        needed = cfg["question_count"] - len(round_questions)
        if needed > 0:
            relaxed_type = _filter_pool(
                general_pool + professional_pool + resume_pool,
                categories=None,
                difficulty_label=difficulty_label,
                position=None,
                interview_type=interview_type_key,
                session_lang=session_lang,
            )
            before = len(round_questions)
            round_questions.extend(_pick_from_pool(relaxed_type, needed, used_ids))
            if len(round_questions) > before:
                if "已放宽题型条件" not in " ".join(notices):
                    notices.append("当前难度下匹配题目较少，已放宽题型条件选题。")
                pool_relaxed = True

        needed = cfg["question_count"] - len(round_questions)
        if needed > 0 and difficulty_label:
            relaxed_diff = _filter_pool(
                general_pool + professional_pool + resume_pool,
                categories=categories,
                difficulty_label=None,
                position=None,
                interview_type=interview_type_key,
                session_lang=session_lang,
            )
            before = len(round_questions)
            round_questions.extend(_pick_from_pool(relaxed_diff, needed, used_ids))
            if len(round_questions) > before:
                notices.append("已放宽难度条件以凑齐题量。")
                pool_relaxed = True

        needed = cfg["question_count"] - len(round_questions)
        if needed > 0:
            fallback = general_pool + professional_pool
            round_questions.extend(_pick_from_pool(fallback, needed, used_ids))

        random.shuffle(round_questions)
        question_items: list[dict[str, Any]] = []
        for q in round_questions[: cfg["question_count"]]:
            if q.get("jd_align") == "gap_fill":
                question_items.append(q)
            else:
                item = _question_session_item(q)
                if overlap_terms:
                    annotate_overlap_deep_dig(item, overlap_terms)
                question_items.append(item)
        session_rounds.append(
            {
                "name": cfg["name"],
                "type": "standard",
                "reverse_qa": bool(cfg.get("reverse_qa")),
                "questions": question_items,
                "completed_count": 0,
                "score": None,
                "reverse_qa_items": [],
            }
        )

    notice = " ".join(notices) if notices else None
    return session_rounds, notice
