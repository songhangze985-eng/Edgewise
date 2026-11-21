from __future__ import annotations

import csv
import hashlib
import io
import json
import math
import re
from collections.abc import AsyncIterator
from typing import Any

from fastapi import HTTPException
from redis.asyncio import Redis

from app.core.index_store import get_all_user_ids
from app.core.mongo_client import mongo_store
from app.core.redis_client import get_json
from app.models.schemas import ResearchSurveyContext, UserInDB
from app.research.admin_stats.privacy import export_user_pseudonym
from app.research.derive import derive_daily_aggregates, get_auto_metadata, get_report_auto_fields
from app.research.events import current_cycle_posttest_dates, event_times_in_consent_cycle, get_survey_offer, ingest_client_events, user_has_research_consent
from app.research.keys import RULE_VERSION, SURVEY_ITEMS_VERSION
from app.research.survey_engine import get_pending_survey_items, get_current_survey_answers, load_survey_items, record_survey_response
from app.research.blind_review import list_blind_review_batch, submit_blind_scores


async def ingest_events(redis: Redis, user: UserInDB, events: list[Any]) -> tuple[int, list[str], list[dict[str, Any]]]:
    outcomes: list[dict[str, Any]] = []
    event_ids = await ingest_client_events(redis, user.id, events, outcomes=outcomes)
    return len(event_ids), event_ids, outcomes


async def pending_survey(
    redis: Redis,
    user: UserInDB,
    *,
    context: str | None,
) -> dict[str, Any]:
    user_data = await get_json(redis, f"user:{user.id}") or {}
    return await get_pending_survey_items(
        redis,
        user.id,
        context=context,
        posttest_j1_done=bool(current_cycle_posttest_dates(user_data)["posttest_completed_at"]),
    )


