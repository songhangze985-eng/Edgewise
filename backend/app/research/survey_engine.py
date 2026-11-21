from __future__ import annotations

import hashlib
import json
from datetime import datetime, timedelta, timezone
from functools import lru_cache
from pathlib import Path
from typing import Any

import yaml
from fastapi import HTTPException
from redis.asyncio import Redis

from app.core.index_store import get_user_session_ids
from app.core.mongo_client import mongo_store
from app.core.redis_client import get_json
from app.research.derive import get_auto_fields
from app.research.events import append_research_event, completed_research_practice_at, user_has_research_consent
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
    doc = await mongo_store.find_by_cache_key(f"survey:state:{user_id}") or {}
    fields = doc.get("fields")
    if isinstance(fields, dict):
        state.update(fields)
    elif doc.get("field"):
        state[str(doc["field"])] = doc.get("value")
    return state


async def _set_state_field(redis: Redis, user_id: str, key: str, value: Any) -> None:
    await _set_state_fields(redis, user_id, {key: value})


async def _set_state_fields(redis: Redis, user_id: str, updates: dict[str, Any]) -> None:
    await mongo_store.update_nested_fields(
        f"survey:state:{user_id}",
        nested_attr="fields",
        updates=updates,
        base_fields={"user_id": user_id, "doc_type": "survey_state"},
    )
    for key, value in updates.items():
        await redis.hset(survey_state_key(user_id), key, json.dumps(value, ensure_ascii=False))


async def _advance_trigger_count(
    user_id: str,
    field: str,
    legacy_count: Any,
    *,
    first_trigger: str | None = None,
    minimum_counts: tuple[tuple[str, int], ...] = (),
) -> int:
    state_id = f"survey:state:{user_id}"
    collection = mongo_store.collection("surveys")
    path = f"trigger_counts.{field}"
    while True:
        doc = await collection.find_one({"_id": state_id})
        if doc is None:
            await collection.insert_if_absent(state_id, {
                "_cache_key": state_id, "_collection": "surveys",
                "user_id": user_id, "doc_type": "survey_state",
            })
            continue
        previous = (doc.get("trigger_counts") or {}).get(field)
        baseline = previous
        if baseline is None:
            baseline = (doc.get("fields") or {}).get(field, legacy_count)
        count = int(baseline or 0) + 1
        due_at = datetime.now(timezone.utc).isoformat()
        updates: dict[str, Any] = {path: count}
        if count == 1 and first_trigger:
            updates[f"pending_triggers.{first_trigger}"] = due_at
        pending = doc.get("pending_triggers") or {}
        for trigger, minimum in minimum_counts:
            if count >= minimum and trigger not in pending:
                updates[f"pending_triggers.{trigger}"] = due_at
        result = await collection.update_one(
            {"_id": state_id, path: previous}, {"$set": updates}, upsert=False,
        )
        if result["matched_count"]:
            return count


async def _queue_items(redis: Redis, user_id: str, doc: dict[str, Any] | None) -> dict[str, float]:
    stored = doc or {}
    items = dict(stored.get("items") or {})
    if stored.get("queue_version") is not None:
        return items
    for item_id, due in await redis.zrange(survey_queue_key(user_id), 0, -1, withscores=True):
        items[item_id] = min(due, items.get(item_id, due))
    return items


async def _update_queue(
    redis: Redis, user_id: str, *, additions: dict[str, float] | None = None, removals: tuple[str, ...] = (),
) -> list[str]:
    key = f"survey:queue:{user_id}"
    collection = mongo_store.collection("surveys")
    while True:
        doc = await collection.find_one({"_id": key})
        items = await _queue_items(redis, user_id, doc)
        updated = dict(items)
        for item_id in removals:
            updated.pop(item_id, None)
        changed = []
        for item_id, due in (additions or {}).items():
            if item_id not in updated or due < updated[item_id]:
                updated[item_id] = due
                changed.append(item_id)
        if updated == items and ((doc is None and not items) or (doc or {}).get("queue_version") is not None):
            return changed
        if doc is None:
            await collection.insert_if_absent(key, {
                "_cache_key": key, "_collection": "surveys", "user_id": user_id, "doc_type": "survey_queue",
            })
            continue
        version = doc.get("queue_version")
        result = await collection.update_one(
            {"_id": key, "queue_version": version},
            {"$set": {"items": updated, "queue_version": (version or 0) + 1}},
            upsert=False,
        )
        if result["matched_count"]:
            return changed


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


def _answer_matches_cycle(answer: Any, consent: dict[str, Any]) -> bool:
    if not isinstance(answer, dict):
        return False
    cycle = answer.get("consent_accepted_at")
    if cycle is None:
        return not consent.get("had_declined")
    return cycle == consent.get("accepted_at")


