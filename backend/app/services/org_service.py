"""Institutional org / university workshop membership and consent."""

from __future__ import annotations

import secrets
from datetime import datetime, timezone
from typing import Any
from uuid import uuid4

from fastapi import HTTPException, status
from redis.asyncio import Redis

from app.core.redis_client import get_json, set_json
from app.models.schemas import UserInDB
from app.research.pipeline import emit_server_event
from app.services.org_aggregate import build_org_aggregate

VALID_SHARE_SCOPES = frozenset({"session", "all"})
VALID_WORKSHOP_MODES = frozenset({"revision", "pair"})


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _invite_code() -> str:
    return secrets.token_urlsafe(6).replace("-", "").replace("_", "")[:8].upper()


async def _get_org_id_by_code(redis: Redis, code: str) -> str | None:
    normalized = code.strip().upper()
    if not normalized:
        return None
    return await redis.get(f"org:invite_code:{normalized}")


async def user_org_role(redis: Redis, user_id: str, org_id: str) -> str | None:
    if await redis.sismember(f"org:{org_id}:mentors", user_id):
        return "mentor"
    org = await get_json(redis, f"org:{org_id}")
    if org and user_id in (org.get("admin_user_ids") or []):
        return "admin"
    if await redis.sismember(f"org:{org_id}:members", user_id):
        return "member"
    return None


async def assert_org_admin_or_platform(
    redis: Redis, user: UserInDB, org_id: str
) -> None:
    if user.is_admin:
        return
    role = await user_org_role(redis, user.id, org_id)
    if role != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="需要机构管理员权限")


async def create_org(
    redis: Redis,
    *,
    name: str,
    pilot_period: str,
    service_description: str,
    fee_paid: bool = False,
    invite_method: str = "admin_invite",
    human_coaching: bool = False,
    admin_user_ids: list[str] | None = None,
) -> dict[str, Any]:
    org_id = uuid4().hex[:16]
    code = _invite_code()
    for _ in range(10):
        if not await redis.exists(f"org:invite_code:{code}"):
            break
        code = _invite_code()
    else:
        raise HTTPException(status_code=500, detail="Could not allocate org invite code")

    now = _now_iso()
    record = {
        "id": org_id,
        "name": name.strip(),
        "pilot_period": pilot_period.strip(),
        "service_description": service_description.strip(),
        "invite_code": code,
        "fee_paid": bool(fee_paid),
        "invite_method": invite_method.strip() or "admin_invite",
        "human_coaching": bool(human_coaching),
        "admin_user_ids": list(admin_user_ids or []),
        "created_at": now,
        "updated_at": now,
    }
    await set_json(redis, f"org:{org_id}", record)
    await redis.set(f"org:invite_code:{code}", org_id)
    await redis.sadd("orgs:all", org_id)
    return record


async def list_orgs_admin(redis: Redis) -> list[dict[str, Any]]:
    org_ids = await redis.smembers("orgs:all")
    rows: list[dict[str, Any]] = []
    for oid in sorted(org_ids):
        org = await get_json(redis, f"org:{oid}")
        if not org:
            continue
        member_count = await redis.scard(f"org:{oid}:members")
        rows.append(
            {
                "id": oid,
                "name": org.get("name"),
                "pilot_period": org.get("pilot_period"),
                "invite_code": org.get("invite_code"),
                "fee_paid": org.get("fee_paid"),
                "invite_method": org.get("invite_method"),
                "human_coaching": org.get("human_coaching"),
                "member_count": member_count,
                "created_at": org.get("created_at"),
            }
        )
    rows.sort(key=lambda r: r.get("created_at") or "", reverse=True)
    return rows