async def submit_survey_answers(
    redis: Redis,
    user: UserInDB,
    answers: list[dict[str, Any]],
    *,
    submission_id: str | None = None,
    answer_context: ResearchSurveyContext | None = None,
    offer_event_id: str | None = None,
) -> list[dict[str, Any]]:
    from app.research.admin_stats.cache import invalidate_stats_cache

    user_data = await get_json(redis, f"user:{user.id}") or {}
    consent = user_data.get("research_consent") or {}
    if not consent.get("accepted") or consent.get("withdrawn_at"):
        raise HTTPException(status_code=403, detail="Research consent required")
    if answer_context is not None and (
        answer_context.user_id != user.id or answer_context.consent_accepted_at != consent.get("accepted_at")
    ):
        raise HTTPException(status_code=409, detail="问卷所属账号或同意周期已变更，请重新打开问卷")

    offered_ids = None
    if offer_event_id is not None:
        offer = await get_survey_offer(user.id, consent.get("accepted_at"), offer_event_id)
        offered_ids = (offer or {}).get("item_ids")
        if not isinstance(offered_ids, list) or offer.get("survey_version") != SURVEY_ITEMS_VERSION:
            raise HTTPException(status_code=409, detail="问卷下发记录与当前账号或版本不一致")

    posttest_done = current_cycle_posttest_dates(user_data)["posttest_completed_at"] is not None
    definitions = {item["id"]: item for item in load_survey_items()}
    seen: set[str] = set()
    for answer in answers:
        item_id = answer["item_id"]
        item = definitions.get(item_id)
        if item is None or item_id in seen:
            raise HTTPException(status_code=422, detail="Unknown or duplicate survey item")
        if offered_ids is not None and item_id not in offered_ids:
            raise HTTPException(status_code=422, detail="题目不在本次下发的问卷中")
        if item.get("trigger") == "posttest_day7" and not posttest_done:
            raise HTTPException(status_code=409, detail="请先完成当前同意周期的第七天后测")
        seen.add(item_id)
        value = answer.get("value")
        if answer.get("skipped"):
            if value is not None:
                raise HTTPException(status_code=422, detail="Skipped answers cannot have a value")
        elif item["type"] == "likert7":
            if isinstance(value, bool) or not isinstance(value, int) or not 1 <= value <= 7:
                raise HTTPException(status_code=422, detail="Likert answers must be between 1 and 7")
        elif item["type"] == "single":
            if value not in item.get("options", []):
                raise HTTPException(status_code=422, detail="Invalid survey option")
        elif item["type"] == "open":
            if not isinstance(value, str) or not value.strip():
                raise HTTPException(status_code=422, detail="Survey answer cannot be empty")

    receipts = mongo_store.collection("surveys")
    receipt_id = None
    if offer_event_id is not None or submission_id is not None:
        identity = json.dumps(
            [user.id, "offer", offer_event_id] if offer_event_id is not None else [user.id, submission_id],
        )
        receipt_id = "survey:submission:" + hashlib.sha256(identity.encode()).hexdigest()
        ordered = sorted(answers, key=lambda answer: answer["item_id"])
        payload = json.dumps([consent.get("accepted_at"), ordered], sort_keys=True)
        fingerprint = hashlib.sha256(payload.encode()).hexdigest()
        await receipts.insert_if_absent(receipt_id, {
            "doc_type": "survey_submission_receipt", "user_id": user.id, "fingerprint": fingerprint,
        })
        receipt = await receipts.find_one({"_id": receipt_id})
        if receipt is None:
            raise HTTPException(status_code=503, detail="Survey submission could not be confirmed")
        if receipt["fingerprint"] != fingerprint:
            raise HTTPException(status_code=409, detail="Survey submission ID already used for a different response")

    results: list[dict[str, Any]] = []
    for item in answers:
        item_id = item["item_id"]
        response_path = f"responses.{item_id}"
        record = None
        if receipt_id is not None:
            query = {"_id": receipt_id, response_path: None}
            claim = await receipts.update_one(query, {"$set": {response_path: "processing"}}, upsert=False)
            if not claim["matched_count"]:
                receipt = await receipts.find_one({"_id": receipt_id})
                saved = ((receipt or {}).get("responses") or {}).get(item_id)
                if isinstance(saved, dict):
                    if "answered_at" in saved:
                        saved = {**saved, "value": item.get("value")}
                    results.append({"item_id": item_id, **saved})
                    continue
                if saved == "processing":
                    durable = await receipts.find_one({"_id": f"survey:answers:{user.id}"}) or {}
                    proof = (durable.get("_submission_receipts") or {}).get(item_id) or {}
                    candidate = (durable.get("answers") or {}).get(item_id) or {}
                    recorded_at = candidate.get("answered_at") or candidate.get("skipped_at")
                    if proof.get("id") == receipt_id and proof.get("recorded_at") == recorded_at:
                        record = candidate
                if not isinstance(record, dict):
                    raise HTTPException(status_code=503, detail="Survey submission could not be confirmed")
        if record is None:
            record = await record_survey_response(
                redis,
                user.id,
                item_id,
                value=item.get("value"),
                skipped=bool(item.get("skipped")),
                expected_consent_at=consent.get("accepted_at") if offer_event_id or answer_context else None,
                submission_receipt_id=receipt_id,
                offer_event_id=offer_event_id,
            )
        if receipt_id is not None:
            summary = {key: value for key, value in record.items() if key != "value"}
            confirmed = await receipts.update_one(
                {"_id": receipt_id, response_path: "processing"},
                {"$set": {response_path: summary}},
                upsert=False,
            )
            if not confirmed["matched_count"]:
                receipt = await receipts.find_one({"_id": receipt_id})
                if ((receipt or {}).get("responses") or {}).get(item_id) != summary:
                    raise HTTPException(status_code=503, detail="Survey submission could not be confirmed")
        results.append({"item_id": item_id, **record})
    await invalidate_stats_cache(redis)
    return results


async def run_daily_derive(redis: Redis, user_id: str | None = None) -> int:
    if user_id:
        await derive_daily_aggregates(redis, user_id)
        return 1
    user_ids = await get_all_user_ids(redis)
    for uid in user_ids:
        user_data = await get_json(redis, f"user:{uid}")
        consent = (user_data or {}).get("research_consent") or {}
        if consent.get("accepted") and not consent.get("withdrawn_at"):
            await derive_daily_aggregates(redis, uid)
    return len(user_ids)


async def _referral_evidence_for_export(
    redis: Redis, user_data: dict[str, Any], edges: list[dict[str, Any]], *, anonymize: bool,
) -> dict[str, Any]:
    from app.services.referral_reward_service import REFERRAL_INCENTIVE_OPTIONS

    record = user_data.get("referral_incentive_assignment") or {}
    kind = record.get("type")
    assignment = None
    if kind in REFERRAL_INCENTIVE_OPTIONS:
        assignment = {key: record.get(key) for key in ("type", "assigned_at", "source")}
    elif user_data.get("referral_incentive_assigned") and user_data.get("referral_incentive") in REFERRAL_INCENTIVE_OPTIONS:
        assignment = {"type": user_data["referral_incentive"], "assigned_at": None, "source": None}

    for edge in edges:
        invitee_id = edge["invitee_id"]
        if edge["qualification_confirmed"]:
            meta = (await get_auto_metadata(redis, invitee_id)).get("qualified_activation") or {}
            edge["qualification_computed_at"] = meta.get("computed_at")
            edge["qualification_source_event_id"] = meta.get("source_event_id")
        if anonymize:
            edge["invitee_id"] = export_user_pseudonym(invitee_id)
    return {"incentive_assignment": assignment, "bindings": edges}


