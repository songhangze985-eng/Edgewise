from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Any

from redis.asyncio import Redis

from app.core.redis_client import get_json
from app.research.admin_stats.filters import StatsFilters, row_matches_filters
from app.research.admin_stats.privacy import user_hash
from app.research.events import read_event_stream
from app.research.keys import (
    RULE_VERSION,
    SURVEY_ITEMS_VERSION,
    auto_hash_key,
    auto_meta_key,
    survey_hash_key,
    survey_queue_key,
    survey_shown_key,
    survey_state_key,
)
from app.research.survey_engine import load_survey_items


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

TRIGGER_ROWS = [
    ("consent_granted", "① 同意后前测"),
    ("feedback_view_first", "② 首次反馈"),
    ("report_view_first", "③ 报告页"),
    ("report_dwell_or_reopen", "④ 报告深度"),
    ("second_session_complete", "⑤ 第二次练习"),
    ("channel_creator_video", "⑥ 创作者/视频"),
    ("channel_agent", "⑦ 智能体"),
    ("institution", "⑧ 机构"),
    ("posttest_day7", "⑨ 7日后测"),
]


def _parse_json_val(raw: Any) -> Any:
    if raw is None:
        return None
    if isinstance(raw, (dict, list, int, float, bool)):
        return raw
    try:
        return json.loads(raw)
    except (json.JSONDecodeError, TypeError):
        return raw


async def load_cohort(redis: Redis, filters: StatsFilters) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    user_ids = list(await redis.smembers("users:all"))
    items_by_trigger: dict[str, list[str]] = {}
    for item in load_survey_items():
        items_by_trigger.setdefault(item.get("trigger", ""), []).append(item["id"])
    item_defs = {item["id"]: item for item in load_survey_items()}

    rows: list[dict[str, Any]] = []
    consented_total = 0
    registered = len(user_ids)

    for user_id in user_ids:
        user_data = await get_json(redis, f"user:{user_id}") or {}
        consent = user_data.get("research_consent") or {}
        if not consent.get("accepted") or consent.get("withdrawn_at"):
            continue
        consented_total += 1

        assignment = user_data.get("experiment_assignment") or {}
        arm = assignment.get("arm") or "00"
        auto_raw = await redis.hgetall(auto_hash_key(user_id))
        auto: dict[str, Any] = {k: _parse_json_val(v) for k, v in auto_raw.items()}
        meta_raw = await redis.hgetall(auto_meta_key(user_id))
        rule_version = RULE_VERSION
        if meta_raw:
            first = next(iter(meta_raw.values()), None)
            try:
                parsed_meta = json.loads(first) if first else {}
                rule_version = parsed_meta.get("rule_version") or rule_version
            except json.JSONDecodeError:
                pass

        survey_raw = await redis.hgetall(survey_hash_key(user_id))
        survey: dict[str, Any] = {}
        for key, val in survey_raw.items():
            survey[key] = _parse_json_val(val)

        state_raw = await redis.hgetall(survey_state_key(user_id))
        state: dict[str, Any] = {k: _parse_json_val(v) for k, v in state_raw.items()}

        row: dict[str, Any] = {
            "user_id": user_id,
            "user_hash": user_hash(user_id),
            "arm": arm,
            "zc": int(arm[0]) if len(arm) >= 2 else 0,
            "zp": int(arm[1]) if len(arm) >= 2 else 0,
            "consent_at": consent.get("accepted_at"),
            "entry_channel": auto.get("entry_channel") or auto.get("B1"),
            "institution_id": auto.get("institution_id"),
            "rule_version": rule_version,
            "survey_version": SURVEY_ITEMS_VERSION,
            "auto": auto,
            "survey": survey,
            "state": state,
            "posttest_due_at": user_data.get("posttest_due_at"),
            "posttest_completed_at": user_data.get("posttest_completed_at"),
            "created_at": user_data.get("created_at"),
        }
        if row_matches_filters(row, filters):
            rows.append(row)

    meta = {
        "registered_users": registered,
        "consented_total": consented_total,
        "filtered_n": len(rows),
        "trigger_item_map": items_by_trigger,
        "item_defs": item_defs,
    }
    return rows, meta


def cohort_to_dataframe(rows: list[dict[str, Any]]):
    import pandas as pd

    if not rows:
        return pd.DataFrame()
    flat = []
    for row in rows:
        base = {k: row[k] for k in ("user_hash", "arm", "zc", "zp", "consent_at", "entry_channel", "institution_id")}
        base.update({f"auto.{k}": v for k, v in (row.get("auto") or {}).items()})
        flat.append(base)
    return pd.DataFrame(flat)


async def load_user_timeline(redis: Redis, user_id: str) -> list[dict[str, Any]]:
    events = await read_event_stream(redis, user_id, count=500)
    timeline: list[dict[str, Any]] = []
    for entry in events:
        timeline.append(
            {
                "ts": entry.get("ts"),
                "source": "event",
                "name": entry.get("event"),
                "props": entry.get("props") or {},
                "id": entry.get("id"),
            }
        )
    survey_raw = await redis.hgetall(survey_hash_key(user_id))
    for item_id, raw in survey_raw.items():
        rec = _parse_json_val(raw)
        if not isinstance(rec, dict):
            continue
        timeline.append(
            {
                "ts": rec.get("answered_at") or rec.get("skipped_at"),
                "source": "survey",
                "name": "survey.answer" if rec.get("status") == "answered" else f"survey.{rec.get('status')}",
                "props": {"item_id": item_id, "value": rec.get("value")},
                "id": item_id,
            }
        )
    timeline.sort(key=lambda x: x.get("ts") or "")
    return timeline


