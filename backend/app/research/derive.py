from __future__ import annotations

import hashlib
import json
from datetime import datetime, timedelta, timezone
from typing import Any

from redis.asyncio import Redis

from app.core.index_store import get_user_session_ids
from app.core.redis_client import get_json
from app.core.mongo_client import mongo_store
from app.research.keys import RULE_VERSION, auto_hash_key, auto_meta_key
from app.research.events import (
    completed_research_practice_at,
    current_cycle_posttest_dates,
    event_times_in_consent_cycle,
    read_event_stream,
    user_has_research_consent,
)
POSITION_TO_ROLE = {
    "技术": "技术",
    "工程": "技术",
    "开发": "技术",
    "产品": "产品",
    "运营": "运营",
    "市场": "运营",
    "职能": "职能",
    "管理": "职能",
}


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _session_counts_toward_activation(metadata: dict[str, Any]) -> bool:
    if metadata.get("counts_toward_activation") is False:
        return False
    if metadata.get("participation_mode") == "demo":
        return False
    source = metadata.get("source") or ""
    if source in {"experiment_assigned_practice", "research_posttest"}:
        return False
    return metadata.get("counts_toward_activation", True) is not False


async def _auto_storage_id(redis: Redis, user_id: str) -> str:
    user = await get_json(redis, f"user:{user_id}") or {}
    consent = user.get("research_consent") or {}
    if consent.get("had_declined"):
        cycle = consent.get("accepted_at") or "unknown"
        digest = hashlib.sha256(cycle.encode()).hexdigest()
        return f"{user_id}:cycle:{digest}"
    return user_id


async def get_auto_value_raw(redis: Redis, user_id: str, field: str) -> str | None:
    storage_id = await _auto_storage_id(redis, user_id)
    key = auto_hash_key(storage_id)
    doc = await mongo_store.find_by_cache_key(key)
    fields = (doc or {}).get("fields") or {}
    if field in fields:
        value = fields[field]
        return value if isinstance(value, str) else json.dumps(value, ensure_ascii=False)
    return await redis.hget(key, field)


async def set_auto_field(
    redis: Redis,
    user_id: str,
    field: str,
    value: Any,
    *,
    source_event_id: str | None = None,
) -> None:
    storage_id = await _auto_storage_id(redis, user_id)
    key, meta_key = auto_hash_key(storage_id), auto_meta_key(storage_id)
    serialized = json.dumps(value, ensure_ascii=False) if not isinstance(value, str) else value
    meta = {
        "computed_at": _now_iso(),
        "rule_version": RULE_VERSION,
        "source_event_id": source_event_id,
    }
    await mongo_store.update_nested_fields(
        key, nested_attr="fields", updates={field: value},
        base_fields={"user_id": user_id, "doc_type": "research_auto", f"metadata.{field}": meta},
    )
    await redis.hset(key, field, serialized)
    await redis.hset(meta_key, field, json.dumps(meta, ensure_ascii=False))


async def _increment_auto_counter(
    redis: Redis, user_id: str, field: str, source_event_id: str | None, *,
    aliases: tuple[str, ...] = (), receipt_id: str | None = None,
) -> None:
    storage_id = await _auto_storage_id(redis, user_id)
    key, meta_key = auto_hash_key(storage_id), auto_meta_key(storage_id)
    collection = mongo_store.collection("surveys")
    path = f"fields.{field}"
    names = (field, *aliases)
    while True:
        doc = await collection.find_one({"_id": key})
        if doc is None:
            await collection.insert_if_absent(key, {
                "_cache_key": key, "_collection": "surveys", "user_id": user_id, "doc_type": "research_auto",
            })
            continue
        fields = doc.get("fields") or {}
        if field in fields:
            baseline = fields[field]
            expected = baseline
        else:
            raw = await redis.hget(key, field)
            baseline = json.loads(raw) if raw else 0
            expected = {"$exists": False}
        previous = (doc.get("_counter_receipts") or {}).get(field)
        if previous:
            # Preserve the previous increment before replacing its last-source metadata.
            await mongo_store.collection("system_indexes").update_one(
                {
                    "_id": previous["receipt_id"], "doc_type": "research_event_receipt",
                    "event_id": previous["event_id"], "status": "processing", "phase": "dispatching",
                },
                {"$set": {"counter_saved": True}},
                upsert=False,
            )
        count = int(baseline or 0) + 1
        meta = {"computed_at": _now_iso(), "rule_version": RULE_VERSION, "source_event_id": source_event_id}
        updates = {f"fields.{name}": count for name in names}
        updates.update({f"metadata.{name}": meta for name in names})
        updates[f"_counter_receipts.{field}"] = (
            {"receipt_id": receipt_id, "event_id": source_event_id} if receipt_id else None
        )
        result = await collection.update_one({"_id": key, path: expected}, {"$set": updates}, upsert=False)
        if result["matched_count"]:
            break

    serialized_meta = json.dumps(meta, ensure_ascii=False)
    for name in names:
        await redis.hset(key, name, str(count))
        await redis.hset(meta_key, name, serialized_meta)