def _remove_open_answers(auto: dict[str, Any], auto_meta: dict[str, Any], survey: dict[str, Any]) -> dict[str, Any]:
    for field in ("J1", "posttest_answer"):
        auto.pop(field, None)
        auto_meta.pop(field, None)
    open_ids = {item["id"] for item in load_survey_items() if item["type"] == "open"}
    return {
        item_id: {key: value for key, value in entry.items() if key != "value"} if item_id in open_ids else entry
        for item_id, entry in survey.items()
    }


async def export_research_panel(redis: Redis, *, anonymize: bool) -> str:
    user_ids = await get_all_user_ids(redis)
    lines: list[str] = []
    for user_id in user_ids:
        user_data = await get_json(redis, f"user:{user_id}")
        if not user_data:
            continue
        consent = user_data.get("research_consent") or {}
        if not consent.get("accepted") or consent.get("withdrawn_at"):
            continue
        auto, auto_meta, referral_edges = await get_report_auto_fields(redis, user_id, user_data)
        survey = await get_current_survey_answers(redis, user_id, consent)
        if anonymize:
            survey = _remove_open_answers(auto, auto_meta, survey)
        assignment = user_data.get("experiment_assignment") or {}
        document = {
            "user_id": export_user_pseudonym(user_id) if anonymize else user_id,
            "experiment_arm": assignment.get("arm"),
            "experiment_assignment": assignment,
            "auto": auto,
            "auto_meta": auto_meta,
            "referral_evidence": await _referral_evidence_for_export(redis, user_data, referral_edges, anonymize=anonymize),
            "survey": survey,
            "rule_version": RULE_VERSION,
            "survey_items_version": SURVEY_ITEMS_VERSION,
            "consent_version": consent.get("version"),
            "consent_accepted_at": consent.get("accepted_at"),
            "consent_had_declined": consent.get("had_declined"),
            "data_scope": "consent_cycle_not_verified",
        }
        lines.append(json.dumps(document, ensure_ascii=False))
    return "\n".join(lines) + ("\n" if lines else "")


async def export_research_panel_csv(redis: Redis, *, anonymize: bool) -> str:
    user_ids = await get_all_user_ids(redis)
    buffer = io.StringIO()
    writer = csv.writer(buffer)
    survey_ids = [item["id"] for item in load_survey_items()]
    writer.writerow(
        ["user_id", "experiment_arm", "rule_version", "survey_items_version", "auto_json", "survey_json", "auto_meta_json", "assignment_source"]
        + survey_ids + ["consent_accepted_at", "consent_had_declined", "data_scope", "referral_evidence_json"]
    )
    for user_id in user_ids:
        user_data = await get_json(redis, f"user:{user_id}")
        if not user_data:
            continue
        consent = user_data.get("research_consent") or {}
        if not consent.get("accepted") or consent.get("withdrawn_at"):
            continue
        auto, auto_meta, referral_edges = await get_report_auto_fields(redis, user_id, user_data)
        survey_parsed = await get_current_survey_answers(redis, user_id, consent)
        if anonymize:
            survey_parsed = _remove_open_answers(auto, auto_meta, survey_parsed)
        assignment = user_data.get("experiment_assignment") or {}
        user_col = export_user_pseudonym(user_id) if anonymize else user_id
        row = [
            user_col,
            assignment.get("arm"),
            RULE_VERSION,
            SURVEY_ITEMS_VERSION,
            json.dumps(auto, ensure_ascii=False),
            json.dumps(survey_parsed, ensure_ascii=False),
            json.dumps(auto_meta, ensure_ascii=False),
            assignment.get("source"),
        ]
        for item_id in survey_ids:
            entry = survey_parsed.get(item_id)
            if isinstance(entry, dict):
                row.append(entry.get("value") if entry.get("status") == "answered" else entry.get("status"))
            else:
                row.append(None)
        referral_evidence = await _referral_evidence_for_export(redis, user_data, referral_edges, anonymize=anonymize)
        row.extend([consent.get("accepted_at"), consent.get("had_declined"), "consent_cycle_not_verified",
                    json.dumps(referral_evidence, ensure_ascii=False)])
        writer.writerow(row)
    return buffer.getvalue()


