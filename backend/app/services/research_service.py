from __future__ import annotations

import csv
import hashlib
import io
import json
import random
from datetime import datetime, timedelta, timezone
from typing import Any
from uuid import uuid4

from fastapi import HTTPException, status
from redis.asyncio import Redis

from app.core.redis_client import get_json, set_json
from app.data.posttest_probes import POSTTEST_PROBES
from app.models.schemas import (
    ExperimentAssignmentView,
    ExperimentFactorsView,
    ResearchConsentUpdate,
    ResearchConsentView,
    ResearchExperimentContext,
    ResearchInviteView,
    ResearchPosttestStatus,
    UserInDB,
)
from app.research.blind_review import enqueue_posttest_for_blind_review
from app.research.derive import set_auto_field
from app.research.pipeline import emit_server_event
from app.research.survey_engine import clear_survey_on_withdraw
from app.services.referral_service import ensure_user_invite_code, session_counts_toward_activation

PRODUCT_VERSION = "1.0.0-mvp"
RESEARCH_CONSENT_VERSION = "2026-11-03-full"
EXPERIMENT_ARMS = ("00", "01", "10", "11")
POSTTEST_DAYS = 7
FOLLOWUP_TASK_DAYS = 14

TOUCHPOINT_KEYS = (
    "utm_source",
    "utm_medium",
    "utm_campaign",
    "entry",
    "task_id",
    "entry_channel",
    "experiment_arm",
)


def user_research_eligible(user_data: dict[str, Any]) -> bool:
    consent = user_data.get("research_consent") or {}
    return bool(consent.get("accepted"))


def parse_experiment_arm(arm: str) -> dict[str, Any]:
    normalized = arm.strip()
    if normalized not in EXPERIMENT_ARMS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="experiment_arm must be one of 00, 01, 10, 11",
        )
    return {
        "arm": normalized,
        "factors": {
            "continuity": int(normalized[0]),
            "participation": int(normalized[1]),
        },
    }


async def _pick_balanced_arm(redis: Redis) -> str:
    counts = {
        arm: int(await redis.get(f"research:arm_count:{arm}") or 0) for arm in EXPERIMENT_ARMS
    }
    min_count = min(counts.values())
    candidates = [arm for arm, count in counts.items() if count == min_count]
    chosen = random.choice(candidates)
    await redis.incr(f"research:arm_count:{chosen}")
    return chosen


def _assignment_record(arm: str, *, source: str, assigned_at: str) -> dict[str, Any]:
    parsed = parse_experiment_arm(arm)
    return {
        "arm": parsed["arm"],
        "factors": parsed["factors"],
        "assigned_at": assigned_at,
        "source": source,
    }


def _schedule_research_dates(assigned_at: str) -> tuple[str, str]:
    assigned_dt = datetime.fromisoformat(assigned_at.replace("Z", "+00:00"))
    posttest = assigned_dt + timedelta(days=POSTTEST_DAYS)
    followup = assigned_dt + timedelta(days=FOLLOWUP_TASK_DAYS)
    return posttest.isoformat(), followup.isoformat()


async def assign_experiment_arm(
    redis: Redis,
    user_data: dict[str, Any],
    *,
    override_arm: str | None = None,
    source: str = "random_balanced",
) -> dict[str, Any]:
    existing = user_data.get("experiment_assignment")
    if existing and existing.get("arm"):
        from app.services.referral_reward_service import ensure_experiment_referral_incentive

        await ensure_experiment_referral_incentive(redis, user_data)
        return existing

    now = datetime.now(timezone.utc).isoformat()
    arm = override_arm.strip() if override_arm else await _pick_balanced_arm(redis)
    parse_experiment_arm(arm)
    if override_arm:
        source = "query_override"

    assignment = _assignment_record(arm, source=source, assigned_at=now)
    user_data["experiment_assignment"] = assignment
    posttest_due, followup_due = _schedule_research_dates(now)
    user_data["posttest_due_at"] = posttest_due
    user_data["followup_task_due_at"] = followup_due
    user_data["updated_at"] = now
    await set_json(redis, f"user:{user_data['id']}", user_data)
    await emit_server_event(
        redis,
        user_data["id"],
        "research.arm.assigned",
        {
            "arm": assignment["arm"],
            "factors": assignment["factors"],
        },
    )
    from app.services.referral_reward_service import ensure_experiment_referral_incentive

    user_data = await ensure_experiment_referral_incentive(redis, user_data)
    return user_data.get("experiment_assignment") or assignment


