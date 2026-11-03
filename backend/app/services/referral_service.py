from __future__ import annotations

import secrets
from datetime import datetime, timezone
from typing import Any

from fastapi import HTTPException, status
from redis.asyncio import Redis

from app.core.redis_client import get_json, set_json
from app.research.pipeline import emit_server_event

REFERRAL_INCENTIVES = frozenset({"task_equity", "cash", "none"})
DEFAULT_REFERRAL_INCENTIVE = "none"


def generate_invite_code() -> str:
    return secrets.token_urlsafe(6).replace("-", "").replace("_", "")[:8].upper()


async def ensure_user_invite_code(redis: Redis, user_data: dict[str, Any]) -> str:
    existing = user_data.get("invite_code")
    if existing:
        return existing
    for _ in range(8):
        code = generate_invite_code()
        key = f"user:invite_code:{code}"
        if not await redis.exists(key):
            await redis.set(key, user_data["id"])
            user_data["invite_code"] = code
            if user_data.get("referral_incentive") is None:
                user_data["referral_incentive"] = DEFAULT_REFERRAL_INCENTIVE
            user_data["updated_at"] = datetime.now(timezone.utc).isoformat()
            await set_json(redis, f"user:{user_data['id']}", user_data)
            return code
    raise HTTPException(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        detail="Could not allocate invite code",
    )


async def resolve_inviter_by_code(redis: Redis, invite_code: str) -> dict[str, Any] | None:
    normalized = invite_code.strip().upper()
    if not normalized:
        return None
    inviter_id = await redis.get(f"user:invite_code:{normalized}")
    if not inviter_id:
        return None
    inviter = await get_json(redis, f"user:{inviter_id}")
    return inviter


async def bind_referral(
    redis: Redis,
    invitee_data: dict[str, Any],
    invite_code: str,
) -> dict[str, Any]:
    if invitee_data.get("referred_by"):
        return invitee_data

    inviter = await resolve_inviter_by_code(redis, invite_code)
    if not inviter:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid invite code")
    if inviter["id"] == invitee_data["id"]:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Cannot use your own invite code")

    now = datetime.now(timezone.utc).isoformat()
    invitee_data["referred_by"] = inviter["id"]
    invitee_data["updated_at"] = now
    await set_json(redis, f"user:{invitee_data['id']}", invitee_data)

    event_id = f"{inviter['id']}:{invitee_data['id']}"
    await set_json(
        redis,
        f"research:invite_event:{event_id}",
        {
            "inviter_id": inviter["id"],
            "invitee_id": invitee_data["id"],
            "invite_code": inviter.get("invite_code") or invite_code.strip().upper(),
            "created_at": now,
        },
    )
    await redis.sadd(f"research:inviter:{inviter['id']}:invitees", invitee_data["id"])
    await redis.sadd("research:invite_events:all", event_id)
    await emit_server_event(
        redis,
        inviter["id"],
        "referral.bound",
        {"inviter_id": inviter["id"], "invitee_id": invitee_data["id"]},
    )
    return invitee_data


def session_counts_toward_activation(metadata: dict[str, Any]) -> bool:
    if metadata.get("counts_toward_activation") is False:
        return False
    if metadata.get("participation_mode") == "demo":
        return False
    source = metadata.get("source") or ""
    if source in {"experiment_assigned_practice", "research_posttest"}:
        return False
    return metadata.get("counts_toward_activation", True) is not False


async def build_referral_stats(redis: Redis) -> list[dict[str, Any]]:
    user_ids = await redis.smembers("users:all")
    rows: list[dict[str, Any]] = []

    for user_id in user_ids:
        user_data = await get_json(redis, f"user:{user_id}")
        if not user_data or not user_data.get("invite_code"):
            continue
        invitee_ids = await redis.smembers(f"research:inviter:{user_id}:invitees")
        if not invitee_ids:
            continue

        eligible_invitees: set[str] = set()
        net_contribution = 0
        for invitee_id in invitee_ids:
            session_ids = await redis.zrevrange(f"user:{invitee_id}:sessions", 0, -1)
            invitee_eligible = False
            for session_id in session_ids:
                session = await get_json(redis, f"session:{session_id}")
                if not session or session.get("status") != "completed":
                    continue
                metadata = session.get("metadata") or {}
                if session_counts_toward_activation(metadata):
                    invitee_eligible = True
                    net_contribution += 1
            if invitee_eligible:
                eligible_invitees.add(invitee_id)

        rows.append(
            {
                "inviter_id": user_id,
                "inviter_email": user_data.get("email"),
                "invite_code": user_data.get("invite_code"),
                "referral_incentive": user_data.get("referral_incentive", DEFAULT_REFERRAL_INCENTIVE),
                "assigned_invitees": len(invitee_ids),
                "eligible_practice_invitees": len(eligible_invitees),
                "net_contribution_count": net_contribution,
            }
        )

    rows.sort(key=lambda row: row["net_contribution_count"], reverse=True)
    return rows