async def get_current_survey_answers(redis: Redis, user_id: str, consent: dict[str, Any]) -> dict[str, Any]:
    answers = await get_survey_answers(redis, user_id)
    return {key: answer for key, answer in answers.items() if _answer_matches_cycle(answer, consent)}


async def _is_answered_or_declined(redis: Redis, user_id: str, item_id: str) -> bool:
    user = await get_json(redis, f"user:{user_id}") or {}
    consent = user.get("research_consent") or {}
    answers = await get_survey_answers(redis, user_id)
    answer = answers.get(item_id)
    if answer is None:
        answer = await mongo_store.find_by_cache_key(f"survey:answer:{user_id}:{item_id}")
        if isinstance(answer, dict):
            await redis.hset(survey_hash_key(user_id), item_id, json.dumps(answer, ensure_ascii=False))
    if _answer_matches_cycle(answer, consent) and answer.get("status") in ("answered", "declined"):
        return True
    state = await _get_state(redis, user_id)
    declined = state.get("declined_items") or []
    return item_id in declined


async def get_survey_answers(redis: Redis, user_id: str) -> dict[str, Any]:
    key = f"survey:answers:{user_id}"
    doc = await mongo_store.find_by_cache_key(key)
    if doc is None:
        legacy = await mongo_store.list_collection_docs("surveys", {"user_id": user_id}, limit=10000)
        answers = {
            item["item_id"]: {k: v for k, v in item.items() if k not in ("user_id", "item_id")}
            for item in legacy if item.get("item_id") and item.get("status")
        }
        if answers:
            await mongo_store.collection("surveys").insert_if_absent(key, {
                "_cache_key": key, "_collection": "surveys", "user_id": user_id,
                "doc_type": "survey_answers", "answers": answers,
            })
            doc = await mongo_store.find_by_cache_key(key)

    raw = await redis.hgetall(survey_hash_key(user_id))
    result = {}
    for item_id, value in raw.items():
        try:
            result[item_id] = json.loads(value)
        except (json.JSONDecodeError, TypeError):
            continue
    result.update((doc or {}).get("answers") or {})
    return result


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
    scores: dict[str, float] = {}
    for item in items:
        item_id = item["id"]
        if await _is_answered_or_declined(redis, user_id, item_id):
            continue
        if not _condition_matches(item.get("condition"), auto, state):
            continue
        priority = int(item.get("priority") or 0)
        scores[item_id] = score_base - priority * 0.001
    if not scores:
        return 0

    changed_ids = await _update_queue(redis, user_id, additions=scores)
    await _set_state_field(redis, user_id, f"survey_enqueued:{trigger}", True)
    if changed_ids:
        await append_research_event(redis, user_id, "survey.enqueued", props={
            "trigger": trigger, "item_ids": changed_ids, "survey_version": SURVEY_ITEMS_VERSION,
        })
    return len(changed_ids)


async def _schedule_second_session_trigger(redis: Redis, user_id: str, session_id: Any) -> None:
    if not isinstance(session_id, str) or not session_id:
        return
    user = await get_json(redis, f"user:{user_id}")
    if not user_has_research_consent(user):
        return
    try:
        accepted_at = datetime.fromisoformat(user["research_consent"]["accepted_at"])
    except (KeyError, TypeError, ValueError):
        return
    session = await get_json(redis, f"session:{session_id}") or {}
    if completed_research_practice_at(session, user_id, accepted_at) is None:
        return

    state_id = f"survey:state:{user_id}"
    collection = mongo_store.collection("surveys")
    state = await collection.find_one({"_id": state_id})
    if (state or {}).get("second_session_ids"):
        return
    for other_id in await get_user_session_ids(redis, user_id):
        if other_id == session_id:
            continue
        other = await get_json(redis, f"session:{other_id}") or {}
        if completed_research_practice_at(other, user_id, accepted_at) is None:
            continue
        if state is None:
            await collection.insert_if_absent(state_id, {
                "_cache_key": state_id, "_collection": "surveys",
                "user_id": user_id, "doc_type": "survey_state",
            })
        await collection.update_one(
            {"_id": state_id, "second_session_ids": None},
            {"$set": {
                "second_session_ids": [session_id, other_id],
                "pending_triggers.second_session_complete": datetime.now(timezone.utc).isoformat(),
            }},
            upsert=False,
        )
        return


