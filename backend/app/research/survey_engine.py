from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone
from functools import lru_cache
from pathlib import Path
from typing import Any

import yaml
from redis.asyncio import Redis

from app.core.redis_client import get_json
from app.research.derive import get_auto_fields
from app.research.events import append_research_event
from app.research.keys import (
    SURVEY_ITEMS_VERSION,
    survey_hash_key,
    survey_queue_key,
    survey_shown_key,
    survey_state_key,
)

SURVEY_YAML = Path(__file__).with_name("survey_items.yaml")
MAX_ITEMS_PER_POPUP = 3
MAX_POPUPS_PER_24H = 2
MAX_CONSECUTIVE_SKIPS = 2

BLOCKED_CONTEXTS = frozenset({"interview_room", "lgd_room"})

TRIGGER_EVENT_MAP = {
    "research.consent.granted": "consent_granted",
    "feedback.view": "feedback_view_first",
    "report.view": "report_view_first",
    "report.dwell": "report_dwell_or_reopen",
    "report.reopen": "report_dwell_or_reopen",
    "interview.complete": "second_session_complete",
    "share.click": "share_click",
    "inactive.3d": "inactive_3d",
    "posttest.open": "posttest_day7",
    "channel.creator_video": "channel_creator_video",
    "channel.creator_video_day2": "channel_creator_video_day2",
    "channel.agent": "channel_agent",
    "institution": "institution",
}


@lru_cache(maxsize=1)
def load_survey_items() -> list[dict[str, Any]]:
    with SURVEY_YAML.open(encoding="utf-8") as handle:
        data = yaml.safe_load(handle)
    return list(data.get("items") or [])


def _items_by_trigger(trigger: str) -> list[dict[str, Any]]:
    return [item for item in load_survey_items() if item.get("trigger") == trigger]


async def _get_state(redis: Redis, user_id: str) -> dict[str, Any]:
    raw = await redis.hgetall(survey_state_key(user_id))
    state: dict[str, Any] = {}
    for key, val in raw.items():
        try:
            state[key] = json.loads(val)
        except (json.JSONDecodeError, TypeError):
            state[key] = val
    return state


async def _set_state_field(redis: Redis, user_id: str, key: str, value: Any) -> None:
    serialized = json.dumps(value, ensure_ascii=False)
    await redis.hset(survey_state_key(user_id), key, serialized)


def _condition_matches(condition: str | None, auto: dict[str, Any], state: dict[str, Any]) -> bool:
    if not condition:
        return True
    entry = auto.get("B1") or auto.get("entry_channel")
    institution = auto.get("institution_id") or auto.get("I5-auto")
    if condition.startswith("entry_channel_in:"):
        allowed = condition.split(":", 1)[1].split(",")
        return str(entry) in allowed
    if condition.startswith("entry_channel_eq:"):
        expected = condition.split(":", 1)[1]
        return str(entry) == expected
    if condition == "institution_id_present":
        return bool(institution)
    if condition == "entry_channel_eq:agent OR agent_used":
        return str(entry) == "agent" or state.get("agent_used") is True
    return True


async def _is_answered_or_declined(redis: Redis, user_id: str, item_id: str) -> bool:
    answer = await redis.hget(survey_hash_key(user_id), item_id)
    if answer:
        parsed = json.loads(answer)
        if parsed.get("status") in ("answered", "declined"):
            return True
    state = await _get_state(redis, user_id)
    declined = state.get("declined_items") or []
    return item_id in declined


async def enqueue_trigger(
    redis: Redis,
    user_id: str,
    trigger: str,
    *,
    due_at: datetime | None = None,
) -> int:
    items = _items_by_trigger(trigger)
    if not items:
        return 0
    auto = await get_auto_fields(redis, user_id)
    state = await _get_state(redis, user_id)
    score_base = due_at.timestamp() if due_at else datetime.now(timezone.utc).timestamp()
    added = 0
    for item in items:
        item_id = item["id"]
        if await _is_answered_or_declined(redis, user_id, item_id):
            continue
        if not _condition_matches(item.get("condition"), auto, state):
            continue
        priority = int(item.get("priority") or 0)
        score = score_base - priority * 0.001
        await redis.zadd(survey_queue_key(user_id), {item_id: score})
        added += 1
    return added


