from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Any

from redis.asyncio import Redis

from app.core.redis_client import get_json
from app.research.keys import event_stream_key

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
        "copilot.triage",
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


async def append_research_event(
    redis: Redis,
    user_id: str,
    event: str,
    *,
    props: dict[str, Any] | None = None,
    ts: str | None = None,
    skip_consent_check: bool = False,
) -> str | None:
    """Append to research:event stream. Returns Redis stream entry id or None if skipped."""
    if event not in ALLOWED_CLIENT_EVENTS and event not in SERVER_EVENTS:
        return None

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

    timestamp = ts or datetime.now(timezone.utc).isoformat()
    payload = {
        "event": event,
        "ts": timestamp,
        "props": json.dumps(props or {}, ensure_ascii=False),
    }
    entry_id = await redis.xadd(event_stream_key(user_id), payload)
    return entry_id


async def read_event_stream(
    redis: Redis,
    user_id: str,
    *,
    count: int = 500,
) -> list[dict[str, Any]]:
    raw = await redis.xrevrange(event_stream_key(user_id), count=count)
    events: list[dict[str, Any]] = []
    for entry_id, fields in raw:
        props_raw = fields.get("props") or "{}"
        try:
            props = json.loads(props_raw)
        except json.JSONDecodeError:
            props = {}
        events.append(
            {
                "id": entry_id,
                "event": fields.get("event"),
                "ts": fields.get("ts"),
                "props": props,
            }
        )
    events.reverse()
    return events


async def ingest_client_events(
    redis: Redis,
    user_id: str,
    events: list[dict[str, Any]],
) -> list[str]:
    from app.research.pipeline import on_research_event

    ids: list[str] = []
    for item in events:
        event_name = item.get("event")
        if not event_name or event_name not in ALLOWED_CLIENT_EVENTS:
            continue
        props = item.get("props") if isinstance(item.get("props"), dict) else {}
        ts = item.get("ts")
        entry_id = await append_research_event(redis, user_id, event_name, props=props, ts=ts)
        if entry_id:
            ids.append(entry_id)
            await on_research_event(
                redis,
                user_id,
                event_name,
                props=props,
                event_id=entry_id,
                skip_append=True,
            )
    return ids
