from __future__ import annotations

from datetime import datetime, timezone
from typing import Any
from uuid import uuid4

from redis.asyncio import Redis

from app.core.redis_client import get_json, set_json
from app.research.events import append_research_event
from app.services.experience_sanitize import strip_private_contact, validate_experience_payload

EXPERIENCES_APPROVED = "experiences:approved"
EXPERIENCES_PENDING = "experiences:pending"


def _experience_key(experience_id: str) -> str:
    return f"experience:{experience_id}"


def _user_experiences_key(user_id: str) -> str:
    return f"user:{user_id}:experiences"


def _public_questions(raw: list[Any]) -> list[str]:
    out: list[str] = []
    for item in raw or []:
        text = strip_private_contact(str(item).strip())
        if text:
            out.append(text)
    return out


def _serialize_public(record: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": record["id"],
        "company": record.get("company") or "",
        "role": record.get("role") or "",
        "stage": record.get("stage") or "",
        "date_month": record.get("date_month") or "",
        "questions": _public_questions(record.get("questions") or []),
        "status": record.get("status") or "pending",
        "created_at": record.get("created_at") or "",
        "approved_at": record.get("approved_at"),
    }


async def create_experience(
    redis: Redis,
    user_id: str,
    *,
    company: str,
    role: str,
    stage: str,
    date_month: str,
    questions: list[str],
) -> dict[str, Any]:
    cleaned_questions = [strip_private_contact(q.strip()) for q in questions if q and q.strip()]
    if len(cleaned_questions) < 1:
        raise ValueError("questions_required")
    validate_experience_payload(
        company=company,
        role=role,
        stage=stage,
        date_month=date_month,
        questions=cleaned_questions,
    )
    now = datetime.now(timezone.utc).isoformat()
    experience_id = uuid4().hex[:16]
    record = {
        "id": experience_id,
        "company": strip_private_contact(company.strip()),
        "role": strip_private_contact(role.strip()),
        "stage": strip_private_contact(stage.strip()),
        "date_month": strip_private_contact(date_month.strip()),
        "questions": cleaned_questions,
        "status": "pending",
        "author_id": user_id,
        "created_at": now,
        "updated_at": now,
        "approved_at": None,
        "review_note": None,
    }
    await set_json(redis, _experience_key(experience_id), record)
    await redis.zadd(EXPERIENCES_PENDING, {experience_id: datetime.now(timezone.utc).timestamp()})
    await redis.sadd(_user_experiences_key(user_id), experience_id)
    await append_research_event(
        redis,
        user_id,
        "experience.submitted",
        props={"experience_id": experience_id, "question_count": len(cleaned_questions)},
        skip_consent_check=True,
    )
    return _serialize_public(record)


async def get_experience_record(redis: Redis, experience_id: str) -> dict[str, Any] | None:
    return await get_json(redis, _experience_key(experience_id))


async def get_experience_for_viewer(
    redis: Redis,
    experience_id: str,
    *,
    viewer_id: str | None,
    is_admin: bool,
) -> dict[str, Any] | None:
    record = await get_experience_record(redis, experience_id)
    if not record:
        return None
    status = record.get("status") or "pending"
    if status != "approved":
        if not is_admin and record.get("author_id") != viewer_id:
            return None
    return _serialize_public(record)


async def list_approved_experiences(
    redis: Redis,
    *,
    company: str | None = None,
    role: str | None = None,
    stage: str | None = None,
    limit: int = 100,
) -> list[dict[str, Any]]:
    ids = await redis.zrevrange(EXPERIENCES_APPROVED, 0, limit - 1)
    rows: list[dict[str, Any]] = []
    company_q = (company or "").strip().lower()
    role_q = (role or "").strip().lower()
    stage_q = (stage or "").strip().lower()
    for experience_id in ids:
        record = await get_experience_record(redis, experience_id)
        if not record or record.get("status") != "approved":
            continue
        if company_q and company_q not in (record.get("company") or "").lower():
            continue
        if role_q and role_q not in (record.get("role") or "").lower():
            continue
        if stage_q and stage_q not in (record.get("stage") or "").lower():
            continue
        rows.append(_serialize_public(record))
    return rows


async def list_pending_experiences(redis: Redis, *, limit: int = 50) -> list[dict[str, Any]]:
    ids = await redis.zrevrange(EXPERIENCES_PENDING, 0, limit - 1)
    rows: list[dict[str, Any]] = []
    for experience_id in ids:
        record = await get_experience_record(redis, experience_id)
        if not record or record.get("status") != "pending":
            continue
        row = _serialize_public(record)
        row["author_id"] = record.get("author_id")
        rows.append(row)
    return rows


async def review_experience(
    redis: Redis,
    admin_id: str,
    experience_id: str,
    *,
    decision: str,
    note: str | None = None,
) -> dict[str, Any]:
    record = await get_experience_record(redis, experience_id)
    if not record:
        raise ValueError("not_found")
    if record.get("status") != "pending":
        raise ValueError("not_pending")
    now = datetime.now(timezone.utc).isoformat()
    if decision == "approved":
        record["status"] = "approved"
        record["approved_at"] = now
        await redis.zrem(EXPERIENCES_PENDING, experience_id)
        await redis.zadd(
            EXPERIENCES_APPROVED,
            {experience_id: datetime.now(timezone.utc).timestamp()},
        )
    elif decision == "rejected":
        record["status"] = "rejected"
        await redis.zrem(EXPERIENCES_PENDING, experience_id)
    else:
        raise ValueError("invalid_decision")
    record["review_note"] = (note or "").strip() or None
    record["reviewed_by"] = admin_id
    record["updated_at"] = now
    await set_json(redis, _experience_key(experience_id), record)
    return _serialize_public(record)


def build_experience_practice_rounds(prompts: list[str]) -> list[dict[str, Any]]:
    questions: list[dict[str, Any]] = []
    for index, raw in enumerate(prompts[:8]):
        title = strip_private_contact(str(raw).strip())
        if not title:
            continue
        questions.append(
            {
                "id": f"exp-practice-{index}",
                "title": title,
                "type": "general",
                "category": "面经",
                "difficulty": "中等",
            }
        )
    if not questions:
        return []
    return [
        {
            "name": "面经练习",
            "index": 0,
            "questions": questions,
        }
    ]