async def update_org_admin(
    redis: Redis,
    org_id: str,
    *,
    name: str | None = None,
    pilot_period: str | None = None,
    service_description: str | None = None,
    fee_paid: bool | None = None,
    invite_method: str | None = None,
    human_coaching: bool | None = None,
) -> dict[str, Any]:
    org = await get_json(redis, f"org:{org_id}")
    if not org:
        raise HTTPException(status_code=404, detail="机构不存在")
    if name is not None:
        org["name"] = name.strip()
    if pilot_period is not None:
        org["pilot_period"] = pilot_period.strip()
    if service_description is not None:
        org["service_description"] = service_description.strip()
    if fee_paid is not None:
        org["fee_paid"] = bool(fee_paid)
    if invite_method is not None:
        org["invite_method"] = invite_method.strip()
    if human_coaching is not None:
        org["human_coaching"] = bool(human_coaching)
    org["updated_at"] = _now_iso()
    await set_json(redis, f"org:{org_id}", org)
    return org


async def add_workshop(
    redis: Redis,
    org_id: str,
    *,
    title: str,
    description: str,
    mode: str,
    task_slug: str = "",
) -> dict[str, Any]:
    org = await get_json(redis, f"org:{org_id}")
    if not org:
        raise HTTPException(status_code=404, detail="机构不存在")
    if mode not in VALID_WORKSHOP_MODES:
        raise HTTPException(status_code=400, detail="无效的工作坊模式")
    wid = uuid4().hex[:12]
    now = _now_iso()
    ws = {
        "id": wid,
        "org_id": org_id,
        "title": title.strip(),
        "description": description.strip(),
        "mode": mode,
        "task_slug": task_slug.strip(),
        "created_at": now,
    }
    await set_json(redis, f"org:workshop:{wid}", ws)
    await redis.rpush(f"org:{org_id}:workshops", wid)
    return ws


async def add_org_mentor(redis: Redis, org_id: str, mentor_user_id: str) -> None:
    org = await get_json(redis, f"org:{org_id}")
    if not org:
        raise HTTPException(status_code=404, detail="机构不存在")
    await redis.sadd(f"org:{org_id}:mentors", mentor_user_id)
    user_data = await get_json(redis, f"user:{mentor_user_id}")
    if user_data:
        user_data["org_id"] = org_id
        user_data["org_role"] = "mentor"
        user_data["updated_at"] = _now_iso()
        await set_json(redis, f"user:{mentor_user_id}", user_data)


async def preview_join(redis: Redis, code: str) -> dict[str, Any]:
    org_id = await _get_org_id_by_code(redis, code)
    if not org_id:
        raise HTTPException(status_code=404, detail="邀请码无效")
    org = await get_json(redis, f"org:{org_id}")
    if not org:
        raise HTTPException(status_code=404, detail="机构不存在")
    return {
        "org_id": org_id,
        "name": org.get("name") or "",
        "pilot_period": org.get("pilot_period") or "",
        "service_description": org.get("service_description") or "",
        "invite_code": code.strip().upper(),
    }


async def join_org(
    redis: Redis,
    user: UserInDB,
    code: str,
    *,
    cohort: str,
    org_consent_accepted: bool,
    share_with_mentor: bool,
    share_scope: str,
) -> dict[str, Any]:
    if not org_consent_accepted:
        raise HTTPException(status_code=400, detail="请先阅读并确认机构数据说明")
    if share_scope not in VALID_SHARE_SCOPES:
        raise HTTPException(status_code=400, detail="无效的分享范围")

    org_id = await _get_org_id_by_code(redis, code)
    if not org_id:
        raise HTTPException(status_code=404, detail="邀请码无效")
    org = await get_json(redis, f"org:{org_id}")
    if not org:
        raise HTTPException(status_code=404, detail="机构不存在")

    if await redis.sismember(f"org:{org_id}:members", user.id):
        raise HTTPException(status_code=400, detail="您已加入该机构")

    now = _now_iso()
    await redis.sadd(f"org:{org_id}:members", user.id)

    consent = {
        "org_id": org_id,
        "share_with_mentor": bool(share_with_mentor),
        "share_scope": share_scope,
        "cohort": cohort.strip(),
        "accepted_at": now,
        "updated_at": now,
        "research_distinction": {
            "fee_paid": bool(org.get("fee_paid")),
            "invite_method": org.get("invite_method") or "admin_invite",
            "human_coaching": bool(org.get("human_coaching")),
        },
    }
    await set_json(redis, f"user:{user.id}:org_consent", consent)

    user_data = await get_json(redis, f"user:{user.id}")
    if user_data:
        user_data["org_id"] = org_id
        user_data["org_role"] = "member"
        user_data["org_joined_at"] = now
        user_data["org_invite_method"] = org.get("invite_method")
        user_data["org_fee_paid"] = org.get("fee_paid")
        user_data["org_human_coaching"] = org.get("human_coaching")
        user_data["updated_at"] = now
        await set_json(redis, f"user:{user.id}", user_data)

    await emit_server_event(
        redis,
        user.id,
        "org.joined",
        {
            "org_id": org_id,
            "invite_method": org.get("invite_method"),
            "fee_paid": org.get("fee_paid"),
            "human_coaching": org.get("human_coaching"),
            "cohort": cohort.strip(),
        },
    )

    return {"org_id": org_id, "consent": consent}


