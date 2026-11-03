"""Org-level aggregates with mandatory minimum group size (cannot be disabled)."""

from __future__ import annotations

from typing import Any

from redis.asyncio import Redis

from app.core.redis_client import get_json

# Fixed threshold — not configurable per org or via API.
AGGREGATE_MIN_GROUP_SIZE = 5
SUPPRESSED_REASON = "人数不足，不展示"


async def _member_qualified_activation(redis: Redis, user_id: str) -> bool:
    qa = await redis.hget(f"research:auto:{user_id}", "qualified_activation")
    if qa is not None:
        try:
            return int(qa) == 1
        except ValueError:
            pass
    from app.services.referral_service import session_counts_toward_activation

    session_ids = await redis.zrevrange(f"user:{user_id}:sessions", 0, -1)
    for session_id in session_ids:
        session = await get_json(redis, f"session:{session_id}")
        if not session or session.get("status") != "completed":
            continue
        metadata = session.get("metadata") or {}
        if not session_counts_toward_activation(metadata):
            continue
        rounds = session.get("rounds") or []
        has_revision_signal = False
        for rnd in rounds:
            for q in rnd.get("questions") or []:
                rev = q.get("revision") or {}
                if rev.get("decision") in ("revise", "decline", "revised", "declined"):
                    has_revision_signal = True
                    break
                if q.get("attempts"):
                    has_revision_signal = True
                    break
            if has_revision_signal:
                break
        if has_revision_signal:
            return True
    return False


async def _member_workshop_done(redis: Redis, user_id: str, org_id: str) -> bool:
    workshop_ids = await redis.lrange(f"org:{org_id}:workshops", 0, -1)
    if not workshop_ids:
        return False
    for wid in workshop_ids:
        if await redis.sismember(f"org:workshop:{wid}:completed", user_id):
            return True
    return False


def _rate(numerator: int, denominator: int) -> float | None:
    if denominator <= 0:
        return None
    return round(numerator / denominator, 4)


async def _group_metrics(
    redis: Redis,
    org_id: str,
    member_ids: list[str],
) -> dict[str, Any]:
    n = len(member_ids)
    if n < AGGREGATE_MIN_GROUP_SIZE:
        return {
            "member_count": n,
            "suppressed": True,
            "suppressed_reason": SUPPRESSED_REASON,
            "qualified_activation_count": None,
            "qualified_activation_rate": None,
            "workshop_completed_count": None,
            "workshop_completion_rate": None,
        }

    qa_count = 0
    ws_count = 0
    for uid in member_ids:
        if await _member_qualified_activation(redis, uid):
            qa_count += 1
        if await _member_workshop_done(redis, uid, org_id):
            ws_count += 1

    return {
        "member_count": n,
        "suppressed": False,
        "suppressed_reason": None,
        "qualified_activation_count": qa_count,
        "qualified_activation_rate": _rate(qa_count, n),
        "workshop_completed_count": ws_count,
        "workshop_completion_rate": _rate(ws_count, n),
    }


async def build_org_aggregate(redis: Redis, org_id: str) -> dict[str, Any]:
    org = await get_json(redis, f"org:{org_id}")
    if not org:
        raise ValueError("org_not_found")

    member_ids = list(await redis.smembers(f"org:{org_id}:members"))
    cohorts: dict[str, list[str]] = {}
    unassigned: list[str] = []

    for uid in member_ids:
        consent = await get_json(redis, f"user:{uid}:org_consent")
        cohort = (consent or {}).get("cohort") or ""
        cohort = str(cohort).strip()
        if cohort:
            cohorts.setdefault(cohort, []).append(uid)
        else:
            unassigned.append(uid)

    groups: list[dict[str, Any]] = []
    for label, ids in sorted(cohorts.items()):
        row = await _group_metrics(redis, org_id, ids)
        row["label"] = label
        groups.append(row)

    if unassigned:
        row = await _group_metrics(redis, org_id, unassigned)
        row["label"] = "未分班"
        groups.append(row)

    totals = await _group_metrics(redis, org_id, member_ids)

    workshop_ids = await redis.lrange(f"org:{org_id}:workshops", 0, -1)
    workshops_public: list[dict[str, Any]] = []
    for wid in workshop_ids:
        ws = await get_json(redis, f"org:workshop:{wid}")
        if ws:
            workshops_public.append(
                {
                    "id": wid,
                    "title": ws.get("title") or "",
                    "mode": ws.get("mode") or "revision",
                    "task_slug": ws.get("task_slug") or "",
                }
            )

    return {
        "org_id": org_id,
        "name": org.get("name") or "",
        "pilot_period": org.get("pilot_period") or "",
        "service_description": org.get("service_description") or "",
        "min_group_size": AGGREGATE_MIN_GROUP_SIZE,
        "totals": totals,
        "groups": groups,
        "workshops": workshops_public,
        "disclaimer": "汇总数据仅用于就业指导与产品改进，不用于招聘筛选或个人排名。",
    }
