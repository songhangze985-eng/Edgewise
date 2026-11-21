from __future__ import annotations

import hashlib
import json
import logging
from collections.abc import Awaitable, Callable
from datetime import datetime, timedelta, timezone
from typing import Any

from redis.asyncio import Redis
from pydantic import ValidationError

from app.core.mongo_client import mongo_store
from app.core.redis_client import get_json
from app.models.schemas import ResearchClientEvent
from app.research.keys import event_stream_key

logger = logging.getLogger(__name__)

CLIENT_STREAM_APPEND_WINDOW = timedelta(days=1)
_APPEND_CLIENT_STREAM_EVENT = """
local existing = redis.call('GET', KEYS[2])
if existing then
    return existing
end
local now = redis.call('TIME')
local now_ms = now[1] * 1000 + math.floor(now[2] / 1000)
if now_ms >= tonumber(ARGV[5]) then
    return nil
end
local entry_id = redis.call('XADD', KEYS[1], '*', 'event', ARGV[1], 'ts', ARGV[2], 'props', ARGV[3])
local receipt = cjson.encode({entry_id, ARGV[2], ARGV[4]})
redis.call('SET', KEYS[2], receipt, 'PXAT', ARGV[5])
return receipt
"""


class _StreamAppendWindowElapsed(Exception):
    pass


ALLOWED_CLIENT_EVENTS = frozenset(
    {
        "landing.visit",
        "auth.register",
        "nav.change",
        "interview.lobby.start",
        "interview.session.created",
        "interview.answer.submit",
        "interview.followup.answer",
        "feedback.view",
        "answer.revise",
        "feedback.reject",
        "demo.view.start",
        "demo.view.stop",
        "report.view",
        "form.field.refill",
        "share.click",
        "referral.link.create",
        "referral.link.send",
        "agent.message.user",
        "agent.reply",
        "agent.opt_out",
        "stt.error",
        "page.visibility",
        "survey.answer",
        "survey.skip",
        "survey.shown",
        "interview.complete",
        "report.insufficient",
        "question.invalid",
        "question.pool_relaxed",
        "revision.feedback_shown",
        "revision.decision",
        "revision.submitted",
        "revision.probe_answered",
        "demo.viewed",
        "followup.shown",
        "followup.answered",
        "followup.skipped",
        "negotiation.turn",
        "reverse_qa.count",
        "round.hr.completed",
        "share.card_created",
        "share.card_opened",
        "share.card_revoked",
        "share.probe_started",
        "pair.created",
        "pair.answered",
        "pair.visibility",
        "task_page.viewed",
        "task_page.cta_clicked",
        "task.started",
        "task.steps_to_start",
        "copilot.triage_response",
        "copilot.triage_rejected",
        "copilot.micro_task_done",
        "copilot.handoff_human",
        "structured.started",
        "structured.category_score",
        "coding.run",
        "coding.submit",
        "coding.explain_words",
        "assessment.completed",
        "experience.practice_clicked",
        "series.episode_viewed",
        "series.task_started",
        "case.step_completed",
        "story.created",
        "story.theme_coverage",
    }
)

SERVER_EVENTS = frozenset(
    {
        "research.consent.granted",
        "research.consent.withdrawn",
        "research.arm.assigned",
        "posttest.open",
        "copilot.triage",
        "survey.enqueued",
        "survey.offered",
        "interview.session.created",
        "interview.complete",
        "interview.answer.first_submit",
        "payment.paid",
        "payment.refunded",
        "referral.bound",
        "report.insufficient",
        "question.invalid",
        "question.pool_relaxed",
        "round.hr.completed",
        "negotiation.turn",
        "negotiation.turns",
        "reverse_qa.count",
        "share.card_created",
        "share.card_revoked",
        "referral.qualified_activation",
        "structured.category_score",
        "coding.run",
        "coding.submit",
        "coding.explain_words",
        "assessment.completed",
        "experience.submitted",
        "org.joined",
        "org.mentor_share",
        "workshop.completed",
        "case.step_completed",
        "story.created",
        "story.theme_coverage",
    }
)


def user_has_research_consent(user_data: dict[str, Any] | None) -> bool:
    if not user_data:
        return False
    consent = user_data.get("research_consent") or {}
    return consent.get("accepted") is True and not consent.get("withdrawn_at")