async def get_membership(redis: Redis, user_id: str) -> dict[str, Any] | None:
    user_data = await get_json(redis, f"user:{user_id}")
    if not user_data or not user_data.get("org_id"):
        consent = await get_json(redis, f"user:{user_id}:org_consent")
        if not consent:
            return None
        org_id = consent.get("org_id")
    else:
        org_id = user_data.get("org_id")
    org = await get_json(redis, f"org:{org_id}") if org_id else None
    consent = await get_json(redis, f"user:{user_id}:org_consent")
    role = user_data.get("org_role") if user_data else None
    if org_id and not role:
        role = await user_org_role(redis, user_id, org_id)
    shared = await redis.smembers(f"user:{user_id}:org_mentor_sessions")
    workshops: list[dict[str, Any]] = []
    if org_id and role == "member":
        workshop_ids = await redis.lrange(f"org:{org_id}:workshops", 0, -1)
        for wid in workshop_ids:
            ws = await get_json(redis, f"org:workshop:{wid}")
            if not ws:
                continue
            done = await redis.sismember(f"org:workshop:{wid}:completed", user_id)
            workshops.append(
                {
                    "id": wid,
                    "title": ws.get("title") or "",
                    "mode": ws.get("mode") or "revision",
                    "task_slug": ws.get("task_slug") or "",
                    "completed": bool(done),
                }
            )
    return {
        "org_id": org_id,
        "org_name": (org or {}).get("name") or "",
        "role": role,
        "consent": consent,
        "shared_session_ids": sorted(shared),
        "workshops": workshops,
    }


async def update_org_consent(
    redis: Redis,
    user: UserInDB,
    *,
    share_with_mentor: bool | None = None,
    share_scope: str | None = None,
    cohort: str | None = None,
) -> dict[str, Any]:
    consent = await get_json(redis, f"user:{user.id}:org_consent")
    if not consent:
        raise HTTPException(status_code=400, detail="尚未加入机构")
    if share_scope is not None and share_scope not in VALID_SHARE_SCOPES:
        raise HTTPException(status_code=400, detail="无效的分享范围")
    if share_with_mentor is not None:
        consent["share_with_mentor"] = bool(share_with_mentor)
    if share_scope is not None:
        consent["share_scope"] = share_scope
    if cohort is not None:
        consent["cohort"] = cohort.strip()
    consent["updated_at"] = _now_iso()
    await set_json(redis, f"user:{user.id}:org_consent", consent)
    return consent


async def share_session_with_mentor(redis: Redis, user: UserInDB, session_id: str) -> dict[str, Any]:
    consent = await get_json(redis, f"user:{user.id}:org_consent")
    if not consent:
        raise HTTPException(status_code=400, detail="尚未加入机构")
    if not consent.get("share_with_mentor"):
        raise HTTPException(status_code=400, detail="请先在机构同意中开启与指导者分享")

    session = await get_json(redis, f"session:{session_id}")
    if not session or session.get("user_id") != user.id:
        raise HTTPException(status_code=404, detail="会话不存在")

    await redis.sadd(f"user:{user.id}:org_mentor_sessions", session_id)

    await emit_server_event(
        redis,
        user.id,
        "org.mentor_share",
        {"org_id": consent.get("org_id"), "session_id": session_id, "share_scope": consent.get("share_scope")},
    )

    return {"session_id": session_id, "shared": True}


