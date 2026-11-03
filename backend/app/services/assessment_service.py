from __future__ import annotations

from datetime import datetime, timezone
from typing import Any
from uuid import uuid4

from redis.asyncio import Redis

from app.core.redis_client import get_json, set_json
from app.services.assessment_loader import load_aptitude_bank, load_personality_bank
from app.services.consistency_checker import evaluate_personality_consistency

APTITUDE_CATEGORIES = ("verbal", "quant", "figural", "data")


def _assessment_key(assessment_id: str) -> str:
    return f"assessment:{assessment_id}"


def _user_assessments_zset(user_id: str) -> str:
    return f"user:{user_id}:assessments"


def _public_aptitude_item(row: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": row["id"],
        "category": row["category"],
        "stem": row.get("stem"),
        "options": row.get("options") or [],
        "figural_svg": row.get("figural_svg"),
        "choice_index": row.get("choice_index"),
        "time_spent_sec": row.get("time_spent_sec"),
        "answered": row.get("choice_index") is not None,
    }


def _public_personality_item(row: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": row["id"],
        "option_a": row.get("option_a"),
        "option_b": row.get("option_b"),
        "choice": row.get("choice"),
        "answered": row.get("choice") in ("A", "B"),
    }


def assessment_to_public(record: dict[str, Any]) -> dict[str, Any]:
    report = record.get("report")
    return {
        "id": record["id"],
        "user_id": record["user_id"],
        "status": record["status"],
        "disclaimer": record.get("disclaimer"),
        "created_at": record["created_at"],
        "updated_at": record["updated_at"],
        "completed_at": record.get("completed_at"),
        "aptitude_blocks": record.get("aptitude_blocks") or [],
        "aptitude_items": [_public_aptitude_item(i) for i in (record.get("aptitude_items") or [])],
        "personality_items": [
            _public_personality_item(i) for i in (record.get("personality_items") or [])
        ],
        "report": report,
    }


def _build_new_record(user_id: str) -> dict[str, Any]:
    apt_bank = load_aptitude_bank()
    per_bank = load_personality_bank()
    now = datetime.now(timezone.utc).isoformat()
    meta = apt_bank.get("meta") or {}
    disclaimer = meta.get("disclaimer") or "谈锋自编练习题，仅供练习。"

    aptitude_items: list[dict[str, Any]] = []
    for raw in apt_bank["items"]:
        aptitude_items.append(
            {
                "id": raw["id"],
                "category": raw["category"],
                "stem": raw.get("stem"),
                "options": raw.get("options") or [],
                "figural_svg": raw.get("figural_svg"),
                "correct_index": raw.get("correct_index"),
                "choice_index": None,
                "time_spent_sec": None,
            }
        )

    personality_items: list[dict[str, Any]] = []
    for raw in per_bank["items"]:
        personality_items.append(
            {
                "id": raw["id"],
                "option_a": raw.get("option_a"),
                "option_b": raw.get("option_b"),
                "choice": None,
            }
        )

    blocks = []
    for block in apt_bank.get("blocks") or []:
        blocks.append(
            {
                "category": block["category"],
                "label": block.get("label") or block["category"],
                "time_limit_sec": int(block.get("time_limit_sec") or 180),
                "time_spent_sec": 0,
                "completed": False,
            }
        )

    return {
        "id": uuid4().hex,
        "user_id": user_id,
        "status": "in_progress",
        "disclaimer": disclaimer,
        "created_at": now,
        "updated_at": now,
        "completed_at": None,
        "aptitude_blocks": blocks,
        "aptitude_items": aptitude_items,
        "personality_items": personality_items,
        "report": None,
    }


async def create_assessment_session(redis: Redis, user_id: str) -> dict[str, Any]:
    record = _build_new_record(user_id)
    assessment_id = record["id"]
    await set_json(redis, _assessment_key(assessment_id), record)
    await redis.zadd(
        _user_assessments_zset(user_id),
        {assessment_id: datetime.fromisoformat(record["created_at"]).timestamp()},
    )
    return assessment_to_public(record)


async def get_assessment_for_user(
    redis: Redis, user_id: str, assessment_id: str
) -> dict[str, Any]:
    record = await get_json(redis, _assessment_key(assessment_id))
    if record is None:
        raise KeyError("not_found")
    if record.get("user_id") != user_id:
        raise PermissionError("forbidden")
    return assessment_to_public(record)