def current_cycle_posttest_dates(user_data: dict[str, Any]) -> dict[str, str | None]:
    dates: dict[str, str | None] = {"posttest_due_at": None, "posttest_completed_at": None}
    if not user_has_research_consent(user_data):
        return dates
    try:
        cutoff = datetime.fromisoformat(user_data["research_consent"]["accepted_at"])
    except (KeyError, TypeError, ValueError):
        return dates
    now = datetime.now(timezone.utc)
    if cutoff.utcoffset() is None or cutoff > now:
        return dates
    for field in dates:
        raw = user_data.get(field)
        try:
            timestamp = datetime.fromisoformat(raw)
            if timestamp >= cutoff and (field == "posttest_due_at" or timestamp <= now):
                dates[field] = raw
        except (TypeError, ValueError):
            continue
    return dates


def completed_research_practice_at(
    session: dict[str, Any], user_id: str, accepted_at: datetime,
) -> datetime | None:
    if (
        session.get("user_id") != user_id
        or session.get("status") != "completed"
        or session.get("type") == "research_posttest"
        or (session.get("metadata") or {}).get("research_eligible") is not True
    ):
        return None
    try:
        created_at = datetime.fromisoformat(session["created_at"])
        completed_at = datetime.fromisoformat(session["completed_at"])
        return completed_at if accepted_at <= created_at <= completed_at else None
    except (KeyError, TypeError, ValueError):
        return None


async def _session_matches_consent_cycle(
    redis: Redis, user_id: str, props: dict[str, Any], consent: dict[str, Any],
) -> bool:
    session_id = props.get("session_id")
    if not consent.get("had_declined") or session_id is None:
        return True
    if not isinstance(session_id, str) or not session_id:
        return False
    session = await get_json(redis, f"session:{session_id}")
    if not session or session.get("user_id") != user_id:
        return False
    if (session.get("metadata") or {}).get("research_eligible") is not True:
        return False
    try:
        start = datetime.fromisoformat(consent["accepted_at"])
        created = datetime.fromisoformat(session["created_at"])
        return start.utcoffset() is not None and created.utcoffset() is not None and created >= start
    except (KeyError, TypeError, ValueError):
        return False


async def _persist_event(
    user_id: str, event: str, props: dict[str, Any], entry_id: str, timestamp: str,
    consent_cycle: str | None, source: str | None = None,
) -> None:
    await mongo_store.insert_document("research_events", {
        "_id": f"{user_id}:{entry_id}",
        "user_id": user_id,
        "stream_entry_id": entry_id,
        **({"event_source": source} if source else {}),
        **({"consent_cycle": consent_cycle} if consent_cycle else {}),
        "event": event,
        "ts": timestamp,
        "props": props,
    })


async def append_research_event(
    redis: Redis,
    user_id: str,
    event: str,
    *,
    props: dict[str, Any] | None = None,
    ts: str | None = None,
    skip_consent_check: bool = False,
    source: str | None = None,
    on_stream_append: Callable[[str, str, str | None], Awaitable[None]] | None = None,
    stream_receipt: tuple[str, int] | None = None,
) -> str | None:
    """Append to research:event stream. Returns Redis stream entry id or None if skipped."""
    if event not in ALLOWED_CLIENT_EVENTS and event not in SERVER_EVENTS:
        return None

    consent_cycle = None
    if not skip_consent_check:
        user_data = await get_json(redis, f"user:{user_id}")
        if not user_has_research_consent(user_data):
            if event not in (
                "research.consent.granted",
                "research.consent.withdrawn",
                "research.arm.assigned",
                "org.joined",
                "org.mentor_share",
                "workshop.completed",
            ):
                return None
        else:
            consent = user_data["research_consent"]
            consent_cycle = consent.get("accepted_at")
            reported_cycle = (props or {}).get("_consent_accepted_at")
            if reported_cycle is not None and reported_cycle != consent_cycle:
                return None
            if not await _session_matches_consent_cycle(redis, user_id, props or {}, consent):
                return None

    if event in ("referral.bound", "referral.qualified_activation"):
        invitee_id = (props or {}).get("invitee_id")
        if not isinstance(invitee_id, str) or not invitee_id:
            return None
        invitee = await get_json(redis, f"user:{invitee_id}") or {}
        if invitee.get("referred_by") != user_id or not user_has_research_consent(invitee):
            return None

    timestamp = ts or datetime.now(timezone.utc).isoformat()
    payload = {
        "event": event,
        "ts": timestamp,
        "props": json.dumps(props or {}, ensure_ascii=False),
    }
    stream_key = event_stream_key(user_id)
    if stream_receipt is None:
        entry_id = await redis.xadd(stream_key, payload)
    else:
        receipt_key, deadline = stream_receipt
        result = await redis.eval(
            _APPEND_CLIENT_STREAM_EVENT, 2, stream_key, receipt_key,
            event, timestamp, payload["props"], consent_cycle or "", deadline,
        )
        if result is None:
            raise _StreamAppendWindowElapsed
        entry_id, timestamp, redis_cycle = json.loads(result)
        consent_cycle = redis_cycle or None
    if on_stream_append is not None:
        await on_stream_append(entry_id, timestamp, consent_cycle)
    await _persist_event(user_id, event, props or {}, entry_id, timestamp, consent_cycle, source)
    return entry_id