async def accelerate_research_dates(redis: Redis, user_data: dict[str, Any]) -> dict[str, Any]:
    now = datetime.now(timezone.utc).isoformat()
    user_data["posttest_due_at"] = now
    user_data["followup_task_due_at"] = now
    user_data["updated_at"] = now
    await set_json(redis, f"user:{user_data['id']}", user_data)
    return user_data


def experiment_participation_mode(user_data: dict[str, Any]) -> str | None:
    assignment = user_data.get("experiment_assignment") or {}
    factors = assignment.get("factors") or {}
    participation = factors.get("participation")
    if participation == 0:
        return "demo"
    if participation == 1:
        return "active"
    return None


def experiment_task_continuity(user_data: dict[str, Any]) -> str | None:
    assignment = user_data.get("experiment_assignment") or {}
    factors = assignment.get("factors") or {}
    continuity = factors.get("continuity")
    if continuity == 1:
        return "linked"
    if continuity == 0:
        return "free"
    return None


async def backfill_research_eligible_sessions(redis: Redis, user_id: str) -> int:
    session_ids = await redis.zrevrange(f"user:{user_id}:sessions", 0, -1)
    updated = 0
    for session_id in session_ids:
        session = await get_json(redis, f"session:{session_id}")
        if not session:
            continue
        metadata = session.get("metadata") or {}
        if metadata.get("research_eligible") is True:
            continue
        metadata["research_eligible"] = True
        session["metadata"] = metadata
        session["updated_at"] = datetime.now(timezone.utc).isoformat()
        await set_json(redis, f"session:{session_id}", session)
        updated += 1
    return updated


async def hydrate_public_user_fields(redis: Redis, user_data: dict[str, Any]) -> dict[str, Any]:
    await ensure_user_invite_code(redis, user_data)
    return user_data


def extract_touchpoint(client_metadata: dict[str, Any]) -> dict[str, Any]:
    nested = client_metadata.get("touchpoint")
    if isinstance(nested, dict):
        source = {**nested}
    else:
        source = {}
    for key in TOUCHPOINT_KEYS:
        if key in client_metadata and client_metadata[key] is not None:
            source[key] = client_metadata[key]
    research_touchpoint = client_metadata.get("research_touchpoint")
    if isinstance(research_touchpoint, dict):
        for key, value in research_touchpoint.items():
            if value is not None:
                source[key] = value
    return {key: source[key] for key in TOUCHPOINT_KEYS if source.get(key) is not None}


def build_session_research_metadata(
    user_data: dict[str, Any],
    client_metadata: dict[str, Any] | None = None,
) -> dict[str, Any]:
    client_metadata = client_metadata or {}
    touchpoint = extract_touchpoint(client_metadata)
    now = datetime.now(timezone.utc).isoformat()
    task_id = touchpoint.get("task_id") or client_metadata.get("task_id")
    entry_channel = touchpoint.get("entry_channel") or touchpoint.get("entry") or touchpoint.get("utm_source")
    meta: dict[str, Any] = {
        "research_eligible": user_research_eligible(user_data),
        "product_version": PRODUCT_VERSION,
        "research_path": {"started_at": now},
    }
    if touchpoint:
        meta["touchpoint"] = touchpoint
    if task_id:
        meta["task_id"] = task_id
    if entry_channel:
        meta["entry_channel"] = entry_channel

    assignment = user_data.get("experiment_assignment") or {}
    arm = touchpoint.get("experiment_arm") or assignment.get("arm")
    if arm:
        meta["experiment_arm"] = arm

    source = client_metadata.get("source") or client_metadata.get("research_session_source")
    if source:
        meta["source"] = source

    participation_mode = client_metadata.get("participation_mode") or experiment_participation_mode(user_data)
    if client_metadata.get("participation_mode"):
        participation_mode = client_metadata["participation_mode"]
    elif source == "day14_voluntary":
        participation_mode = "active"
    elif source == "research_posttest":
        participation_mode = "active"

    if participation_mode:
        meta["participation_mode"] = participation_mode

    task_continuity = client_metadata.get("task_continuity") or experiment_task_continuity(user_data)
    if task_continuity:
        meta["task_continuity"] = task_continuity

    if client_metadata.get("counts_toward_activation") is not None:
        meta["counts_toward_activation"] = client_metadata["counts_toward_activation"]
    elif source == "day14_voluntary":
        meta["counts_toward_activation"] = True
    elif source == "research_posttest":
        meta["counts_toward_activation"] = False
    elif source == "experiment_assigned_practice" or participation_mode == "demo":
        meta["counts_toward_activation"] = False
    else:
        meta["counts_toward_activation"] = True

    if user_data.get("referred_by"):
        meta["referred_by"] = user_data["referred_by"]
    if user_data.get("invite_code"):
        meta["invite_code"] = user_data["invite_code"]
    if user_data.get("referral_incentive"):
        meta["referral_incentive"] = user_data["referral_incentive"]

    if client_metadata.get("posttest_probe_id"):
        meta["posttest_probe_id"] = client_metadata["posttest_probe_id"]
        meta["posttest"] = True

    return meta


