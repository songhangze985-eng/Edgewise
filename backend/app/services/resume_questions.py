"""Generate resume-specific interview questions from parsed resume data."""

from __future__ import annotations

import re
from datetime import datetime, timezone
from uuid import uuid4

from redis.asyncio import Redis

from app.api.v1.questions import build_question_record
from app.core.redis_client import get_json, set_json
from app.models.schemas import ResumeParsedData

MAX_QUESTIONS_PER_PROJECT = 2

METRIC_PATTERN = re.compile(r"\d+%|\d+万|\d+人|\d+倍|提升|降低|增长")


def _project_keywords(project: dict, skills: list[str]) -> list[str]:
    keywords: list[str] = []
    name = (project.get("name") or "").strip()
    desc = (project.get("desc") or "").strip()
    if name:
        keywords.append(name)
    for skill in skills:
        if skill and (skill in desc or skill.lower() in desc.lower()):
            keywords.append(skill)
    for token in re.findall(r"[A-Za-z][A-Za-z0-9+#.]{1,20}|[\u4e00-\u9fff]{2,6}", desc):
        if token not in keywords and len(keywords) < 8:
            keywords.append(token)
    return keywords[:8]


def _extract_metric(desc: str) -> str | None:
    if not desc:
        return None
    match = METRIC_PATTERN.search(desc)
    if match:
        start = max(0, match.start() - 10)
        end = min(len(desc), match.end() + 15)
        return desc[start:end].strip()
    return None


def _tech_from_desc(desc: str, skills: list[str]) -> str | None:
    for skill in skills:
        if skill and skill in desc:
            return skill
    tech = re.search(r"[A-Za-z][A-Za-z0-9+#.]{1,20}", desc or "")
    return tech.group(0) if tech else None


def build_questions_from_resume(resume_record: dict) -> list[dict]:
    parsed_raw = resume_record.get("parsed_data") or {}
    parsed = ResumeParsedData.model_validate(parsed_raw)
    skills = parsed.skills or []
    out: list[dict] = []

    for project in parsed.projects or []:
        pdata = project.model_dump() if hasattr(project, "model_dump") else project
        name = (pdata.get("name") or "").strip()
        desc = (pdata.get("desc") or "").strip()
        if not name:
            continue

        keywords = _project_keywords(pdata, skills)
        candidates: list[dict] = []

        candidates.append(
            {
                "title": f"在 {name} 中，你遇到的最大技术难题是什么？你是怎么解决的？",
                "template_id": "tech_challenge",
            }
        )
        tech = _tech_from_desc(desc, skills)
        if tech:
            candidates.append(
                {
                    "title": f"你在 {name} 里具体负责哪一部分？{tech} 是你自己选的吗，为什么？",
                    "template_id": "ownership_tech",
                }
            )
        metric = _extract_metric(desc)
        if metric:
            candidates.append(
                {
                    "title": f"{metric} 这个结果是怎么衡量出来的？",
                    "template_id": "metric_how",
                }
            )
        candidates.append(
            {
                "title": f"如果重做 {name}，你会改掉哪个决定？",
                "template_id": "redo_decision",
            }
        )

        for item in candidates[:MAX_QUESTIONS_PER_PROJECT]:
            out.append(
                {
                    "title": item["title"],
                    "source_project": name,
                    "keywords": keywords,
                    "template_id": item["template_id"],
                }
            )

    return out


async def regenerate_user_resume_questions(
    redis: Redis,
    user_id: str,
    resume_id: str,
) -> list[str]:
    """Replace user's resume_specific questions; returns new question ids."""
    resume = await get_json(redis, f"resume:{resume_id}")
    if resume is None or resume.get("user_id") != user_id:
        return []

    old_ids = await redis.smembers(f"user:{user_id}:resume_questions")
    for qid in old_ids:
        await redis.delete(f"question:{qid}")
        await redis.srem("questions:all", qid)
        await redis.srem(f"user:{user_id}:resume_questions", qid)

    payloads = build_questions_from_resume(resume)
    now = datetime.now(timezone.utc).isoformat()
    new_ids: list[str] = []

    for payload in payloads:
        question_id = f"RS{uuid4().hex[:6].upper()}"
        record = build_question_record(
            {
                "id": question_id,
                "title": payload["title"],
                "category": "通用题",
                "difficulty": "中等",
                "type": "resume_specific",
                "user_id": user_id,
                "source_project": payload["source_project"],
                "keywords": payload.get("keywords", []),
                "assessment_points": "验证简历项目真实性、个人贡献与技术深度。",
                "answer_structure": "背景 → 你的职责 → 关键行动 → 可验证的结果。",
                "tags": ["简历专属", payload["source_project"]],
                "created_at": now,
            },
            existing_questions=[],
        )
        record["type"] = "resume_specific"
        record["user_id"] = user_id
        record["source_project"] = payload["source_project"]
        record["keywords"] = payload.get("keywords", [])
        record["ideal"] = None

        await set_json(redis, f"question:{question_id}", record)
        await redis.sadd("questions:all", question_id)
        await redis.sadd(f"user:{user_id}:resume_questions", question_id)
        new_ids.append(question_id)

    return new_ids