async def read_event_stream(
    redis: Redis,
    user_id: str,
    *,
    count: int = 500,
) -> list[dict[str, Any]]:
    raw = await redis.xrevrange(event_stream_key(user_id), count=count)
    events: dict[str, dict[str, Any]] = {}
    stored = await mongo_store.collection("research_events").find_recent_events(user_id, count)
    for entry in stored:
        entry_id = entry.get("stream_entry_id")
        if entry_id:
            events[entry_id] = {
                "id": entry_id,
                "event": entry.get("event"),
                "ts": entry.get("ts"),
                "props": entry.get("props") or {},
                "consent_cycle": entry.get("consent_cycle"),
            }
    for entry_id, fields in raw:
        if entry_id in events:
            continue
        props_raw = fields.get("props") or "{}"
        try:
            props = json.loads(props_raw)
        except json.JSONDecodeError:
            props = {}
        events[entry_id] = {
                "id": entry_id,
                "event": fields.get("event"),
                "ts": fields.get("ts"),
                "props": props,
            }

    def order(entry_id: str) -> tuple[int, int]:
        try:
            ms, sequence = entry_id.split("-", 1)
            return int(ms), int(sequence)
        except (TypeError, ValueError):
            return (0, 0)

    ids = sorted(events, key=order)[-count:]
    return [events[entry_id] for entry_id in ids]


def event_times_in_consent_cycle(entry: dict[str, Any], cycle: str) -> tuple[datetime, datetime] | None:
    props = entry.get("props")
    if not isinstance(props, dict):
        return None
    tagged = entry.get("consent_cycle") or props.get("_consent_accepted_at") or props.get("consent_accepted_at")
    if tagged is not None and tagged != cycle:
        return None
    try:
        occurred = datetime.fromisoformat(entry["ts"])
        cutoff = datetime.fromisoformat(cycle)
        entry_id = entry.get("stream_entry_id") or entry.get("id")
        received = datetime.fromtimestamp(int(entry_id.split("-", 1)[0]) / 1000, tz=timezone.utc)
        if occurred >= cutoff and received >= cutoff:
            return occurred, received
    except (AttributeError, KeyError, OSError, OverflowError, TypeError, ValueError):
        pass
    return None


async def ingest_client_events(
    redis: Redis,
    user_id: str,
    events: list[Any],
    *,
    outcomes: list[dict[str, Any]] | None = None,
) -> list[str]:
    from app.research.pipeline import on_research_event

    ids: list[str] = []
    for item in events:
        try:
            item = ResearchClientEvent.model_validate(item).model_dump()
        except ValidationError:
            if outcomes is not None:
                outcomes.append({"status": "rejected", "reason": "invalid_event"})
            continue
        event_name = item.get("event")
        if not event_name or event_name not in ALLOWED_CLIENT_EVENTS:
            if outcomes is not None:
                outcomes.append({"status": "rejected", "reason": "event_not_allowed"})
            continue
        props = item.get("props") if isinstance(item.get("props"), dict) else {}
        user_data = await get_json(redis, f"user:{user_id}")
        consent = (user_data or {}).get("research_consent") or {}
        if user_has_research_consent(user_data):
            cycle = props.get("_consent_accepted_at")
            if (cycle is not None and cycle != consent.get("accepted_at")) or (cycle is None and consent.get("had_declined")):
                if outcomes is not None:
                    outcomes.append({"status": "rejected", "reason": "consent_cycle_mismatch"})
                continue
            if not await _session_matches_consent_cycle(redis, user_id, props, consent):
                if outcomes is not None:
                    outcomes.append({"status": "rejected", "reason": "session_outside_consent_cycle"})
                continue
        else:
            if outcomes is not None:
                outcomes.append({"status": "rejected", "reason": "consent_required"})
            continue

        if event_name == "survey.shown" and "offer_event_id" in props:
            if not await _matches_survey_offer(user_id, consent.get("accepted_at"), props):
                if outcomes is not None:
                    outcomes.append({"status": "rejected", "reason": "survey_offer_mismatch"})
                continue

        outcome = await _process_client_event(redis, user_id, item, on_research_event)
        if outcome.get("event_id"):
            ids.append(outcome["event_id"])
        if outcomes is not None:
            outcomes.append(outcome)
    return ids