async def _legacy_auto_cache(redis: Redis, key: str) -> dict[str, Any]:
    raw = await redis.hgetall(key)
    result = {}
    for field, value in raw.items():
        try:
            result[field] = json.loads(value)
        except (json.JSONDecodeError, TypeError):
            result[field] = value
    return result


async def _read_auto_hash(redis: Redis, key: str) -> dict[str, Any]:
    doc = await mongo_store.find_by_cache_key(key) or {}
    return {**(await _legacy_auto_cache(redis, key)), **(doc.get("fields") or {})}


async def get_auto_fields(redis: Redis, user_id: str) -> dict[str, Any]:
    return await _read_auto_hash(redis, auto_hash_key(await _auto_storage_id(redis, user_id)))


async def get_auto_metadata(redis: Redis, user_id: str) -> dict[str, Any]:
    storage_id = await _auto_storage_id(redis, user_id)
    doc = await mongo_store.find_by_cache_key(auto_hash_key(storage_id)) or {}
    old = await _read_auto_hash(redis, auto_meta_key(storage_id))
    return {**old, **(doc.get("metadata") or {})}


# These events have one counter update and no other derivation side effects.
_RECOVERABLE_COUNTER_FIELDS = {
    "nav.change": ("entry_reselect_count", "C3-auto"),
    "agent.message.user": ("agent_repeat_explain",),
    "interview.followup.answer": ("variant_followups_done", "F2d"),
    "revision.probe_answered": ("variant_followups_done", "F2d"),
    "form.field.refill": ("F4c", "redundant_steps"),
    "share.card_opened": ("share_card_opens",),
    "referral.link.create": ("G7", "invites_sent"),
    "referral.link.send": ("G7", "invites_sent"),
    "stt.error": ("H-tech", "tech_error_count"),
}


async def counter_derivation_is_saved(redis: Redis, user_id: str, event: str, event_id: str) -> bool:
    names = _RECOVERABLE_COUNTER_FIELDS.get(event)
    if not names:
        return False
    key = auto_hash_key(await _auto_storage_id(redis, user_id))
    doc = await mongo_store.find_by_cache_key(key) or {}
    fields = doc.get("fields") or {}
    metadata = doc.get("metadata") or {}
    count = fields.get(names[0])
    return type(count) is int and all(
        fields.get(name) == count and (metadata.get(name) or {}).get("source_event_id") == event_id
        for name in names
    )


def _parse_ts(ts: str | None) -> datetime | None:
    if not ts:
        return None
    try:
        parsed = datetime.fromisoformat(ts.replace("Z", "+00:00"))
    except (AttributeError, TypeError, ValueError):
        return None
    return parsed if parsed.utcoffset() is not None else None


PRACTICE_REPORT_FIELDS = ("first_practice_completed_at", "completed_practice_count", "H1", "return_sessions_7d")