async def _enqueue_pending_triggers(redis: Redis, user_id: str) -> None:
    state_id = f"survey:state:{user_id}"
    collection = mongo_store.collection("surveys")
    doc = await collection.find_one({"_id": state_id})
    for trigger, due in ((doc or {}).get("pending_triggers") or {}).items():
        if due is None:
            continue
        if trigger == "second_session_complete" and not doc.get("second_session_ids"):
            continue
        await enqueue_trigger(redis, user_id, trigger, due_at=datetime.fromisoformat(due))
        path = f"pending_triggers.{trigger}"
        await collection.update_one(
            {"_id": state_id, path: due}, {"$set": {path: None}}, upsert=False,
        )


async def handle_survey_trigger_event(
    redis: Redis,
    user_id: str,
    event: str,
    props: dict[str, Any] | None = None,
) -> None:
    props = props or {}

    if event == "survey.shown":
        if not props.get("offer_event_id"):
            return
        known_ids = {item["id"] for item in load_survey_items()}
        item_ids = props.get("item_ids")
        if isinstance(item_ids, list):
            updates = {
                f"survey_shown_verified:{item_id}": True
                for item_id in item_ids[:MAX_ITEMS_PER_POPUP]
                if isinstance(item_id, str) and item_id in known_ids
            }
            if updates:
                await _set_state_fields(redis, user_id, updates)
        return

    state = await _get_state(redis, user_id)

    if event == "research.consent.granted":
        await enqueue_trigger(redis, user_id, "consent_granted")
        return

    if event == "feedback.view":
        await _advance_trigger_count(
            user_id, "feedback_view_count", state.get("feedback_view_count"), first_trigger="feedback_view_first",
        )
        await _enqueue_pending_triggers(redis, user_id)
        return

    if event == "report.view":
        try:
            dwell = float(props.get("dwell_sec") or 0)
        except (TypeError, ValueError):
            dwell = 0
        count = await _advance_trigger_count(
            user_id, "report_view_count", state.get("report_view_count"),
            first_trigger="report_view_first",
            minimum_counts=(("report_dwell_or_reopen", 1 if dwell >= 20 else 2),),
        )
        await _enqueue_pending_triggers(redis, user_id)
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
        await _schedule_second_session_trigger(redis, user_id, props.get("session_id"))
        await _enqueue_pending_triggers(redis, user_id)
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
        await enqueue_trigger(redis, user_id, "posttest_day7")
        await _set_state_field(redis, user_id, "posttest_survey_enqueued", True)
        return

    if event == "agent.message.user":
        await _set_state_field(redis, user_id, "agent_used", True)


async def _active_offer_times(redis: Redis, user_id: str, stored: dict[str, Any] | None, now: datetime) -> list[float]:
    stored = stored or {}
    times = stored.get("offer_times")
    if times is None:
        cached = await redis.zrange(survey_shown_key(user_id), 0, -1, withscores=True)
        times = {**(stored.get("items") or {}), **dict(cached)}.values()
    cutoff = (now - timedelta(hours=24)).timestamp()
    return [float(timestamp) for timestamp in times if float(timestamp) > cutoff]


async def _reserve_survey_offer(redis: Redis, user_id: str) -> bool:
    key = f"survey:shown:{user_id}"
    collection = mongo_store.collection("surveys")
    while True:
        stored = await collection.find_one({"_id": key})
        if stored is None:
            await collection.insert_if_absent(key, {
                "_cache_key": key, "_collection": "surveys", "user_id": user_id, "doc_type": "survey_shown",
            })
            continue
        now = datetime.now(timezone.utc)
        times = await _active_offer_times(redis, user_id, stored, now)
        if len(times) >= MAX_POPUPS_PER_24H:
            return False
        version = stored.get("offer_version")
        result = await collection.update_one(
            {"_id": key, "offer_version": version},
            {"$set": {"offer_times": [*times, now.timestamp()], "offer_version": (version or 0) + 1}},
            upsert=False,
        )
        if result["matched_count"]:
            return True


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

    await _enqueue_pending_triggers(redis, user_id)
    stored = await mongo_store.find_by_cache_key(f"survey:shown:{user_id}")
    recent = await _active_offer_times(redis, user_id, stored, datetime.now(timezone.utc))
    if len(recent) >= MAX_POPUPS_PER_24H:
        return {"items": [], "survey_version": SURVEY_ITEMS_VERSION, "blocked_reason": "rate_limit"}

    queue = await mongo_store.find_by_cache_key(f"survey:queue:{user_id}")
    items = await _queue_items(redis, user_id, queue)
    now = datetime.now(timezone.utc).timestamp()
    queued_ids = [item_id for item_id, due in sorted(items.items(), key=lambda pair: (pair[1], pair[0])) if due <= now]
    items_out: list[dict[str, Any]] = []
    item_lookup = {item["id"]: item for item in load_survey_items()}
    removed = []

    for item_id in queued_ids[:MAX_ITEMS_PER_POPUP * 3]:
        if len(items_out) >= MAX_ITEMS_PER_POPUP:
            break
        if await _is_answered_or_declined(redis, user_id, item_id):
            removed.append(item_id)
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

    if removed:
        await _update_queue(redis, user_id, removals=tuple(removed))

    offer_event_id = None
    if items_out:
        if not await _reserve_survey_offer(redis, user_id):
            return {"items": [], "survey_version": SURVEY_ITEMS_VERSION, "blocked_reason": "rate_limit"}
        offer_event_id = await append_research_event(redis, user_id, "survey.offered", props={
            "item_ids": [item["id"] for item in items_out], "survey_version": SURVEY_ITEMS_VERSION,
            "_consent_accepted_at": consent.get("accepted_at"),
        })

    return {
        "items": items_out,
        "survey_version": SURVEY_ITEMS_VERSION,
        "blocked_reason": None if items_out else "empty_queue",
        "offer_event_id": offer_event_id,
        "answer_context": (
            {"user_id": user_id, "consent_accepted_at": consent["accepted_at"]}
            if items_out and consent.get("accepted_at") else None
        ),
    }