# Only the structured properties needed to join research measurements enter this export.
_EVENT_EXPORT_FIELDS = {
    "survey.enqueued": ("trigger", "item_ids", "survey_version"),
    "survey.offered": ("item_ids", "survey_version"),
    "survey.shown": ("item_ids", "survey_version", "offer_event_id"),
    "series.episode_viewed": (
        "series_id", "episode_id", "variant", "planned_variant", "content_version", "exposure_basis", "series_page_view_id",
    ),
    "series.task_started": (
        "series_id", "episode_id", "task_slug", "variant", "planned_variant", "content_version", "action",
        "series_page_view_id", "series_task_click_id",
    ),
    "copilot.triage": ("triage_id", "need", "has_clarify", "provider_elapsed_ms", "provider"),
    "copilot.triage_response": ("triage_id", "turn", "request_elapsed_ms", "outcome"),
    "task_page.cta_clicked": ("task_id", "task_entry_click_id", "series_task_click_id", "prefill"),
    "task.started": ("task_id", "session_id"),
    "task.steps_to_start": ("task_id", "session_id", "task_entry_click_id", "steps", "elapsed_ms"),
    "interview.session.created": ("task_id", "session_id"),
    "interview.answer.submit": ("session_id", "round_index", "question_index", "text_length", "char_count", "voice_duration_sec"),
    "feedback.view": ("session_id", "round_index", "question_index", "assigned"),
    "revision.feedback_shown": ("session_id", "round_index", "question_index", "assigned"),
    "answer.revise": ("session_id", "round_index", "question_index", "assigned"),
    "feedback.reject": ("session_id", "round_index", "question_index", "assigned"),
    "revision.submitted": ("session_id", "round_index", "question_index", "assigned"),
    "revision.decision": ("session_id", "round_index", "question_index", "assigned", "decision"),
    "interview.complete": ("session_id", "score_status"),
}
_EVENT_EXPORT_TOKEN = re.compile(r"[a-zA-Z0-9_.:-]{1,80}")


def _event_export_properties(event_name: str, props: dict[str, Any]) -> dict[str, Any]:
    clean: dict[str, Any] = {}
    for key in _EVENT_EXPORT_FIELDS[event_name]:
        value = props.get(key)
        if key == "item_ids" and isinstance(value, list):
            clean[key] = [item for item in value[:100] if isinstance(item, str) and _EVENT_EXPORT_TOKEN.fullmatch(item)]
        elif key == "voice_duration_sec":
            if type(value) in (int, float) and 0 <= value <= 2**31 - 1 and math.isfinite(value):
                clean[key] = value
        elif key == "decision":
            if value in ("revise", "decline", "skip"):
                clean[key] = value
        elif isinstance(value, bool) or (type(value) is int and 0 <= value <= 2**31 - 1):
            clean[key] = value
        elif isinstance(value, str) and _EVENT_EXPORT_TOKEN.fullmatch(value):
            clean[key] = value
    if event_name == "feedback.reject":
        clean["has_reason"] = bool(props.get("reason"))
    return clean


async def export_research_event_rows(redis: Redis) -> AsyncIterator[str]:
    collection = mongo_store.collection("research_events")
    async for doc in collection.iter_documents({"event": {"$in": list(_EVENT_EXPORT_FIELDS)}}):
        user_id = doc.get("user_id")
        if not isinstance(user_id, str) or not user_id:
            continue
        user = await get_json(redis, f"user:{user_id}") or {}
        if not user_has_research_consent(user):
            continue
        consent = user["research_consent"]
        cycle = consent.get("accepted_at")
        if not cycle:
            continue
        times = event_times_in_consent_cycle(doc, cycle)
        if times is None:
            continue
        occurred, received = times
        entry_id = doc.get("stream_entry_id")
        event_name = doc["event"]
        yield json.dumps({
            "user_id": export_user_pseudonym(user_id),
            "event_id": entry_id,
            "event": event_name,
            "occurred_at": occurred.isoformat(),
            "received_at": received.isoformat(),
            "props": _event_export_properties(event_name, doc["props"]),
        }, ensure_ascii=False) + "\n"


async def blind_review_pending(redis: Redis, *, reviewer_id: str, limit: int = 10) -> list[dict[str, Any]]:
    return await list_blind_review_batch(redis, limit=limit, reviewer_id=reviewer_id)


async def blind_review_submit(redis: Redis, reviewer_id: str, payload: dict[str, Any]) -> None:
    await submit_blind_scores(
        redis,
        payload["review_token"],
        payload.get("scores") or {},
        reviewer_id=reviewer_id,
    )
