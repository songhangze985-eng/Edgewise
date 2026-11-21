"""Durable Secondary Index Layer (`index_store.py`).

Ensures secondary lookup indexes (`users:all`, `user:email:{email}`, `user:invite_code:{code}`,
`user:{user_id}:sessions`, `questions:all`, `lgd_rooms:all`) are persisted in MongoDB (`system_indexes`
and primary collections) alongside Redis fast lookup structures, and transparently backfilled on Redis cache miss.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any

from redis.asyncio import Redis

from app.core.mongo_client import mongo_store


async def _safe_sadd(redis: Redis, key: str, *values: str) -> None:
    if values and hasattr(redis, "sadd"):
        await redis.sadd(key, *values)


async def _safe_srem(redis: Redis, key: str, *values: str) -> None:
    if values and hasattr(redis, "srem"):
        await redis.srem(key, *values)


async def index_user_registration(
    redis: Redis,
    *,
    user_id: str,
    email: str,
    invite_code: str | None = None,
) -> None:
    normalized_email = (email or "").strip().lower()
    if normalized_email:
        await redis.set(f"user:email:{normalized_email}", user_id)
        await mongo_store.upsert_by_cache_key(
            f"user:email:{normalized_email}",
            {"email": normalized_email, "user_id": user_id},
        )
    await _safe_sadd(redis, "users:all", user_id)
    await mongo_store.update_nested_fields(
        "users:all",
        nested_attr="members",
        updates={user_id: True},
    )
    if invite_code:
        await index_user_invite_code(redis, user_id=user_id, invite_code=invite_code)


async def index_user_invite_code(redis: Redis, *, user_id: str, invite_code: str) -> None:
    normalized = (invite_code or "").strip().upper()
    if not normalized:
        return
    await redis.set(f"user:invite_code:{normalized}", user_id)
    await mongo_store.upsert_by_cache_key(
        f"user:invite_code:{normalized}",
        {"invite_code": normalized, "user_id": user_id},
    )


async def lookup_user_id_by_email(redis: Redis, email: str) -> str | None:
    normalized = (email or "").strip().lower()
    if not normalized:
        return None
    cached_uid = await redis.get(f"user:email:{normalized}")
    if cached_uid:
        return cached_uid

    idx_doc = await mongo_store.find_by_cache_key(f"user:email:{normalized}")
    uid = (idx_doc or {}).get("user_id")
    if not uid:
        user_doc = await mongo_store.find_user_by_email(normalized)
        uid = (user_doc or {}).get("id")
    if uid:
        await redis.set(f"user:email:{normalized}", uid)
        await _safe_sadd(redis, "users:all", uid)
        return str(uid)
    return None


async def lookup_user_id_by_invite_code(redis: Redis, invite_code: str) -> str | None:
    normalized = (invite_code or "").strip().upper()
    if not normalized:
        return None
    cached_uid = await redis.get(f"user:invite_code:{normalized}")
    if cached_uid:
        return cached_uid

    idx_doc = await mongo_store.find_by_cache_key(f"user:invite_code:{normalized}")
    uid = (idx_doc or {}).get("user_id")
    if not uid:
        user_doc = await mongo_store.find_user_by_invite_code(normalized)
        uid = (user_doc or {}).get("id")
    if uid:
        await redis.set(f"user:invite_code:{normalized}", uid)
        return str(uid)
    return None


async def get_all_user_ids(redis: Redis) -> list[str]:
    members = set(await redis.smembers("users:all")) if hasattr(redis, "smembers") else set()
    # Merge the durable index even when Redis contains only a partially restored set.
    idx_doc = await mongo_store.find_by_cache_key("users:all")
    recovered: set[str] = set((idx_doc or {}).get("members", {}).keys())
    if not recovered:
        user_docs = await mongo_store.list_collection_docs("users")
        for doc in user_docs:
            uid = doc.get("id")
            if uid:
                recovered.add(str(uid))
                email = (doc.get("email") or "").strip().lower()
                if email:
                    await redis.set(f"user:email:{email}", str(uid))
    missing = recovered - members
    if missing:
        await _safe_sadd(redis, "users:all", *sorted(missing))
    return sorted(members | recovered)


async def index_add_user_session(
    redis: Redis,
    user_id: str,
    session_id: str,
    score_ts: float,
) -> None:
    if hasattr(redis, "zadd"):
        await redis.zadd(f"user:{user_id}:sessions", {session_id: float(score_ts)})
    await mongo_store.update_nested_fields(
        f"user:{user_id}:sessions",
        nested_attr="scores",
        updates={session_id: float(score_ts)},
        base_fields={"user_id": user_id},
    )


def _session_sort_timestamp(doc: dict[str, Any]) -> float:
    raw_ts = doc.get("created_at") or doc.get("updated_at")
    if raw_ts:
        try:
            return datetime.fromisoformat(str(raw_ts).replace("Z", "+00:00")).timestamp()
        except Exception:
            pass
    return 0.0


async def get_user_session_ids(
    redis: Redis,
    user_id: str,
    *,
    start: int = 0,
    stop: int = -1,
) -> list[str]:
    key = f"user:{user_id}:sessions"
    scores_map: dict[str, float] = {}
    if hasattr(redis, "zrevrange"):
        cached_pairs = await redis.zrevrange(key, 0, -1, withscores=True)
        scores_map.update({str(sid): float(score) for sid, score in cached_pairs})

    # Merge the durable index even if Redis has already been partially restored.
    idx_doc = await mongo_store.find_by_cache_key(key)
    raw_scores = (idx_doc or {}).get("scores") or {}
    for sid, sc in raw_scores.items():
        try:
            scores_map[str(sid)] = float(sc)
        except (TypeError, ValueError):
            pass

    if not raw_scores:
        session_docs = await mongo_store.list_collection_docs("sessions", {"user_id": user_id})
        for doc in session_docs:
            sid = doc.get("id")
            if sid and not doc.get("room_id"):  # distinguish session:* from lgd_report:*
                scores_map[str(sid)] = _session_sort_timestamp(doc)

    if not scores_map:
        return []

    if hasattr(redis, "zadd"):
        await redis.zadd(key, scores_map)

    ordered = [sid for sid, _ in sorted(scores_map.items(), key=lambda item: (item[1], item[0]), reverse=True)]
    if stop == -1:
        return ordered[start:]
    return ordered[start : stop + 1]


async def index_add_question_id(redis: Redis, question_id: str) -> None:
    await _safe_sadd(redis, "questions:all", question_id)
    await mongo_store.update_nested_fields(
        "questions:all",
        nested_attr="members",
        updates={question_id: True},
    )


async def index_remove_question_id(redis: Redis, question_id: str) -> None:
    await _safe_srem(redis, "questions:all", question_id)
    idx_doc = await mongo_store.find_by_cache_key("questions:all")
    if idx_doc and isinstance(idx_doc.get("members"), dict) and question_id in idx_doc["members"]:
        members = dict(idx_doc["members"])
        members.pop(question_id, None)
        await mongo_store.upsert_by_cache_key("questions:all", {"members": members})


async def get_all_question_ids(redis: Redis) -> list[str]:
    ids = set(await redis.smembers("questions:all")) if hasattr(redis, "smembers") else set()
    if ids:
        return sorted(ids)

    idx_doc = await mongo_store.find_by_cache_key("questions:all")
    recovered: set[str] = set((idx_doc or {}).get("members", {}).keys())
    if not recovered:
        docs = await mongo_store.list_collection_docs("questions")
        for d in docs:
            if d.get("id"):
                recovered.add(str(d["id"]))
    if recovered:
        await _safe_sadd(redis, "questions:all", *sorted(recovered))
    return sorted(recovered)


async def index_add_lgd_room_id(redis: Redis, room_id: str) -> None:
    await _safe_sadd(redis, "lgd_rooms:all", room_id)
    await mongo_store.update_nested_fields(
        "lgd_rooms:all",
        nested_attr="members",
        updates={room_id: True},
    )


async def get_all_lgd_room_ids(redis: Redis) -> list[str]:
    ids = set(await redis.smembers("lgd_rooms:all")) if hasattr(redis, "smembers") else set()
    if ids:
        return list(ids)

    idx_doc = await mongo_store.find_by_cache_key("lgd_rooms:all")
    recovered: set[str] = set((idx_doc or {}).get("members", {}).keys())
    if not recovered:
        docs = await mongo_store.list_collection_docs("lgd_rooms")
        for d in docs:
            # Exclude lgd_memory docs (which have memory_enabled/last_topic rather than participants/phases)
            if d.get("id") and "phases" in d:
                recovered.add(str(d["id"]))
    if recovered:
        await _safe_sadd(redis, "lgd_rooms:all", *sorted(recovered))
    return list(recovered)