async def _matches_survey_offer(user_id: str, cycle: str | None, props: dict[str, Any]) -> bool:
    offered = await get_survey_offer(user_id, cycle, props["offer_event_id"])
    return bool(
        offered and offered.get("item_ids") == props.get("item_ids")
        and offered.get("survey_version") == props.get("survey_version")
    )


async def get_survey_offer(user_id: str, cycle: str | None, offer_id: Any) -> dict[str, Any] | None:
    if not isinstance(offer_id, str) or len(offer_id) > 50:
        return None
    ms, separator, sequence = offer_id.partition("-")
    if not separator or not ms.isdecimal() or not sequence.isdecimal():
        return None
    offer = await mongo_store.collection("research_events").find_one({
        "_id": f"{user_id}:{offer_id}", "user_id": user_id, "event": "survey.offered",
    })
    if not offer or offer.get("consent_cycle") != cycle:
        return None
    props = offer.get("props")
    return props if isinstance(props, dict) else None


async def get_stalled_event_receipt_counts() -> dict[str, int]:
    receipts = mongo_store.collection("system_indexes")
    cutoff = (datetime.now(timezone.utc) - timedelta(minutes=5)).isoformat()
    stalled = {"doc_type": "research_event_receipt", "status": "processing", "started_at": {"$lte": cutoff}}
    return {
        "stalled_total": await receipts.count_documents(stalled),
        "awaiting_stream": await receipts.count_documents({**stalled, "phase": "awaiting_stream"}),
        "awaiting_event_storage": await receipts.count_documents({**stalled, "phase": "stream_appended"}),
        "awaiting_dispatch": await receipts.count_documents({**stalled, "phase": "event_stored"}),
        "dispatch_unconfirmed": await receipts.count_documents({**stalled, "phase": "dispatching"}),
        "awaiting_survey": await receipts.count_documents({**stalled, "phase": "derived"}),
        "survey_unconfirmed": await receipts.count_documents({**stalled, "phase": "triggering_survey"}),
        "event_storage_unconfirmed": await receipts.count_documents({**stalled, "phase": "storing_event"}),
        "legacy_unknown": await receipts.count_documents({**stalled, "phase": None}),
    }


