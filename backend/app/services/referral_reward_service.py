"""Referral incentive assignment and reward ledger."""

from __future__ import annotations

import hashlib
import json
from datetime import datetime, timezone
from typing import Any

from redis.asyncio import Redis

from app.core.redis_client import get_json, set_json
from app.research.experiment_config import FORCED_BY_ARM

REFERRAL_INCENTIVE_OPTIONS = ("task_equity", "cash", "none")


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def pick_referral_incentive_for_user(user_id: str) -> str:
    digest = int(hashlib.sha256(user_id.encode()).hexdigest(), 16)
    return REFERRAL_INCENTIVE_OPTIONS[digest % len(REFERRAL_INCENTIVE_OPTIONS)]


async def ensure_experiment_referral_incentive(redis: Redis, user_data: dict[str, Any]) -> dict[str, Any]:
    """When experiment forces incentive type, assign once at consent/arm time."""
    if not FORCED_BY_ARM.get("referral_incentive"):
        return user_data
    assignment = user_data.get("experiment_assignment") or {}
    if not assignment.get("arm"):
        return user_data
    if user_data.get("referral_incentive_assigned"):
        return user_data

    incentive = pick_referral_incentive_for_user(user_data["id"])
    user_data["referral_incentive"] = incentive
    user_data["referral_incentive_assigned"] = True
    user_data["updated_at"] = _now_iso()
    await set_json(redis, f"user:{user_data['id']}", user_data)
    return user_data


async def append_reward_entry(
    redis: Redis,
    user_id: str,
    *,
    incentive_type: str,
    trigger_event: str,
    status: str = "pending",
    props: dict[str, Any] | None = None,
) -> None:
    entry = {
        "incentive_type": incentive_type,
        "trigger_event": trigger_event,
        "status": status,
        "ts": _now_iso(),
        "props": props or {},
    }
    await redis.rpush(f"research:reward:{user_id}", json.dumps(entry, ensure_ascii=False))


async def on_invitee_qualified_activation(
    redis: Redis,
    invitee_id: str,
    *,
    event_id: str | None = None,
) -> None:
    invitee = await get_json(redis, f"user:{invitee_id}") or {}
    inviter_id = invitee.get("referred_by")
    if not inviter_id:
        return

    inviter = await get_json(redis, f"user:{inviter_id}") or {}
    incentive = inviter.get("referral_incentive") or "none"

    from app.research.pipeline import emit_server_event

    await emit_server_event(
        redis,
        inviter_id,
        "referral.qualified_activation",
        {
            "invitee_id": invitee_id,
            "referral_incentive": incentive,
            "source_event_id": event_id,
        },
    )
    await append_reward_entry(
        redis,
        inviter_id,
        incentive_type=incentive,
        trigger_event="referral.qualified_activation",
        status="recorded",
        props={"invitee_id": invitee_id},
    )