def merge_client_metadata_for_session(
    user_data: dict[str, Any],
    client_metadata: dict[str, Any],
) -> dict[str, Any]:
    research_fields = build_session_research_metadata(user_data, client_metadata)
    reserved = set(TOUCHPOINT_KEYS) | {"touchpoint", "research_touchpoint", "task_id", "entry_channel"}
    passthrough = {k: v for k, v in client_metadata.items() if k not in reserved}
    return {**passthrough, **research_fields}


async def set_research_consent(
    redis: Redis,
    user: UserInDB,
    payload: ResearchConsentUpdate,
) -> ResearchConsentView:
    user_data = await get_json(redis, f"user:{user.id}")
    if user_data is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    now = datetime.now(timezone.utc).isoformat()
    previous = user_data.get("research_consent") or {}
    had_declined = bool(previous.get("had_declined")) or previous.get("accepted") is False

    consent_record: dict[str, Any] = {
        "accepted": payload.accepted,
        "accepted_at": now,
        "version": RESEARCH_CONSENT_VERSION,
        "had_declined": had_declined or payload.accepted is False,
    }
    if payload.accepted:
        consent_record["withdrawn_at"] = None
        await ensure_user_invite_code(redis, user_data)
        if payload.experiment_arm or not user_data.get("experiment_assignment"):
            await assign_experiment_arm(
                redis,
                user_data,
                override_arm=payload.experiment_arm,
                source="query_override" if payload.experiment_arm else "consent_accept",
            )
            user_data = await get_json(redis, f"user:{user.id}") or user_data
        if had_declined:
            await backfill_research_eligible_sessions(redis, user.id)
    else:
        consent_record["withdrawn_at"] = now

    user_data["research_consent"] = consent_record
    user_data["updated_at"] = now
    await set_json(redis, f"user:{user.id}", user_data)

    if payload.accepted:
        await emit_server_event(redis, user.id, "research.consent.granted", {"version": RESEARCH_CONSENT_VERSION})
    else:
        await emit_server_event(redis, user.id, "research.consent.withdrawn", {})
        await clear_survey_on_withdraw(redis, user.id)

    from app.research.admin_stats.cache import invalidate_stats_cache

    await invalidate_stats_cache(redis)

    return ResearchConsentView.model_validate(consent_record)


async def get_experiment_context(redis: Redis, user: UserInDB) -> ResearchExperimentContext:
    user_data = await get_json(redis, f"user:{user.id}")
    if user_data is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    assignment_raw = user_data.get("experiment_assignment")
    assignment = None
    if assignment_raw:
        assignment = ExperimentAssignmentView.model_validate(
            {
                **assignment_raw,
                "factors": ExperimentFactorsView.model_validate(assignment_raw.get("factors") or {}),
            }
        )

    continuity_prefill: dict[str, Any] = {}
    anchor = user_data.get("continuity_anchor") or {}
    if anchor:
        continuity_prefill = {
            "difficulty": anchor.get("difficulty"),
            "position": anchor.get("position"),
            "question_ids": anchor.get("question_ids"),
            "task_id": anchor.get("task_id"),
            "topic": anchor.get("topic"),
        }

    return ResearchExperimentContext(
        assignment=assignment,
        participation_mode=experiment_participation_mode(user_data),
        task_continuity=experiment_task_continuity(user_data),
        continuity_prefill=continuity_prefill,
        experiment_practice_completed=bool(user_data.get("experiment_practice_completed_at")),
    )


def _parse_iso(value: str | None) -> datetime | None:
    if not value:
        return None
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