async def _practice_metrics(redis: Redis, user_id: str, accepted_at: datetime) -> dict[str, Any]:
    all_completions: list[datetime] = []
    qualifying_completions: list[datetime] = []
    followup_completions: list[datetime] = []
    for session_id in await get_user_session_ids(redis, user_id):
        session = await get_json(redis, f"session:{session_id}") or {}
        completed_at = completed_research_practice_at(session, user_id, accepted_at)
        if completed_at is None:
            continue
        all_completions.append(completed_at)
        metadata = session.get("metadata") or {}
        if _session_counts_toward_activation(metadata):
            qualifying_completions.append(completed_at)
        followup = metadata.get("day14_followup")
        if isinstance(followup, dict):
            due_at = _parse_ts(followup.get("due_at"))
            created_at = _parse_ts(session.get("created_at"))
            if (
                _parse_ts(followup.get("consent_accepted_at")) == accepted_at
                and due_at and created_at and accepted_at <= due_at <= created_at
            ):
                followup_completions.append(completed_at)
    metrics = {}
    if followup_completions:
        metrics["day14_followup_completed_at"] = min(followup_completions).isoformat()
    if not qualifying_completions:
        return metrics

    first_complete = min(qualifying_completions)
    window_end = first_complete + timedelta(days=7)
    return_sessions = sum(first_complete < completed <= window_end for completed in all_completions)
    return {
        **metrics,
        "first_practice_completed_at": first_complete.isoformat(),
        "completed_practice_count": len(qualifying_completions),
        "H1": return_sessions,
        "return_sessions_7d": return_sessions,
        "return_sessions_7d_window_end": window_end.isoformat(),
    }


async def _refresh_practice_metrics(redis: Redis, user_id: str, accepted_at: datetime) -> None:
    metrics = await _practice_metrics(redis, user_id, accepted_at)
    if "first_practice_completed_at" in metrics:
        for field in PRACTICE_REPORT_FIELDS:
            await set_auto_field(redis, user_id, field, metrics[field])


def _match_entry_channel(props: dict[str, Any]) -> tuple[str, str | None, str | None, str | None]:
    utm_source = (props.get("utm_source") or props.get("utmSource") or "").lower()
    ref = (props.get("ref") or props.get("referral_code") or "").lower()
    institution = props.get("institution_id") or props.get("institution")
    task_id = props.get("task_id")

    if institution:
        return "institution", props.get("creator_id"), props.get("content_id"), task_id
    if ref or props.get("invite_code"):
        return "referral", props.get("creator_id"), props.get("content_id"), task_id
    if "creator" in utm_source or props.get("creator_id"):
        return "creator", props.get("creator_id"), props.get("content_id"), task_id
    if any(x in utm_source for x in ("douyin", "bilibili", "xiaohongshu", "video")):
        return "video", props.get("creator_id"), props.get("content_id"), task_id
    if any(x in utm_source for x in ("doubao", "kimi", "chatgpt", "ai")):
        return "ai_answer", props.get("creator_id"), props.get("content_id"), task_id
    if props.get("entry_channel") == "agent" or "agent" in utm_source:
        return "agent", props.get("creator_id"), props.get("content_id"), task_id
    if utm_source in ("baidu", "google", "search"):
        return "search", props.get("creator_id"), props.get("content_id"), task_id
    if utm_source:
        return "direct", props.get("creator_id"), props.get("content_id"), task_id
    return "direct", props.get("creator_id"), props.get("content_id"), task_id


def _position_to_role(position: str | None) -> str:
    if not position:
        return "其他"
    for token, role in POSITION_TO_ROLE.items():
        if token in position:
            return role
    return "其他"


async def _recompute_qualified_activation(redis: Redis, user_id: str, event_id: str | None) -> None:
    auto = await get_auto_fields(redis, user_id)
    answered = auto.get("F2a") == 1 or auto.get("answered_before_feedback") == 1
    revision = auto.get("revision_action") in ("revised", "rejected_with_reason")
    viewed = auto.get("feedback_viewed") == 1
    prev = auto.get("qualified_activation")
    if answered and viewed and revision and prev != 1:
        await set_auto_field(redis, user_id, "qualified_activation", 1, source_event_id=event_id)
        from app.services.referral_reward_service import on_invitee_qualified_activation
        from app.services.task_stats_service import increment_task_stat

        entry_tag_raw = await get_auto_value_raw(redis, user_id, "entry_task_tag")
        if entry_tag_raw:
            try:
                entry_tag = json.loads(entry_tag_raw)
            except (json.JSONDecodeError, TypeError):
                entry_tag = entry_tag_raw
            if isinstance(entry_tag, str) and entry_tag.strip():
                await increment_task_stat(redis, entry_tag.strip(), "qualified_activation")

        await on_invitee_qualified_activation(redis, user_id, event_id=event_id)
    elif "qualified_activation" not in auto:
        await set_auto_field(redis, user_id, "qualified_activation", 0, source_event_id=event_id)