async def record_survey_response(
    redis: Redis,
    user_id: str,
    item_id: str,
    *,
    value: str | int | None = None,
    skipped: bool = False,
    status_override: str | None = None,
    expected_consent_at: str | None = None,
    submission_receipt_id: str | None = None,
    offer_event_id: str | None = None,
) -> dict[str, Any]:
    user = await get_json(redis, f"user:{user_id}") or {}
    consent = user.get("research_consent") or {}
    if expected_consent_at is not None and (
        not user_has_research_consent(user) or consent.get("accepted_at") != expected_consent_at
    ):
        raise HTTPException(status_code=409, detail="问卷同意周期已变更，请重新打开问卷")
    answers = await get_survey_answers(redis, user_id)
    previous = answers.get(item_id)
    if previous is None:
        previous = await mongo_store.find_by_cache_key(f"survey:answer:{user_id}:{item_id}")
    if previous is not None and not _answer_matches_cycle(previous, consent):
        snapshot = {"user_id": user_id, "survey_item": item_id, "answer": previous,
                    "doc_type": "survey_answer_archive"}
        digest = hashlib.sha256(json.dumps(snapshot, sort_keys=True).encode()).hexdigest()
        await mongo_store.collection("surveys").insert_if_absent(f"survey:archive:{digest}", snapshot)
    now = datetime.now(timezone.utc).isoformat()
    if skipped:
        status = status_override or "no_response"
        record = {"status": status, "skipped_at": now, "survey_version": SURVEY_ITEMS_VERSION}
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
            redis, user_id, "survey.skip", props={"item_id": item_id, "status": record["status"], "survey_version": SURVEY_ITEMS_VERSION}
        )
    else:
        status = status_override or "answered"
        record = {"status": status, "value": value, "answered_at": now, "survey_version": SURVEY_ITEMS_VERSION}
        await append_research_event(
            redis, user_id, "survey.answer", props={"item_id": item_id, "value": value, "survey_version": SURVEY_ITEMS_VERSION}
        )

    record["consent_accepted_at"] = consent.get("accepted_at")
    if offer_event_id is not None:
        record["offer_event_id"] = offer_event_id
    await _update_queue(redis, user_id, removals=(item_id,))
    await mongo_store.upsert_by_cache_key(
        f"survey:answer:{user_id}:{item_id}",
        {"user_id": user_id, "item_id": item_id, **record},
    )
    await mongo_store.update_nested_fields(
        f"survey:answers:{user_id}",
        nested_attr="answers",
        updates={item_id: record},
        base_fields={
            "user_id": user_id, "doc_type": "survey_answers",
            f"_submission_receipts.{item_id}": (
                {"id": submission_receipt_id, "recorded_at": now} if submission_receipt_id else None
            ),
        },
    )
    await redis.hset(survey_hash_key(user_id), item_id, json.dumps(record, ensure_ascii=False))
    return record


async def clear_survey_on_withdraw(redis: Redis, user_id: str) -> None:
    await redis.delete(survey_queue_key(user_id))
    await redis.delete(survey_shown_key(user_id))
    await redis.delete(survey_state_key(user_id))
    await mongo_store.delete_by_cache_key(f"survey:queue:{user_id}")
    await mongo_store.delete_by_cache_key(f"survey:shown:{user_id}")
    await mongo_store.delete_by_cache_key(f"survey:state:{user_id}")