def _pick_posttest_probe(user_data: dict[str, Any]) -> dict[str, str]:
    user_hash = int(hashlib.sha256(user_data["id"].encode()).hexdigest(), 16)
    return POSTTEST_PROBES[user_hash % len(POSTTEST_PROBES)]


async def get_posttest_status(
    redis: Redis,
    user: UserInDB,
    *,
    accelerate: bool = False,
) -> ResearchPosttestStatus:
    user_data = await get_json(redis, f"user:{user.id}")
    if user_data is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    if accelerate:
        user_data = await accelerate_research_dates(redis, user_data)

    now = datetime.now(timezone.utc)
    due_at = _parse_iso(user_data.get("posttest_due_at"))
    followup_due_at = _parse_iso(user_data.get("followup_task_due_at"))
    completed_at = user_data.get("posttest_completed_at")

    due = bool(due_at and now >= due_at and not completed_at)
    overdue = bool(due_at and now >= due_at and not completed_at)
    completed = bool(completed_at)
    followup_open = bool(followup_due_at and now >= followup_due_at)

    probe = _pick_posttest_probe(user_data) if due and not completed else None

    return ResearchPosttestStatus(
        due=due,
        overdue=overdue,
        completed=completed,
        due_at=user_data.get("posttest_due_at"),
        completed_at=completed_at,
        followup_task_open=followup_open,
        followup_task_due_at=user_data.get("followup_task_due_at"),
        probe=probe,
    )


async def submit_posttest_answer(
    redis: Redis,
    user: UserInDB,
    answer: str,
) -> dict[str, Any]:
    user_data = await get_json(redis, f"user:{user.id}")
    if user_data is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    if user_data.get("posttest_completed_at"):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Posttest already completed")

    status_view = await get_posttest_status(redis, user)
    if not status_view.due and not user.is_admin:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Posttest is not due yet")

    await emit_server_event(redis, user.id, "posttest.open", {"due_at": user_data.get("posttest_due_at")})

    probe = status_view.probe or _pick_posttest_probe(user_data)
    now = datetime.now(timezone.utc)
    now_iso = now.isoformat()
    created_at, date_value, time_value = now_iso, now.date().isoformat(), now.strftime("%H:%M")
    session_id = uuid4().hex
    assignment = user_data.get("experiment_assignment") or {}
    transcript = [
        {"role": "system", "text": "研究追访：匹配难度独立追问（Day 7）"},
        {"role": "interviewer", "text": probe["title"]},
        {"role": "user", "text": answer.strip()},
    ]
    metadata = build_session_research_metadata(
        user_data,
        {
            "source": "research_posttest",
            "participation_mode": "active",
            "counts_toward_activation": False,
            "posttest_probe_id": probe["id"],
            "posttest": True,
        },
    )
    metadata["research_path"]["answered_at"] = now_iso
    metadata["transcript"] = transcript
    metadata["messages"] = transcript

    session_record = {
        "id": session_id,
        "user_id": user.id,
        "type": "research_posttest",
        "position": None,
        "difficulty": probe.get("difficulty"),
        "topic": f"研究追访 · {probe['title'][:40]}",
        "question_id": probe["id"],
        "status": "completed",
        "score": None,
        "duration_minutes": 1,
        "date": date_value,
        "time": time_value,
        "created_at": now_iso,
        "updated_at": now_iso,
        "completed_at": now_iso,
        "metadata": metadata,
    }
    if assignment.get("arm"):
        session_record["metadata"]["experiment_arm"] = assignment["arm"]

    await set_json(redis, f"session:{session_id}", session_record)
    await redis.zadd(f"user:{user.id}:sessions", {session_id: now.timestamp()})

    user_data["posttest_completed_at"] = now_iso
    user_data["updated_at"] = now_iso
    await set_json(redis, f"user:{user.id}", user_data)

    trimmed = answer.strip()
    await set_auto_field(redis, user.id, "J1", trimmed)
    await set_auto_field(redis, user.id, "posttest_answer", trimmed)
    await set_auto_field(redis, user.id, "posttest_status", "done")
    await enqueue_posttest_for_blind_review(redis, user.id, trimmed)

    return session_record


async def get_research_invite(redis: Redis, user: UserInDB) -> ResearchInviteView:
    user_data = await get_json(redis, f"user:{user.id}")
    if user_data is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    code = await ensure_user_invite_code(redis, user_data)
    incentive = user_data.get("referral_incentive") or "none"
    return ResearchInviteView(
        invite_code=code,
        invite_path=f"/invite/{code}",
        referral_incentive=incentive,
    )