async def trigger_stats_for_user(
    redis: Redis,
    user_id: str,
    trigger: str,
    item_ids: list[str],
    item_defs: dict[str, Any],
    auto: dict[str, Any],
    state: dict[str, Any],
) -> dict[str, int]:
    eligible = 1
    for item_id in item_ids:
        definition = item_defs.get(item_id)
        if definition and not _condition_matches(definition.get("condition"), auto, state):
            eligible = 0
            break
    queued = await redis.zscore(survey_queue_key(user_id), item_ids[0]) if item_ids else None
    triggered = 1 if queued is not None else 0
    shown = int(await redis.zcard(survey_shown_key(user_id))) > 0
    answered = skipped = declined = 0
    for item_id in item_ids:
        rec = await redis.hget(survey_hash_key(user_id), item_id)
        if not rec:
            continue
        parsed = _parse_json_val(rec)
        if not isinstance(parsed, dict):
            continue
        status = parsed.get("status")
        if status == "answered":
            answered += 1
        elif status == "declined":
            declined += 1
        elif status in ("skipped", "no_response"):
            skipped += 1
    return {
        "eligible": eligible,
        "triggered": triggered if eligible else 0,
        "shown": 1 if shown and eligible else 0,
        "answered": answered,
        "skipped": skipped,
        "declined": declined,
    }


def aggregate_trigger_rows(rows: list[dict[str, Any]], meta: dict[str, Any]) -> list[dict[str, Any]]:
    items_by_trigger = meta.get("trigger_item_map") or {}
    item_defs = meta.get("item_defs") or {}
    out: list[dict[str, Any]] = []
    for trigger, label in TRIGGER_ROWS:
        item_ids = items_by_trigger.get(trigger, [])
        totals = {"eligible": 0, "triggered": 0, "shown": 0, "answered": 0, "skipped": 0, "declined": 0}
        for row in rows:
            auto = row.get("auto") or {}
            state = row.get("state") or {}
            eligible = 1
            for item_id in item_ids:
                definition = item_defs.get(item_id)
                if definition and not _condition_matches(definition.get("condition"), auto, state):
                    eligible = 0
                    break
            if not eligible:
                continue
            totals["eligible"] += 1
            survey = row.get("survey") or {}
            any_answered = any(
                survey.get(i, {}).get("status") == "answered" for i in item_ids if isinstance(survey.get(i), dict)
            )
            any_declined = any(
                survey.get(i, {}).get("status") == "declined" for i in item_ids if isinstance(survey.get(i), dict)
            )
            any_skipped = any(
                survey.get(i, {}).get("status") in ("skipped", "no_response")
                for i in item_ids
                if isinstance(survey.get(i), dict)
            )
            if any_answered:
                totals["answered"] += 1
            if any_declined:
                totals["declined"] += 1
            if any_skipped:
                totals["skipped"] += 1
            if any_answered or any_skipped or any_declined:
                totals["shown"] += 1
                totals["triggered"] += 1
            elif item_ids:
                totals["triggered"] += 1
        trigger_rate = totals["shown"] / totals["triggered"] if totals["triggered"] else None
        response_rate = totals["answered"] / totals["shown"] if totals["shown"] else None
        out.append(
            {
                "trigger": trigger,
                "label": label,
                **totals,
                "trigger_reach_rate": trigger_rate,
                "display_response_rate": response_rate,
            }
        )
    return out


def posttest_grid(rows: list[dict[str, Any]]) -> dict[str, Any]:
    cells: dict[str, dict[str, Any]] = {}
    now = datetime.now(timezone.utc)
    for row in rows:
        arm = row.get("arm") or "00"
        due = row.get("posttest_due_at")
        if not due:
            continue
        try:
            due_dt = datetime.fromisoformat(due.replace("Z", "+00:00"))
        except ValueError:
            continue
        if due_dt > now:
            continue
        cell = cells.setdefault(arm, {"due": 0, "done": 0, "no_response": 0, "tech_fail": 0, "refused": 0})
        cell["due"] += 1
        auto = row.get("auto") or {}
        status = auto.get("posttest_status") or auto.get("J1")
        completed = row.get("posttest_completed_at") or status == "done"
        if completed:
            cell["done"] += 1
        else:
            cell["no_response"] += 1
    formatted: dict[str, Any] = {}
    for arm, cell in cells.items():
        due = cell["due"]
        done = cell["done"]
        formatted[arm] = {
            "due_n": due,
            "done_n": done,
            "completion_rate": done / due if due else None,
            "attrition_n": due - done,
            "no_response": cell["no_response"],
            "tech_fail": cell["tech_fail"],
            "refused": cell["refused"],
        }
    return formatted