async def derive_on_event(
    redis: Redis,
    user_id: str,
    event: str,
    props: dict[str, Any],
    *,
    event_id: str | None = None,
    receipt_id: str | None = None,
) -> None:
    user_data = await get_json(redis, f"user:{user_id}") or {}
    if event == "task_page.viewed":
        slug = props.get("slug") or props.get("task_id")
        if slug:
            await set_auto_field(redis, user_id, "B2", str(slug), source_event_id=event_id)
            await set_auto_field(redis, user_id, "entry_task_tag", str(slug), source_event_id=event_id)
        channel = props.get("entry_channel") or "search"
        await set_auto_field(redis, user_id, "B1", channel, source_event_id=event_id)

    elif event == "task.started":
        slug = props.get("slug") or props.get("task_id")
        if slug:
            from app.services.task_stats_service import increment_task_stat

            await increment_task_stat(redis, str(slug), "started")

    elif event == "task.steps_to_start":
        if props.get("steps") is not None:
            await set_auto_field(
                redis,
                user_id,
                "task_steps_to_start",
                int(props["steps"]),
                source_event_id=event_id,
            )
        if props.get("elapsed_ms") is not None:
            await set_auto_field(
                redis,
                user_id,
                "task_time_to_start_ms",
                int(props["elapsed_ms"]),
                source_event_id=event_id,
            )

    elif event == "landing.visit":
        channel, creator_id, content_id, task_tag = _match_entry_channel(props)
        await set_auto_field(redis, user_id, "B1", channel, source_event_id=event_id)
        if creator_id:
            await set_auto_field(redis, user_id, "creator_id", creator_id, source_event_id=event_id)
        if content_id:
            await set_auto_field(redis, user_id, "content_id", content_id, source_event_id=event_id)
        if task_tag:
            await set_auto_field(redis, user_id, "B2", task_tag, source_event_id=event_id)
            await set_auto_field(redis, user_id, "entry_task_tag", task_tag, source_event_id=event_id)
        if props.get("institution_id"):
            await set_auto_field(
                redis, user_id, "I5-auto", props["institution_id"], source_event_id=event_id
            )
            await set_auto_field(
                redis, user_id, "institution_id", props["institution_id"], source_event_id=event_id
            )

    elif event == "auth.register":
        await set_auto_field(redis, user_id, "A5-auto", 1, source_event_id=event_id)
        await set_auto_field(redis, user_id, "is_first_use", 1, source_event_id=event_id)

    elif event == "research.arm.assigned":
        factors = props.get("factors") or {}
        continuity = factors.get("continuity")
        participation = factors.get("participation")
        zc = "continuous" if continuity == 1 else "standard"
        zp = "active" if participation == 1 else "demo"
        await set_auto_field(redis, user_id, "zc_assigned", zc, source_event_id=event_id)
        await set_auto_field(redis, user_id, "C1-auto", zc, source_event_id=event_id)
        await set_auto_field(redis, user_id, "zp_assigned", zp, source_event_id=event_id)
        await set_auto_field(redis, user_id, "F1-auto", zp, source_event_id=event_id)

    elif event == "interview.lobby.start":
        role = _position_to_role(props.get("position"))
        await set_auto_field(redis, user_id, "A4", role, source_event_id=event_id)
        await set_auto_field(redis, user_id, "target_role", role, source_event_id=event_id)

    elif event == "interview.session.created":
        entry_tag_raw = await get_auto_value_raw(redis, user_id, "entry_task_tag")
        session_task = props.get("task_id") or props.get("task_tag")
        if entry_tag_raw and session_task:
            try:
                entry_tag = json.loads(entry_tag_raw)
            except (json.JSONDecodeError, TypeError):
                entry_tag = entry_tag_raw
            realized = 1 if entry_tag == session_task else 0
            await set_auto_field(redis, user_id, "zc_realized", realized, source_event_id=event_id)
        if props.get("steps_to_first_answer") is not None:
            await set_auto_field(
                redis,
                user_id,
                "steps_to_first_answer",
                int(props["steps_to_first_answer"]),
                source_event_id=event_id,
            )
        if props.get("time_to_first_answer_sec") is not None:
            await set_auto_field(
                redis,
                user_id,
                "time_to_first_answer_sec",
                int(props["time_to_first_answer_sec"]),
                source_event_id=event_id,
            )

    elif event == "interview.answer.first_submit":
        if props.get("steps_to_first_answer") is not None:
            await set_auto_field(
                redis,
                user_id,
                "C2-auto",
                int(props["steps_to_first_answer"]),
                source_event_id=event_id,
            )
            await set_auto_field(
                redis,
                user_id,
                "steps_to_first_answer",
                int(props["steps_to_first_answer"]),
                source_event_id=event_id,
            )
        if props.get("time_to_first_answer_sec") is not None:
            await set_auto_field(
                redis,
                user_id,
                "time_to_first_answer_sec",
                int(props["time_to_first_answer_sec"]),
                source_event_id=event_id,
            )

    elif event == "nav.change":
        if props.get("reselect") is True:
            await _increment_auto_counter(
                redis, user_id, "entry_reselect_count", event_id, aliases=("C3-auto",), receipt_id=receipt_id,
            )

    elif event == "agent.message.user":
        if props.get("before_first_practice") is True:
            await _increment_auto_counter(redis, user_id, "agent_repeat_explain", event_id, receipt_id=receipt_id)

    elif event == "agent.reply":
        if props.get("is_first") is True:
            template = props.get("template_type") or props.get("template_id") or "generic"
            if "microtask" in str(template).lower():
                reply_type = "microtask"
            elif "promo" in str(template).lower():
                reply_type = "promo"
            else:
                reply_type = "generic"
            await set_auto_field(redis, user_id, "E3-auto", reply_type, source_event_id=event_id)
            await set_auto_field(
                redis, user_id, "agent_first_reply_type", reply_type, source_event_id=event_id
            )
            if props.get("disclosure_shown") is True:
                await set_auto_field(redis, user_id, "E5-auto", 1, source_event_id=event_id)
                await set_auto_field(redis, user_id, "agent_disclosure_shown", 1, source_event_id=event_id)
            if props.get("latency_ms") is not None:
                await set_auto_field(
                    redis,
                    user_id,
                    "E-lat",
                    int(props["latency_ms"]),
                    source_event_id=event_id,
                )

    elif event == "agent.opt_out":
        await set_auto_field(redis, user_id, "E6-auto", 1, source_event_id=event_id)
        await set_auto_field(redis, user_id, "agent_opt_out", 1, source_event_id=event_id)

    elif event == "interview.answer.submit":
        text_len = int(props.get("text_length") or props.get("char_count") or 0)
        voice_sec = float(props.get("voice_duration_sec") or 0)
        if text_len >= 20 or voice_sec >= 15:
            await set_auto_field(redis, user_id, "F2a", 1, source_event_id=event_id)
            await set_auto_field(redis, user_id, "answered_before_feedback", 1, source_event_id=event_id)

    elif event == "feedback.view":
        if props.get("assigned"):
            return
        await set_auto_field(redis, user_id, "feedback_viewed", 1, source_event_id=event_id)
        await _recompute_qualified_activation(redis, user_id, event_id)

    elif event == "revision.feedback_shown":
        if props.get("assigned"):
            return
        await set_auto_field(redis, user_id, "feedback_viewed", 1, source_event_id=event_id)
        await _recompute_qualified_activation(redis, user_id, event_id)

    elif event in ("answer.revise", "feedback.reject", "revision.submitted", "revision.decision"):
        if props.get("assigned"):
            return
        if event in ("answer.revise", "revision.submitted"):
            action = "revised"
        elif event == "feedback.reject":
            action = "rejected_with_reason" if props.get("reason") else "none"
        elif event == "revision.decision":
            decision = props.get("decision")
            if decision == "revise":
                action = "revised"
            elif decision == "decline":
                action = "rejected_with_reason"
            else:
                action = "none"
        else:
            action = "none"
        await set_auto_field(redis, user_id, "revision_action", action, source_event_id=event_id)
        await set_auto_field(redis, user_id, "F2c", action, source_event_id=event_id)
        await _increment_auto_counter(redis, user_id, "revision_count", event_id)
        await _recompute_qualified_activation(redis, user_id, event_id)

    elif event in ("interview.followup.answer", "revision.probe_answered"):
        if props.get("assigned"):
            return
        await _increment_auto_counter(
            redis, user_id, "variant_followups_done", event_id, aliases=("F2d",), receipt_id=receipt_id,
        )

    elif event == "demo.viewed":
        if props.get("passive_time_ratio") is not None:
            await set_auto_field(
                redis,
                user_id,
                "F2e",
                float(props["passive_time_ratio"]),
                source_event_id=event_id,
            )
            await set_auto_field(
                redis,
                user_id,
                "passive_time_ratio",
                float(props["passive_time_ratio"]),
                source_event_id=event_id,
            )

    elif event in ("demo.view.start", "demo.view.stop"):
        if props.get("passive_time_ratio") is not None:
            await set_auto_field(
                redis,
                user_id,
                "F2e",
                float(props["passive_time_ratio"]),
                source_event_id=event_id,
            )
            await set_auto_field(
                redis,
                user_id,
                "passive_time_ratio",
                float(props["passive_time_ratio"]),
                source_event_id=event_id,
            )

    elif event == "form.field.refill":
        await _increment_auto_counter(redis, user_id, "F4c", event_id, aliases=("redundant_steps",), receipt_id=receipt_id)

    elif event == "share.click":
        share_type = props.get("share_type") or props.get("object") or "none"
        await set_auto_field(redis, user_id, "G5-auto", share_type, source_event_id=event_id)
        await set_auto_field(redis, user_id, "share_object_chosen", share_type, source_event_id=event_id)

    elif event == "share.card_created":
        if props.get("include_excerpt"):
            await set_auto_field(redis, user_id, "share_card_with_excerpt", 1, source_event_id=event_id)

    elif event == "share.card_opened":
        await _increment_auto_counter(redis, user_id, "share_card_opens", event_id, receipt_id=receipt_id)

    elif event == "share.probe_started":
        await set_auto_field(redis, user_id, "share_probe_started", 1, source_event_id=event_id)

    elif event == "pair.created":
        await set_auto_field(redis, user_id, "pair_sessions_created", 1, source_event_id=event_id)

    elif event == "pair.answered":
        await set_auto_field(redis, user_id, "pair_answer_submitted", 1, source_event_id=event_id)

    elif event == "referral.qualified_activation":
        await _increment_auto_counter(redis, user_id, "referral_qualified_invitees", event_id)

    elif event in ("referral.link.create", "referral.link.send"):
        await _increment_auto_counter(redis, user_id, "G7", event_id, aliases=("invites_sent",), receipt_id=receipt_id)

    elif event == "referral.bound":
        inviter_id = props.get("inviter_id")
        if inviter_id:
            await _increment_auto_counter(redis, inviter_id, "invitees_registered", event_id)

    elif event == "stt.error":
        await _increment_auto_counter(redis, user_id, "H-tech", event_id, aliases=("tech_error_count",), receipt_id=receipt_id)

    elif event == "interview.complete":
        session_id = props.get("session_id")
        if isinstance(session_id, str) and session_id and user_has_research_consent(user_data):
            accepted_at = _parse_ts(user_data["research_consent"].get("accepted_at"))
            session = await get_json(redis, f"session:{session_id}") or {}
            if accepted_at and completed_research_practice_at(session, user_id, accepted_at) is not None:
                await _refresh_practice_metrics(redis, user_id, accepted_at)
                if props.get("agent_to_practice") is True:
                    await set_auto_field(redis, user_id, "E-act", 1, source_event_id=event_id)

    elif event == "payment.paid":
        await set_auto_field(redis, user_id, "paid", 1, source_event_id=event_id)
        await set_auto_field(redis, user_id, "H2", 1, source_event_id=event_id)

    elif event == "payment.refunded":
        await set_auto_field(redis, user_id, "refunded", 1, source_event_id=event_id)

    elif event == "research.consent.granted":
        created_at = _parse_ts(user_data.get("created_at"))
        if created_at and (datetime.now(timezone.utc) - created_at) <= timedelta(hours=24):
            await set_auto_field(redis, user_id, "A5-auto", 1, source_event_id=event_id)
            await set_auto_field(redis, user_id, "is_first_use", 1, source_event_id=event_id)

    elif event == "research.consent.withdrawn":
        await set_auto_field(redis, user_id, "consent_withdrawn", 1, source_event_id=event_id)