async def record_session_completion(redis: Redis, session: dict[str, Any]) -> None:
    user_data = await get_json(redis, f"user:{session['user_id']}")
    if not user_data:
        return

    metadata = session.get("metadata") or {}
    now_iso = session.get("completed_at") or datetime.now(timezone.utc).isoformat()
    changed = False

    if metadata.get("source") == "experiment_assigned_practice" and not user_data.get(
        "experiment_practice_completed_at"
    ):
        user_data["experiment_practice_completed_at"] = now_iso
        changed = True

    if metadata.get("task_continuity") == "linked":
        user_data["continuity_anchor"] = {
            "difficulty": session.get("difficulty"),
            "position": session.get("position"),
            "question_ids": metadata.get("question_ids"),
            "task_id": metadata.get("task_id"),
            "topic": session.get("topic"),
        }
        changed = True

    if changed:
        user_data["updated_at"] = datetime.now(timezone.utc).isoformat()
        await set_json(redis, f"user:{user_data['id']}", user_data)


async def apply_research_followup(
    redis: Redis,
    session_id: str,
    current_user: UserInDB,
    payload: dict[str, Any],
) -> dict[str, Any]:
    session = await get_json(redis, f"session:{session_id}")
    if session is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found")

    if session["user_id"] != current_user.id and not current_user.is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have access to this session",
        )

    if session.get("status") != "completed":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Research follow-up is only available for completed sessions",
        )

    now = datetime.now(timezone.utc).isoformat()
    metadata = session.get("metadata") or {}
    research_path = dict(metadata.get("research_path") or {})

    if payload.get("viewed_feedback") is True and not research_path.get("viewed_feedback_at"):
        research_path["viewed_feedback_at"] = now
        await emit_server_event(
            redis,
            session["user_id"],
            "feedback.view",
            {"session_id": session_id},
        )
    if "revised" in payload and payload["revised"] is not None:
        research_path["revised"] = payload["revised"]
        research_path["followup_submitted_at"] = now
        if payload["revised"] is True:
            await emit_server_event(
                redis,
                session["user_id"],
                "answer.revise",
                {"session_id": session_id},
            )
    if payload.get("declined_revision_reason") is not None:
        research_path["declined_revision_reason"] = payload["declined_revision_reason"]
        await emit_server_event(
            redis,
            session["user_id"],
            "feedback.reject",
            {"session_id": session_id, "reason": payload["declined_revision_reason"]},
        )

    metadata["research_path"] = research_path
    session["metadata"] = metadata
    session["updated_at"] = now
    await set_json(redis, f"session:{session_id}", session)
    return session


def _anonymize_user_id(user_id: str) -> str:
    digest = hashlib.sha256(user_id.encode("utf-8")).hexdigest()
    return f"anon_{digest[:16]}"


def _transcript_length(metadata: dict[str, Any]) -> int:
    transcript = metadata.get("transcript") or metadata.get("messages") or []
    if not isinstance(transcript, list):
        return 0
    total = 0
    for item in transcript:
        if isinstance(item, dict):
            text = item.get("text") or item.get("content") or ""
            total += len(str(text))
    return total


async def _iter_consented_sessions(redis: Redis) -> list[dict[str, Any]]:
    user_ids = await redis.smembers("users:all")
    rows: list[dict[str, Any]] = []

    for user_id in user_ids:
        user_data = await get_json(redis, f"user:{user_id}")
        if not user_data:
            continue
        consent = user_data.get("research_consent") or {}
        if not consent.get("accepted"):
            continue

        session_ids = await redis.zrevrange(f"user:{user_id}:sessions", 0, -1)
        for session_id in session_ids:
            session = await get_json(redis, f"session:{session_id}")
            if not session or session.get("status") != "completed":
                continue
            rows.append({"user": user_data, "session": session})

    rows.sort(key=lambda row: row["session"].get("completed_at") or row["session"].get("created_at", ""))
    return rows