def _score_aptitude(record: dict[str, Any]) -> dict[str, Any]:
    by_cat: dict[str, dict[str, Any]] = {}
    for cat in APTITUDE_CATEGORIES:
        by_cat[cat] = {
            "label": cat,
            "correct": 0,
            "answered": 0,
            "total": 0,
            "time_spent_sec": 0,
            "accuracy": None,
        }

    block_labels = {
        b["category"]: b.get("label") or b["category"] for b in record.get("aptitude_blocks") or []
    }

    for item in record.get("aptitude_items") or []:
        cat = item.get("category")
        if cat not in by_cat:
            continue
        by_cat[cat]["total"] += 1
        by_cat[cat]["label"] = block_labels.get(cat, cat)
        choice = item.get("choice_index")
        if choice is None:
            continue
        by_cat[cat]["answered"] += 1
        spent = item.get("time_spent_sec")
        if isinstance(spent, (int, float)) and spent >= 0:
            by_cat[cat]["time_spent_sec"] += int(spent)
        correct_index = item.get("correct_index")
        if correct_index is not None and choice == correct_index:
            by_cat[cat]["correct"] += 1

    for cat, row in by_cat.items():
        answered = row["answered"]
        if answered > 0:
            row["accuracy"] = round(row["correct"] / answered, 3)
        else:
            row["accuracy"] = None

    for block in record.get("aptitude_blocks") or []:
        cat = block.get("category")
        if cat in by_cat and block.get("time_spent_sec"):
            by_cat[cat]["time_spent_sec"] = max(
                by_cat[cat]["time_spent_sec"], int(block.get("time_spent_sec") or 0)
            )

    return {"by_category": by_cat}


async def record_assessment_answer(
    redis: Redis,
    user_id: str,
    assessment_id: str,
    *,
    section: str,
    item_id: str,
    choice_index: int | None = None,
    choice: str | None = None,
    time_spent_sec: int | None = None,
    block_category: str | None = None,
    block_time_spent_sec: int | None = None,
) -> dict[str, Any]:
    record = await get_json(redis, _assessment_key(assessment_id))
    if record is None:
        raise KeyError("not_found")
    if record.get("user_id") != user_id:
        raise PermissionError("forbidden")
    if record.get("status") == "completed":
        raise ValueError("already_completed")

    now = datetime.now(timezone.utc).isoformat()

    if section == "aptitude":
        if item_id:
            target = next(
                (i for i in record.get("aptitude_items") or [] if i.get("id") == item_id),
                None,
            )
            if target is None:
                raise KeyError("item_not_found")
            if choice_index is not None:
                options = target.get("options") or []
                if choice_index < 0 or choice_index >= len(options):
                    raise ValueError("invalid_choice")
                target["choice_index"] = choice_index
            if time_spent_sec is not None:
                target["time_spent_sec"] = max(0, int(time_spent_sec))
        elif not block_category:
            raise KeyError("item_not_found")
    elif section == "personality":
        target = next(
            (i for i in record.get("personality_items") or [] if i.get("id") == item_id), None
        )
        if target is None:
            raise KeyError("item_not_found")
        if choice is not None:
            if choice not in ("A", "B"):
                raise ValueError("invalid_choice")
            target["choice"] = choice
    else:
        raise ValueError("invalid_section")

    if block_category and block_time_spent_sec is not None:
        for block in record.get("aptitude_blocks") or []:
            if block.get("category") == block_category:
                block["time_spent_sec"] = max(0, int(block_time_spent_sec))
                block["completed"] = True

    record["updated_at"] = now
    await set_json(redis, _assessment_key(assessment_id), record)
    return assessment_to_public(record)


async def complete_assessment_session(
    redis: Redis, user_id: str, assessment_id: str
) -> dict[str, Any]:
    record = await get_json(redis, _assessment_key(assessment_id))
    if record is None:
        raise KeyError("not_found")
    if record.get("user_id") != user_id:
        raise PermissionError("forbidden")

    now = datetime.now(timezone.utc).isoformat()
    aptitude_report = _score_aptitude(record)
    personality_report = evaluate_personality_consistency(
        record.get("personality_items") or [],
        load_personality_bank()["items"],
    )

    record["status"] = "completed"
    record["completed_at"] = now
    record["updated_at"] = now
    record["report"] = {
        "aptitude": aptitude_report,
        "personality": personality_report,
    }
    await set_json(redis, _assessment_key(assessment_id), record)
    return assessment_to_public(record)