async def derive_daily_aggregates(redis: Redis, user_id: str) -> None:
    """Time-window fields: A6-auto, H1, H4-auto and referral anomaly hints."""
    user_data = await get_json(redis, f"user:{user_id}") or {}
    if not user_has_research_consent(user_data):
        return
    events = await read_event_stream(redis, user_id, count=2000)
    consent = user_data["research_consent"]
    cycle = consent.get("accepted_at")
    accepted_at = _parse_ts(cycle)
    if accepted_at is not None:
        events = [event for event in events if event_times_in_consent_cycle(event, cycle) is not None]
    elif consent.get("had_declined"):
        return
    now = datetime.now(timezone.utc)

    visibility_seconds_by_day: dict[str, float] = {}
    for ev in events:
        if ev.get("event") != "page.visibility":
            continue
        props = ev.get("props") or {}
        if props.get("visible") is not True:
            continue
        ts = _parse_ts(ev.get("ts"))
        if not ts:
            continue
        day = ts.date().isoformat()
        visibility_seconds_by_day[day] = visibility_seconds_by_day.get(day, 0.0) + float(
            props.get("duration_sec") or 60
        )

    if visibility_seconds_by_day:
        first_week_days = sorted(visibility_seconds_by_day.keys())[:7]
        avg_minutes = sum(visibility_seconds_by_day[d] for d in first_week_days) / max(
            len(first_week_days), 1
        ) / 60.0
        await set_auto_field(redis, user_id, "A6-auto", round(avg_minutes, 2))
        await set_auto_field(redis, user_id, "daily_minutes_actual", round(avg_minutes, 2))

    if accepted_at is not None:
        await _refresh_practice_metrics(redis, user_id, accepted_at)

    last_login: datetime | None = None
    for ev in events:
        if ev.get("event") in ("auth.register", "landing.visit", "interview.complete"):
            ts = _parse_ts(ev.get("ts"))
            if ts and (last_login is None or ts > last_login):
                last_login = ts
    if last_login and (now - last_login).days >= 7:
        await set_auto_field(redis, user_id, "H4-auto", 1)
        await set_auto_field(redis, user_id, "churn_flag", 1)
    elif last_login and (now - last_login).days >= 3:
        await set_auto_field(redis, user_id, "inactive_3d", 1)
        from app.research.survey_engine import handle_survey_trigger_event

        await handle_survey_trigger_event(redis, user_id, "inactive.3d", {})

    counts = await get_research_referral_counts(redis, user_id, user_data)
    if counts:
        await set_auto_field(redis, user_id, "invitees_valid_practice", counts["invitees_valid_practice"])