async def export_research_jsonl(redis: Redis, *, anonymize: bool) -> str:
    rows = await _iter_consented_sessions(redis)
    lines: list[str] = []
    for row in rows:
        user_data = row["user"]
        session = row["session"]
        metadata = session.get("metadata") or {}
        touchpoint = metadata.get("touchpoint") or {}
        consent = user_data.get("research_consent") or {}
        assignment = user_data.get("experiment_assignment") or {}
        document = {
            "session": session,
            "research_export": {
                "user_id": _anonymize_user_id(user_data["id"]) if anonymize else user_data["id"],
                "consent_version": consent.get("version"),
                "consent_accepted_at": consent.get("accepted_at"),
                "consent_withdrawn_at": consent.get("withdrawn_at"),
                "touchpoint": touchpoint,
                "task_id": metadata.get("task_id"),
                "entry_channel": metadata.get("entry_channel"),
                "product_version": metadata.get("product_version"),
                "experiment_arm": metadata.get("experiment_arm") or assignment.get("arm"),
                "experiment_assignment": assignment,
                "research_eligible": metadata.get("research_eligible"),
                "counts_toward_activation": metadata.get("counts_toward_activation"),
                "participation_mode": metadata.get("participation_mode"),
                "task_continuity": metadata.get("task_continuity"),
                "source": metadata.get("source"),
                "posttest": metadata.get("posttest"),
                "posttest_probe_id": metadata.get("posttest_probe_id"),
                "posttest_due_at": user_data.get("posttest_due_at"),
                "posttest_completed_at": user_data.get("posttest_completed_at"),
                "followup_task_due_at": user_data.get("followup_task_due_at"),
                "referred_by": metadata.get("referred_by") or user_data.get("referred_by"),
                "invite_code": metadata.get("invite_code") or user_data.get("invite_code"),
                "referral_incentive": metadata.get("referral_incentive")
                or user_data.get("referral_incentive"),
                "research_path": metadata.get("research_path"),
                "transcript_length": _transcript_length(metadata),
            },
        }
        lines.append(json.dumps(document, ensure_ascii=False))
    return "\n".join(lines) + ("\n" if lines else "")


async def export_research_csv(redis: Redis, *, anonymize: bool) -> str:
    rows = await _iter_consented_sessions(redis)
    buffer = io.StringIO()
    writer = csv.writer(buffer)
    writer.writerow(
        [
            "session_id",
            "user_id",
            "type",
            "topic",
            "score",
            "duration_minutes",
            "dimensions_json",
            "transcript_length",
            "utm_source",
            "utm_medium",
            "utm_campaign",
            "entry",
            "task_id",
            "entry_channel",
            "product_version",
            "experiment_arm",
            "research_eligible",
            "counts_toward_activation",
            "participation_mode",
            "task_continuity",
            "source",
            "posttest",
            "posttest_probe_id",
            "referred_by",
            "invite_code",
            "referral_incentive",
            "consent_version",
            "started_at",
            "answered_at",
            "viewed_feedback_at",
            "revised",
            "declined_revision_reason",
            "created_at",
            "completed_at",
        ]
    )

    for row in rows:
        user_data = row["user"]
        session = row["session"]
        metadata = session.get("metadata") or {}
        touchpoint = metadata.get("touchpoint") or {}
        consent = user_data.get("research_consent") or {}
        research_path = metadata.get("research_path") or {}
        dimensions = metadata.get("dimensions") or {}
        user_col = _anonymize_user_id(user_data["id"]) if anonymize else user_data["id"]

        writer.writerow(
            [
                session.get("id"),
                user_col,
                session.get("type"),
                session.get("topic"),
                session.get("score"),
                session.get("duration_minutes"),
                json.dumps(dimensions, ensure_ascii=False),
                _transcript_length(metadata),
                touchpoint.get("utm_source"),
                touchpoint.get("utm_medium"),
                touchpoint.get("utm_campaign"),
                touchpoint.get("entry"),
                metadata.get("task_id") or touchpoint.get("task_id"),
                metadata.get("entry_channel"),
                metadata.get("product_version"),
                metadata.get("experiment_arm"),
                metadata.get("research_eligible"),
                metadata.get("counts_toward_activation"),
                metadata.get("participation_mode"),
                metadata.get("task_continuity"),
                metadata.get("source"),
                metadata.get("posttest"),
                metadata.get("posttest_probe_id"),
                metadata.get("referred_by") or user_data.get("referred_by"),
                metadata.get("invite_code") or user_data.get("invite_code"),
                metadata.get("referral_incentive") or user_data.get("referral_incentive"),
                consent.get("version"),
                research_path.get("started_at"),
                research_path.get("answered_at"),
                research_path.get("viewed_feedback_at"),
                research_path.get("revised"),
                research_path.get("declined_revision_reason"),
                session.get("created_at"),
                session.get("completed_at"),
            ]
        )

    return buffer.getvalue()