async def handle_survey_trigger_event(
    redis: Redis,
    user_id: str,
    event: str,
    props: dict[str, Any] | None = None,
) -> None:
    props = props or {}
    state = await _get_state(redis, user_id)

    if event == "research.consent.granted":
        await enqueue_trigger(redis, user_id, "consent_granted")
        return

    if event == "feedback.view":
        count = int(state.get("feedback_view_count") or 0) + 1
        await _set_state_field(redis, user_id, "feedback_view_count", count)
        if count == 1:
            await enqueue_trigger(redis, user_id, "feedback_view_first")
        return

    if event == "report.view":
        count = int(state.get("report_view_count") or 0) + 1
        await _set_state_field(redis, user_id, "report_view_count", count)
        dwell = float(props.get("dwell_sec") or 0)
        if count == 1:
            await enqueue_trigger(redis, user_id, "report_view_first")
        if dwell >= 20 or count >= 2:
            await enqueue_trigger(redis, user_id, "report_dwell_or_reopen")
        auto = await get_auto_fields(redis, user_id)
        entry = auto.get("B1") or auto.get("entry_channel")
        if count >= 1 and str(entry) in ("creator", "video"):
            await enqueue_trigger(redis, user_id, "channel_creator_video")
            first_report_at = state.get("first_report_at")
            now = datetime.now(timezone.utc)
            if not first_report_at:
                await _set_state_field(redis, user_id, "first_report_at", now.isoformat())
            else:
                first_dt = datetime.fromisoformat(str(first_report_at).replace("Z", "+00:00"))
                if now - first_dt >= timedelta(days=1):
                    await enqueue_trigger(redis, user_id, "channel_creator_video_day2")
        if str(entry) == "agent" or state.get("agent_used"):
            await enqueue_trigger(redis, user_id, "channel_agent")
        if auto.get("institution_id") or auto.get("I5-auto"):
            await enqueue_trigger(redis, user_id, "institution")
        return

    if event == "interview.complete":
        completed = int(state.get("completed_sessions") or 0) + 1
        await _set_state_field(redis, user_id, "completed_sessions", completed)
        if completed >= 2:
            await enqueue_trigger(redis, user_id, "second_session_complete")
        return

    if event == "share.click":
        await enqueue_trigger(redis, user_id, "share_click")
        return

    if event == "inactive.3d":
        await enqueue_trigger(redis, user_id, "inactive_3d")
        return

    if event in ("posttest.open", "posttest.opened"):
        state = await _get_state(redis, user_id)
        if state.get("posttest_survey_enqueued"):
            return
        await _set_state_field(redis, user_id, "posttest_survey_enqueued", True)
        await enqueue_trigger(redis, user_id, "posttest_day7")
        return

    if event == "agent.message.user":
        await _set_state_field(redis, user_id, "agent_used", True)


async def _popup_count_last_24h(redis: Redis, user_id: str) -> int:
    now = datetime.now(timezone.utc)
    cutoff = (now - timedelta(hours=24)).timestamp()
    await redis.zremrangebyscore(survey_shown_key(user_id), 0, cutoff)
    return int(await redis.zcard(survey_shown_key(user_id)))


async def get_pending_survey_items(
    redis: Redis,
    user_id: str,
    *,
    context: str | None = None,
    posttest_j1_done: bool = False,
) -> dict[str, Any]:
    user_data = await get_json(redis, f"user:{user_id}")
    consent = (user_data or {}).get("research_consent") or {}
    if not consent.get("accepted") or consent.get("withdrawn_at"):
        return {"items": [], "survey_version": SURVEY_ITEMS_VERSION, "blocked_reason": "no_consent"}

    if context in BLOCKED_CONTEXTS:
        return {"items": [], "survey_version": SURVEY_ITEMS_VERSION, "blocked_reason": "in_session"}

    popups = await _popup_count_last_24h(redis, user_id)
    if popups >= MAX_POPUPS_PER_24H:
        return {"items": [], "survey_version": SURVEY_ITEMS_VERSION, "blocked_reason": "rate_limit"}

    queued_ids = await redis.zrevrange(survey_queue_key(user_id), 0, MAX_ITEMS_PER_POPUP * 3 - 1)
    items_out: list[dict[str, Any]] = []
    item_lookup = {item["id"]: item for item in load_survey_items()}

    for item_id in queued_ids:
        if len(items_out) >= MAX_ITEMS_PER_POPUP:
            break
        if await _is_answered_or_declined(redis, user_id, item_id):
            await redis.zrem(survey_queue_key(user_id), item_id)
            continue
        definition = item_lookup.get(item_id)
        if not definition:
            continue
        if definition.get("trigger") == "posttest_day7" and not posttest_j1_done:
            continue
        items_out.append(
            {
                "id": definition["id"],
                "text": definition["text"],
                "type": definition["type"],
                "options": definition.get("options") or [],
                "reverse": bool(definition.get("reverse")),
            }
        )

    if items_out:
        now_ts = datetime.now(timezone.utc).timestamp()
        popup_id = f"{now_ts}:{len(items_out)}"
        await redis.zadd(survey_shown_key(user_id), {popup_id: now_ts})

    return {
        "items": items_out,
        "survey_version": SURVEY_ITEMS_VERSION,
        "blocked_reason": None if items_out else "empty_queue",
    }


async def record_survey_response(
    redis: Redis,
    user_id: str,
    item_id: str,
    *,
    value: str | int | None = None,
    skipped: bool = False,
    status_override: str | None = None,
) -> dict[str, Any]:
    now = datetime.now(timezone.utc).isoformat()
    if skipped:
        status = status_override or "no_response"
        record = {"status": status, "skipped_at": now}
        state = await _get_state(redis, user_id)
        skip_counts = dict(state.get("skip_counts") or {})
        skip_counts[item_id] = int(skip_counts.get(item_id) or 0) + 1
        await _set_state_field(redis, user_id, "skip_counts", skip_counts)
        if skip_counts[item_id] >= MAX_CONSECUTIVE_SKIPS:
            declined = list(state.get("declined_items") or [])
            if item_id not in declined:
                declined.append(item_id)
            await _set_state_field(redis, user_id, "declined_items", declined)
            record["status"] = "declined"
        await append_research_event(
            redis, user_id, "survey.skip", props={"item_id": item_id, "status": record["status"]}
        )
    else:
        status = status_override or "answered"
        record = {"status": status, "value": value, "answered_at": now}
        await append_research_event(
            redis, user_id, "survey.answer", props={"item_id": item_id, "value": value}
        )

    await redis.hset(survey_hash_key(user_id), item_id, json.dumps(record, ensure_ascii=False))
    await redis.zrem(survey_queue_key(user_id), item_id)
    return record


async def clear_survey_on_withdraw(redis: Redis, user_id: str) -> None:
    await redis.delete(survey_queue_key(user_id))
    await redis.delete(survey_shown_key(user_id))
    await redis.delete(survey_state_key(user_id))