REFERRAL_RESEARCH_FIELDS = ("invitees_registered", "invitees_valid_practice", "referral_qualified_invitees")


async def get_research_referral_edges(
    redis: Redis, user_id: str, user_data: dict[str, Any],
) -> list[dict[str, Any]] | None:
    from app.services.referral_service import get_referral_invitee_ids

    if not user_has_research_consent(user_data):
        return None
    invitee_ids = await get_referral_invitee_ids(redis, user_id)
    if not invitee_ids:
        return None
    consent = user_data["research_consent"]
    cutoff = _parse_ts(consent.get("accepted_at")) if consent.get("had_declined") else None
    if consent.get("had_declined") and cutoff is None:
        return None
    edges = []
    for invitee_id in sorted(invitee_ids):
        invitee = await get_json(redis, f"user:{invitee_id}") or {}
        if invitee.get("referred_by") != user_id or not user_has_research_consent(invitee):
            continue
        binding = await get_json(redis, f"research:invite_event:{user_id}:{invitee_id}") or {}
        bound_at = _parse_ts(binding.get("created_at"))
        if cutoff is not None and (bound_at is None or bound_at < cutoff):
            continue
        metrics = await get_auto_fields(redis, invitee_id)
        edges.append({
            "invitee_id": invitee_id,
            "bound_at": bound_at.isoformat() if bound_at else None,
            "invitee_consent_accepted_at": invitee["research_consent"].get("accepted_at"),
            "qualification_confirmed": metrics.get("qualified_activation") == 1,
        })
    return edges