async def _process_client_event(redis: Redis, user_id: str, item: dict[str, Any], dispatch) -> dict[str, Any]:
    event_name, ts, props = item["event"], item["ts"], item["props"]
    client_id = props.get("_client_event_id")
    if client_id is not None and (not isinstance(client_id, str) or not 1 <= len(client_id) <= 80):
        return {"status": "rejected", "reason": "invalid_client_event_id"}

    unconfirmed = {"status": "retry", "reason": "processing_unconfirmed"}
    receipt_id = None
    entry_id = None
    saved_append = None
    resume_survey = False
    replay_display = False
    verify_derivation = False
    counter_saved = False
    stream_receipt = None
    receipts = mongo_store.collection("system_indexes")
    if client_id is not None:
        identity = json.dumps([user_id, client_id])
        receipt_id = "research:receipt:" + hashlib.sha256(identity.encode()).hexdigest()
        fingerprint = hashlib.sha256(json.dumps(item, sort_keys=True).encode()).hexdigest()
        started_at = datetime.now(timezone.utc)
        if not await receipts.insert_if_absent(receipt_id, {
            "doc_type": "research_event_receipt",
            "fingerprint": fingerprint,
            "status": "processing",
            "phase": "awaiting_stream",
            "started_at": started_at.isoformat(),
        }):
            receipt = await receipts.find_one({"_id": receipt_id})
            if not receipt:
                return unconfirmed
            if receipt.get("fingerprint") != fingerprint:
                return {"status": "rejected", "reason": "client_event_id_conflict"}
            if receipt.get("status") == "accepted":
                return {"status": "duplicate", "event_id": receipt["event_id"]}
            if receipt.get("status") == "rejected":
                return {"status": "rejected", "reason": receipt["reason"]}
            if receipt.get("phase") == "awaiting_stream":
                started_at = datetime.fromisoformat(receipt["started_at"])
            elif receipt.get("phase") == "triggering_survey" and event_name == "survey.shown" and receipt.get("event_id"):
                entry_id = receipt["event_id"]
                resume_survey = replay_display = True
            elif receipt.get("phase") in ("stream_appended", "event_stored", "dispatching", "derived") and receipt.get("event_id"):
                entry_id = receipt["event_id"]
                if receipt["phase"] == "stream_appended":
                    saved_append = receipt
                resume_survey = receipt["phase"] == "derived"
                verify_derivation = receipt["phase"] == "dispatching"
                counter_saved = receipt.get("counter_saved") is True
            else:
                return unconfirmed
        deadline = int((started_at + CLIENT_STREAM_APPEND_WINDOW).timestamp() * 1000)
        stream_receipt = (f"{receipt_id}:stream", deadline)

    async def record_stream_append(event_id: str, timestamp: str, cycle: str | None) -> None:
        await receipts.update_one(
            {"_id": receipt_id, "status": "processing", "phase": "awaiting_stream"},
            {"$set": {
                "event_id": event_id, "event_timestamp": timestamp, "event_consent_cycle": cycle,
                "phase": "stream_appended",
            }},
            upsert=False,
        )

    try:
        needs_storage_checkpoint = entry_id is None or saved_append is not None
        if entry_id is None:
            entry_id = await append_research_event(
                redis, user_id, event_name, props=props, ts=ts,
                on_stream_append=record_stream_append if receipt_id else None,
                stream_receipt=stream_receipt,
            )
        elif saved_append is not None:
            await _persist_event(
                user_id, event_name, props, entry_id,
                saved_append["event_timestamp"], saved_append.get("event_consent_cycle"),
            )
        if entry_id:
            if verify_derivation:
                from app.research.derive import counter_derivation_is_saved

                if not counter_saved and not await counter_derivation_is_saved(redis, user_id, event_name, entry_id):
                    return unconfirmed
                checkpoint = await receipts.update_one(
                    {"_id": receipt_id, "status": "processing", "phase": "dispatching"},
                    {"$set": {"phase": "derived"}},
                    upsert=False,
                )
                if not checkpoint["matched_count"]:
                    return unconfirmed
                resume_survey = True
            if receipt_id and needs_storage_checkpoint:
                await receipts.update_one(
                    {"_id": receipt_id, "phase": "stream_appended"},
                    {"$set": {"phase": "event_stored"}},
                    upsert=False,
                )
            if receipt_id and not resume_survey:
                claim = await receipts.update_one(
                    {"_id": receipt_id, "status": "processing", "phase": "event_stored"},
                    {"$set": {"phase": "dispatching"}}, upsert=False,
                )
                if not claim["matched_count"]:
                    return unconfirmed

            async def claim_survey() -> bool:
                if not resume_survey:
                    checkpoint = await receipts.update_one(
                        {"_id": receipt_id, "status": "processing", "phase": "dispatching"},
                        {"$set": {"phase": "derived"}}, upsert=False,
                    )
                    if not checkpoint["matched_count"]:
                        return False
                claim = await receipts.update_one(
                    {"_id": receipt_id, "status": "processing", "phase": "derived"},
                    {"$set": {"phase": "triggering_survey"}}, upsert=False,
                )
                return bool(claim["matched_count"])

            dispatched_id = await dispatch(
                redis, user_id, event_name, props=props, event_id=entry_id, skip_append=True,
                skip_derivation=resume_survey, receipt_id=receipt_id,
                before_survey=claim_survey if receipt_id and not replay_display else None,
            )
            if receipt_id and not dispatched_id:
                return unconfirmed
            outcome = {"status": "accepted", "event_id": entry_id}
        else:
            outcome = {"status": "rejected", "reason": "consent_required"}
        if receipt_id:
            query = {"_id": receipt_id, "status": "processing"}
            if not entry_id:
                query["phase"] = "awaiting_stream"
            result = await receipts.update_one(query, {"$set": outcome}, upsert=False)
            if not result["matched_count"]:
                return unconfirmed
        return outcome
    except _StreamAppendWindowElapsed:
        return unconfirmed
    except Exception:
        if not receipt_id:
            raise
        logger.exception("Research event processing interrupted for receipt %s", receipt_id)
        return unconfirmed
