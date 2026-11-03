from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone
from typing import Any

from redis.asyncio import Redis

from app.core.redis_client import get_json
from app.research.keys import RULE_VERSION, auto_hash_key, auto_meta_key
from app.research.events import read_event_stream
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


async def set_auto_field(
    redis: Redis,
    user_id: str,
    field: str,
    value: Any,
    *,
    source_event_id: str | None = None,
) -> None:
    serialized = json.dumps(value, ensure_ascii=False) if not isinstance(value, str) else value
    await redis.hset(auto_hash_key(user_id), field, serialized)
    meta = {
        "computed_at": _now_iso(),
        "rule_version": RULE_VERSION,
        "source_event_id": source_event_id,
    }
    await redis.hset(auto_meta_key(user_id), field, json.dumps(meta, ensure_ascii=False))


async def get_auto_fields(redis: Redis, user_id: str) -> dict[str, Any]:
    raw = await redis.hgetall(auto_hash_key(user_id))
    result: dict[str, Any] = {}
    for key, val in raw.items():
        try:
            result[key] = json.loads(val)
        except (json.JSONDecodeError, TypeError):
            result[key] = val
    return result


def _parse_ts(ts: str | None) -> datetime | None:
    if not ts:
        return None
    return datetime.fromisoformat(ts.replace("Z", "+00:00"))


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
    if answered and viewed and revision:
        await set_auto_field(redis, user_id, "qualified_activation", 1, source_event_id=event_id)
        if prev != 1:
            from app.services.referral_reward_service import on_invitee_qualified_activation
            from app.services.task_stats_service import increment_task_stat

            entry_tag_raw = await redis.hget(auto_hash_key(user_id), "entry_task_tag")
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
        entry_tag_raw = await redis.hget(auto_hash_key(user_id), "entry_task_tag")
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
            current = await redis.hget(auto_hash_key(user_id), "entry_reselect_count")
            count = int(json.loads(current)) + 1 if current else 1
            await set_auto_field(redis, user_id, "entry_reselect_count", count, source_event_id=event_id)
            await set_auto_field(redis, user_id, "C3-auto", count, source_event_id=event_id)

    elif event == "agent.message.user":
        if props.get("before_first_practice") is True:
            current = await redis.hget(auto_hash_key(user_id), "agent_repeat_explain")
            count = int(json.loads(current)) + 1 if current else 1
            await set_auto_field(redis, user_id, "agent_repeat_explain", count, source_event_id=event_id)

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
        current = await redis.hget(auto_hash_key(user_id), "revision_count")
        count = int(json.loads(current)) + 1 if current else 1
        await set_auto_field(redis, user_id, "revision_count", count, source_event_id=event_id)
        await _recompute_qualified_activation(redis, user_id, event_id)

    elif event in ("interview.followup.answer", "revision.probe_answered"):
        if props.get("assigned"):
            return
        current = await redis.hget(auto_hash_key(user_id), "variant_followups_done")
        count = int(json.loads(current)) + 1 if current else 1
        await set_auto_field(redis, user_id, "F2d", count, source_event_id=event_id)
        await set_auto_field(redis, user_id, "variant_followups_done", count, source_event_id=event_id)

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
        current = await redis.hget(auto_hash_key(user_id), "F4c")
        count = int(json.loads(current)) + 1 if current else 1
        await set_auto_field(redis, user_id, "F4c", count, source_event_id=event_id)
        await set_auto_field(redis, user_id, "redundant_steps", count, source_event_id=event_id)

    elif event == "share.click":
        share_type = props.get("share_type") or props.get("object") or "none"
        await set_auto_field(redis, user_id, "G5-auto", share_type, source_event_id=event_id)
        await set_auto_field(redis, user_id, "share_object_chosen", share_type, source_event_id=event_id)

    elif event == "share.card_created":
        if props.get("include_excerpt"):
            await set_auto_field(redis, user_id, "share_card_with_excerpt", 1, source_event_id=event_id)

    elif event == "share.card_opened":
        current = await redis.hget(auto_hash_key(user_id), "share_card_opens")
        count = int(json.loads(current)) + 1 if current else 1
        await set_auto_field(redis, user_id, "share_card_opens", count, source_event_id=event_id)

    elif event == "share.probe_started":
        await set_auto_field(redis, user_id, "share_probe_started", 1, source_event_id=event_id)

    elif event == "pair.created":
        await set_auto_field(redis, user_id, "pair_sessions_created", 1, source_event_id=event_id)

    elif event == "pair.answered":
        await set_auto_field(redis, user_id, "pair_answer_submitted", 1, source_event_id=event_id)

    elif event == "referral.qualified_activation":
        inviter_id = user_id
        current = await redis.hget(auto_hash_key(inviter_id), "referral_qualified_invitees")
        count = int(json.loads(current)) + 1 if current else 1
        await set_auto_field(
            redis, inviter_id, "referral_qualified_invitees", count, source_event_id=event_id
        )

    elif event in ("referral.link.create", "referral.link.send"):
        current = await redis.hget(auto_hash_key(user_id), "G7")
        invites = int(json.loads(current)) + 1 if current else 1
        await set_auto_field(redis, user_id, "G7", invites, source_event_id=event_id)
        await set_auto_field(redis, user_id, "invites_sent", invites, source_event_id=event_id)

    elif event == "referral.bound":
        inviter_id = props.get("inviter_id")
        if inviter_id:
            reg_key = f"invitees_registered:{inviter_id}"
            current = await redis.hget(auto_hash_key(inviter_id), "invitees_registered")
            count = int(json.loads(current)) + 1 if current else 1
            await set_auto_field(redis, inviter_id, "invitees_registered", count, source_event_id=event_id)

    elif event == "stt.error":
        current = await redis.hget(auto_hash_key(user_id), "H-tech")
        count = int(json.loads(current)) + 1 if current else 1
        await set_auto_field(redis, user_id, "H-tech", count, source_event_id=event_id)
        await set_auto_field(redis, user_id, "tech_error_count", count, source_event_id=event_id)

    elif event == "interview.complete":
        session_id = props.get("session_id")
        metadata = props.get("metadata") or {}
        if _session_counts_toward_activation(metadata):
            first_complete = await redis.hget(auto_hash_key(user_id), "first_practice_completed_at")
            now = _now_iso()
            if not first_complete:
                await set_auto_field(redis, user_id, "first_practice_completed_at", now, source_event_id=event_id)
            completed_count_raw = await redis.hget(auto_hash_key(user_id), "completed_practice_count")
            completed_count = int(json.loads(completed_count_raw)) + 1 if completed_count_raw else 1
            await set_auto_field(
                redis, user_id, "completed_practice_count", completed_count, source_event_id=event_id
            )
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
    """Time-window fields: A6-auto, H1, H4-auto, voluntary_activation_14d, referral anomaly hints."""
    user_data = await get_json(redis, f"user:{user_id}") or {}
    events = await read_event_stream(redis, user_id, count=2000)
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

    first_complete_raw = await redis.hget(auto_hash_key(user_id), "first_practice_completed_at")
    if first_complete_raw:
        first_complete = _parse_ts(json.loads(first_complete_raw))
        if first_complete:
            window_end = first_complete + timedelta(days=7)
            return_sessions = 0
            for ev in events:
                if ev.get("event") != "interview.complete":
                    continue
                ts = _parse_ts(ev.get("ts"))
                if ts and first_complete < ts <= window_end:
                    return_sessions += 1
            await set_auto_field(redis, user_id, "H1", return_sessions)
            await set_auto_field(redis, user_id, "return_sessions_7d", return_sessions)

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

    assignment = user_data.get("experiment_assignment") or {}
    assigned_at = _parse_ts(assignment.get("assigned_at"))
    if assigned_at:
        voluntary_window_end = assigned_at + timedelta(days=14)
        qa = await redis.hget(auto_hash_key(user_id), "qualified_activation")
        if qa and int(json.loads(qa)) == 1:
            for ev in events:
                if ev.get("event") != "interview.complete":
                    continue
                ts = _parse_ts(ev.get("ts"))
                props = ev.get("props") or {}
                meta = props.get("metadata") or {}
                if (
                    ts
                    and assigned_at < ts <= voluntary_window_end
                    and meta.get("source") == "day14_voluntary"
                ):
                    await set_auto_field(redis, user_id, "voluntary_activation_14d", 1)
                    break

    invitee_ids = await redis.smembers(f"research:inviter:{user_id}:invitees")
    if invitee_ids:
        valid = 0
        for invitee_id in invitee_ids:
            qa = await redis.hget(auto_hash_key(invitee_id), "qualified_activation")
            if qa and int(json.loads(qa)) == 1:
                valid += 1
        await set_auto_field(redis, user_id, "invitees_valid_practice", valid)
