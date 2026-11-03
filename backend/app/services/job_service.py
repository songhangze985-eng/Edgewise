"""Persist user JD records in Redis and compute resume match."""

from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Any
from uuid import uuid4

from fastapi import HTTPException, status
from redis.asyncio import Redis

from app.core.redis_client import get_json
from app.research.pipeline import emit_server_event
from app.services.jd_parser import (
    compute_skill_match,
    default_jd_parser,
    extract_resume_skill_terms,
    infer_job_title,
)

SHORT_JD_CHARS = 50


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _job_key(job_id: str) -> str:
    return f"job:{job_id}"


async def _load_job_hash(redis: Redis, job_id: str) -> dict[str, Any] | None:
    raw = await redis.hgetall(_job_key(job_id))
    if not raw:
        return None
    decoded: dict[str, Any] = {}
    for k, v in raw.items():
        key = k.decode() if isinstance(k, bytes) else k
        val = v.decode() if isinstance(v, bytes) else v
        decoded[key] = val
    if decoded.get("keywords"):
        try:
            decoded["keywords"] = json.loads(decoded["keywords"])
        except json.JSONDecodeError:
            decoded["keywords"] = []
    else:
        decoded["keywords"] = []
    return decoded


async def get_job_for_user(redis: Redis, user_id: str, job_id: str) -> dict[str, Any]:
    job = await _load_job_hash(redis, job_id)
    if job is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job description not found")
    if job.get("user_id") != user_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")
    return job


async def create_job(
    redis: Redis,
    user_id: str,
    *,
    raw_text: str,
    title: str | None = None,
    keywords: list[str] | None = None,
) -> dict[str, Any]:
    text = (raw_text or "").strip()
    if not text:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="JD text is required")

    parsed_keywords = keywords if keywords is not None else default_jd_parser.extract_keywords(text)
    parsed_keywords = [k.strip() for k in parsed_keywords if k and str(k).strip()]

    job_id = uuid4().hex
    now = _now_iso()
    resolved_title = (title or infer_job_title(text) or "").strip() or None

    record = {
        "id": job_id,
        "user_id": user_id,
        "title": resolved_title or "",
        "raw_text": text,
        "keywords": parsed_keywords,
        "created_at": now,
        "updated_at": now,
    }

    await redis.hset(
        _job_key(job_id),
        mapping={
            "id": job_id,
            "user_id": user_id,
            "title": record["title"],
            "raw_text": text,
            "keywords": json.dumps(parsed_keywords, ensure_ascii=False),
            "created_at": now,
            "updated_at": now,
        },
    )
    await redis.sadd(f"user:{user_id}:jobs", job_id)

    await emit_server_event(
        redis,
        user_id,
        "jd.saved",
        {
            "job_id": job_id,
            "keyword_count": len(parsed_keywords),
            "short_text": len(text) < SHORT_JD_CHARS,
        },
    )

    return _public_job_view(record)


async def list_jobs(redis: Redis, user_id: str) -> list[dict[str, Any]]:
    job_ids = await redis.smembers(f"user:{user_id}:jobs")
    jobs: list[dict[str, Any]] = []
    for jid in job_ids:
        job_id = jid.decode() if isinstance(jid, bytes) else jid
        job = await _load_job_hash(redis, job_id)
        if job and job.get("user_id") == user_id:
            jobs.append(_public_job_view(job))
    jobs.sort(key=lambda j: j.get("created_at") or "", reverse=True)
    return jobs


async def delete_job(redis: Redis, user_id: str, job_id: str) -> None:
    job = await get_job_for_user(redis, user_id, job_id)
    await redis.delete(_job_key(job_id))
    await redis.srem(f"user:{user_id}:jobs", job_id)
    _ = job


def _public_job_view(job: dict[str, Any]) -> dict[str, Any]:
    raw_text = job.get("raw_text") or ""
    keywords = job.get("keywords") or []
    if isinstance(keywords, str):
        try:
            keywords = json.loads(keywords)
        except json.JSONDecodeError:
            keywords = []
    return {
        "id": job["id"],
        "title": job.get("title") or None,
        "raw_text": raw_text,
        "keywords": keywords,
        "created_at": job.get("created_at") or "",
        "updated_at": job.get("updated_at") or "",
        "short_text_warning": len(raw_text.strip()) < SHORT_JD_CHARS,
        "needs_manual_keywords": len(keywords) == 0 and bool(raw_text.strip()),
    }


async def match_job_to_resume(
    redis: Redis,
    user_id: str,
    job_id: str,
    resume_id: str,
    *,
    emit_event: bool = True,
) -> dict[str, Any]:
    job = await get_job_for_user(redis, user_id, job_id)
    resume = await get_json(redis, f"resume:{resume_id}")
    if resume is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Resume not found")
    if resume.get("user_id") != user_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")

    jd_keywords = job.get("keywords") or []
    resume_terms = extract_resume_skill_terms(resume)
    match = compute_skill_match(jd_keywords, resume_terms)

    if emit_event:
        await emit_server_event(
            redis,
            user_id,
            "jd.match_viewed",
            {
                "job_id": job_id,
                "resume_id": resume_id,
                "coverage": match["coverage"],
                "overlap_count": len(match["overlap"]),
            },
        )

    return {
        "job_id": job_id,
        "resume_id": resume_id,
        **match,
    }


def build_gap_fill_session_question(keyword: str) -> dict[str, Any]:
    from uuid import uuid4

    kw = keyword.strip()
    qid = f"JDG{uuid4().hex[:6].upper()}"
    return {
        "id": qid,
        "type": "resume_specific",
        "title": f"【补位题】岗位要求涉及「{kw}」，请结合真实经历说明掌握程度与具体案例（勿编造未参与的项目）。",
        "category": "行为题",
        "keywords": [kw],
        "jd_align": "gap_fill",
        "source_project": None,
        "answer": None,
        "score": None,
        "logic_score": None,
        "logic_rule_version": None,
        "answer_valid": None,
        "invalid_reason": None,
    }


def annotate_overlap_deep_dig(question_item: dict[str, Any], overlap_terms: set[str]) -> None:
    q_keywords = {str(k).strip().lower() for k in (question_item.get("keywords") or [])}
    if q_keywords & {t.lower() for t in overlap_terms}:
        question_item["jd_align"] = "overlap"
        question_item["jd_deep_dig"] = True
