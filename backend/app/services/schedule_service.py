"""User interview schedule entries in Redis."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any
from uuid import uuid4

from fastapi import HTTPException, status
from redis.asyncio import Redis

from app.research.pipeline import emit_server_event
from app.services.job_service import get_job_for_user

SCHEDULE_STAGES = (
    "测评",
    "AI面试",
    "笔试",
    "一面",
    "二面",
    "主管面",
    "HR面",
    "谈薪",
)

SCHEDULE_RESULTS = ("待定", "通过", "未通过", "放弃")


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _schedule_key(schedule_id: str) -> str:
    return f"schedule:{schedule_id}"


def _user_schedule_zset(user_id: str) -> str:
    return f"user:{user_id}:schedule"


def _at_score(at_iso: str) -> float:
    raw = (at_iso or "").strip()
    if raw.endswith("Z"):
        raw = raw[:-1] + "+00:00"
    try:
        dt = datetime.fromisoformat(raw)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid datetime") from exc
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.timestamp()


async def _load_schedule(redis: Redis, schedule_id: str) -> dict[str, Any] | None:
    raw = await redis.hgetall(_schedule_key(schedule_id))
    if not raw:
        return None
    decoded: dict[str, Any] = {}
    for k, v in raw.items():
        key = k.decode() if isinstance(k, bytes) else k
        val = v.decode() if isinstance(v, bytes) else v
        decoded[key] = val
    return decoded


def _public_view(record: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": record["id"],
        "company": record.get("company") or "",
        "stage": record.get("stage") or "",
        "at": record.get("at") or "",
        "job_id": record.get("job_id") or None,
        "result": record.get("result") or "待定",
        "note": record.get("note") or "",
        "created_at": record.get("created_at") or "",
        "updated_at": record.get("updated_at") or "",
    }


async def get_schedule_for_user(redis: Redis, user_id: str, schedule_id: str) -> dict[str, Any]:
    row = await _load_schedule(redis, schedule_id)
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Schedule entry not found")
    if row.get("user_id") != user_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")
    return row


async def create_schedule(
    redis: Redis,
    user_id: str,
    *,
    company: str,
    stage: str,
    at: str,
    job_id: str | None = None,
    result: str = "待定",
    note: str | None = None,
) -> dict[str, Any]:
    name = (company or "").strip()
    if not name:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Company is required")
    stage_val = (stage or "").strip()
    if stage_val not in SCHEDULE_STAGES:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid stage")
    if (result or "待定") not in SCHEDULE_RESULTS:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid result")
    at_val = (at or "").strip()
    if not at_val:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Interview time is required")
    score = _at_score(at_val)

    resolved_job: str | None = None
    if job_id:
        await get_job_for_user(redis, user_id, job_id)
        resolved_job = job_id

    schedule_id = uuid4().hex
    now = _now_iso()
    record = {
        "id": schedule_id,
        "user_id": user_id,
        "company": name,
        "stage": stage_val,
        "at": at_val,
        "job_id": resolved_job or "",
        "result": result or "待定",
        "note": (note or "").strip(),
        "created_at": now,
        "updated_at": now,
    }

    await redis.hset(
        _schedule_key(schedule_id),
        mapping={
            "id": schedule_id,
            "user_id": user_id,
            "company": name,
            "stage": stage_val,
            "at": at_val,
            "job_id": record["job_id"],
            "result": record["result"],
            "note": record["note"],
            "created_at": now,
            "updated_at": now,
        },
    )
    await redis.zadd(_user_schedule_zset(user_id), {schedule_id: score})

    await emit_server_event(
        redis,
        user_id,
        "schedule.added",
        {"schedule_id": schedule_id, "stage": stage_val, "at": at_val},
    )

    return _public_view(record)


async def list_schedules(redis: Redis, user_id: str) -> list[dict[str, Any]]:
    ids = await redis.zrange(_user_schedule_zset(user_id), 0, -1)
    rows: list[dict[str, Any]] = []
    for sid in ids:
        schedule_id = sid.decode() if isinstance(sid, bytes) else sid
        row = await _load_schedule(redis, schedule_id)
        if row and row.get("user_id") == user_id:
            rows.append(_public_view(row))
    return rows


async def update_schedule(
    redis: Redis,
    user_id: str,
    schedule_id: str,
    *,
    company: str | None = None,
    stage: str | None = None,
    at: str | None = None,
    job_id: str | None = None,
    clear_job_id: bool = False,
    result: str | None = None,
    note: str | None = None,
) -> dict[str, Any]:
    row = await get_schedule_for_user(redis, user_id, schedule_id)
    prev_result = row.get("result") or "待定"
    updates: dict[str, str] = {}

    if company is not None:
        name = company.strip()
        if not name:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Company is required")
        updates["company"] = name
        row["company"] = name

    if stage is not None:
        stage_val = stage.strip()
        if stage_val not in SCHEDULE_STAGES:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid stage")
        updates["stage"] = stage_val
        row["stage"] = stage_val

    if at is not None:
        at_val = at.strip()
        if not at_val:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Interview time is required")
        _at_score(at_val)
        updates["at"] = at_val
        row["at"] = at_val
        await redis.zadd(_user_schedule_zset(user_id), {schedule_id: _at_score(at_val)})

    if clear_job_id:
        updates["job_id"] = ""
        row["job_id"] = ""
    elif job_id is not None:
        if job_id:
            await get_job_for_user(redis, user_id, job_id)
            updates["job_id"] = job_id
            row["job_id"] = job_id
        else:
            updates["job_id"] = ""
            row["job_id"] = ""

    if result is not None:
        if result not in SCHEDULE_RESULTS:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid result")
        updates["result"] = result
        row["result"] = result

    if note is not None:
        updates["note"] = note.strip()
        row["note"] = note.strip()

    if not updates:
        return _public_view(row)

    now = _now_iso()
    updates["updated_at"] = now
    row["updated_at"] = now
    await redis.hset(_schedule_key(schedule_id), mapping=updates)

    if result is not None and result != prev_result:
        await emit_server_event(
            redis,
            user_id,
            "schedule.result_set",
            {"schedule_id": schedule_id, "result": result, "stage": row.get("stage")},
        )

    return _public_view(row)


async def delete_schedule(redis: Redis, user_id: str, schedule_id: str) -> None:
    await get_schedule_for_user(redis, user_id, schedule_id)
    await redis.delete(_schedule_key(schedule_id))
    await redis.zrem(_user_schedule_zset(user_id), schedule_id)
