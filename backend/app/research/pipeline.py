from __future__ import annotations

from typing import Any

from redis.asyncio import Redis

from app.core.redis_client import get_json
from app.research.derive import derive_on_event
from app.research.events import append_research_event, user_has_research_consent
from app.research.survey_engine import handle_survey_trigger_event


async def on_research_event(
    redis: Redis,
    user_id: str,
    event: str,
    *,
    props: dict[str, Any] | None = None,
    event_id: str | None = None,
    skip_append: bool = False,
) -> str | None:
    props = props or {}
    if not skip_append:
        event_id = await append_research_event(
            redis,
            user_id,
            event,
            props=props,
            skip_consent_check=event
            in (
                "research.consent.granted",
                "research.consent.withdrawn",
                "research.arm.assigned",
                "auth.register",
            ),
        )
        if event_id is None:
            return None

    user_data = await get_json(redis, f"user:{user_id}")
    if user_has_research_consent(user_data) or event in (
        "research.consent.granted",
        "research.consent.withdrawn",
        "research.arm.assigned",
        "posttest.open",
        "org.joined",
        "org.mentor_share",
        "workshop.completed",
    ):
        await derive_on_event(redis, user_id, event, props, event_id=event_id)
        await handle_survey_trigger_event(redis, user_id, event, props)

    return event_id


async def emit_server_event(
    redis: Redis,
    user_id: str,
    event: str,
    props: dict[str, Any] | None = None,
) -> None:
    await on_research_event(redis, user_id, event, props=props or {})