def _mentor_safe_session(session: dict[str, Any]) -> dict[str, Any]:
    """No scores, rankings, or hiring-style reports."""
    rounds = session.get("rounds") or []
    questions_summary: list[dict[str, Any]] = []
    for rnd in rounds:
        for q in rnd.get("questions") or []:
            rev = q.get("revision") or {}
            questions_summary.append(
                {
                    "title": q.get("title") or q.get("text") or "题目",
                    "revision_decision": rev.get("decision"),
                    "attempt_count": len(q.get("attempts") or []),
                }
            )
    metadata = session.get("metadata") or {}
    return {
        "session_id": session.get("id"),
        "session_type": metadata.get("interview_type") or session.get("type") or "interview",
        "completed_at": session.get("completed_at"),
        "question_count": len(questions_summary),
        "questions": questions_summary,
        "note": "仅展示学生同意分享的练习摘要，不含分数与录用建议。",
    }


async def _sessions_visible_to_mentor(
    redis: Redis, member_id: str, consent: dict[str, Any]
) -> list[str]:
    if not consent.get("share_with_mentor"):
        return []
    scope = consent.get("share_scope") or "session"
    if scope == "all":
        ids = await redis.zrevrange(f"user:{member_id}:sessions", 0, 49)
        out: list[str] = []
        for sid in ids:
            session = await get_json(redis, f"session:{sid}")
            if session and session.get("status") == "completed":
                out.append(sid)
        return out
    return list(await redis.smembers(f"user:{member_id}:org_mentor_sessions"))


async def list_mentor_shared_sessions(redis: Redis, mentor: UserInDB) -> list[dict[str, Any]]:
    org_id = mentor.org_id if hasattr(mentor, "org_id") else None
    user_data = await get_json(redis, f"user:{mentor.id}")
    org_id = org_id or (user_data or {}).get("org_id")
    if not org_id:
        raise HTTPException(status_code=400, detail="未关联机构")
    if not await redis.sismember(f"org:{org_id}:mentors", mentor.id):
        role = await user_org_role(redis, mentor.id, org_id)
        if role != "admin" and not (user_data and user_data.get("is_admin")):
            raise HTTPException(status_code=403, detail="需要指导者权限")

    member_ids = await redis.smembers(f"org:{org_id}:members")
    rows: list[dict[str, Any]] = []
    for mid in member_ids:
        consent = await get_json(redis, f"user:{mid}:org_consent")
        if not consent:
            continue
        session_ids = await _sessions_visible_to_mentor(redis, mid, consent)
        if not session_ids:
            continue
        member_user = await get_json(redis, f"user:{mid}")
        label = (member_user or {}).get("name") or mid[:8]
        for sid in session_ids:
            session = await get_json(redis, f"session:{sid}")
            if not session:
                continue
            row = _mentor_safe_session(session)
            row["member_label"] = label
            rows.append(row)
    rows.sort(key=lambda r: r.get("completed_at") or "", reverse=True)
    return rows


async def complete_workshop(redis: Redis, user: UserInDB, workshop_id: str) -> dict[str, Any]:
    ws = await get_json(redis, f"org:workshop:{workshop_id}")
    if not ws:
        raise HTTPException(status_code=404, detail="工作坊不存在")
    org_id = ws.get("org_id")
    if not org_id or not await redis.sismember(f"org:{org_id}:members", user.id):
        raise HTTPException(status_code=403, detail="仅机构成员可标记完成")

    await redis.sadd(f"org:workshop:{workshop_id}:completed", user.id)
    await emit_server_event(
        redis,
        user.id,
        "workshop.completed",
        {"org_id": org_id, "workshop_id": workshop_id, "mode": ws.get("mode")},
    )
    return {"workshop_id": workshop_id, "completed": True}


async def get_aggregate_for_user(redis: Redis, user: UserInDB, org_id: str) -> dict[str, Any]:
    await assert_org_admin_or_platform(redis, user, org_id)
    try:
        return await build_org_aggregate(redis, org_id)
    except ValueError as exc:
        if str(exc) == "org_not_found":
            raise HTTPException(status_code=404, detail="机构不存在") from exc
        raise