async def get_research_referral_counts(
    redis: Redis, user_id: str, user_data: dict[str, Any],
) -> dict[str, int]:
    edges = await get_research_referral_edges(redis, user_id, user_data)
    return _summarize_referral_edges(edges)


def _summarize_referral_edges(edges: list[dict[str, Any]] | None) -> dict[str, int]:
    if edges is None:
        return {}
    qualified = sum(edge["qualification_confirmed"] for edge in edges)
    return dict(zip(REFERRAL_RESEARCH_FIELDS, (len(edges), qualified, qualified)))


async def get_report_auto_fields(
    redis: Redis, user_id: str, user_data: dict[str, Any],
) -> tuple[dict[str, Any], dict[str, Any], list[dict[str, Any]]]:
    storage_id = await _auto_storage_id(redis, user_id)
    key = auto_hash_key(storage_id)
    doc = await mongo_store.find_by_cache_key(key) or {}
    auto = {**(await _legacy_auto_cache(redis, key)), **(doc.get("fields") or {})}
    meta = {**(await _read_auto_hash(redis, auto_meta_key(storage_id))), **(doc.get("metadata") or {})}
    auto.pop("voluntary_activation_14d", None)
    meta.pop("voluntary_activation_14d", None)
    if not current_cycle_posttest_dates(user_data)["posttest_completed_at"]:
        for key in ("J1", "posttest_answer", "posttest_status"):
            auto.pop(key, None)
            meta.pop(key, None)
    for key in PRACTICE_REPORT_FIELDS:
        auto[key] = None
        meta.pop(key, None)
    auto["return_sessions_7d_window_end"] = None
    auto["return_sessions_7d_observation"] = "unverified"
    consent = user_data.get("research_consent") or {}
    accepted_at = _parse_ts(consent.get("accepted_at")) if user_has_research_consent(user_data) else None
    practice = await _practice_metrics(redis, user_id, accepted_at) if accepted_at is not None else {}
    auto["day14_followup_completed_at"] = practice.pop("day14_followup_completed_at", None)
    if practice:
        now = datetime.now(timezone.utc)
        window_end = datetime.fromisoformat(practice["return_sessions_7d_window_end"])
        window_elapsed = now >= window_end
        if not window_elapsed:
            practice["H1"] = practice["return_sessions_7d"] = None
        auto.update(practice)
        auto["return_sessions_7d_observation"] = "window_elapsed" if window_elapsed else "window_open"
        for key in PRACTICE_REPORT_FIELDS:
            if practice[key] is not None:
                meta[key] = {"computed_at": now.isoformat(), "rule_version": RULE_VERSION, "source": "session_records"}
    for key in REFERRAL_RESEARCH_FIELDS:
        auto.pop(key, None)
        meta.pop(key, None)
    edges = await get_research_referral_edges(redis, user_id, user_data)
    auto.update(_summarize_referral_edges(edges))
    if auto.get("qualified_activation") == 1:
        auto["qualified_activation_observation"] = "confirmed"
    else:
        auto["qualified_activation"] = None
        auto["qualified_activation_observation"] = "unconfirmed"
        meta.pop("qualified_activation", None)
    return auto, meta, edges or []
