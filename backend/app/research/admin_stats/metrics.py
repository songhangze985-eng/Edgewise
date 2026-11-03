from __future__ import annotations

from collections import Counter, defaultdict
from datetime import datetime, timezone
from typing import Any

import numpy as np

from app.research.admin_stats.loader import aggregate_trigger_rows, posttest_grid
from app.research.admin_stats.privacy import suppress_count, suppress_rate, wilson_interval
from app.research.survey_engine import load_survey_items

BINARY_AUTO_FIELDS = {
    "qualified_activation",
    "agent_opt_out",
    "answered_before_feedback",
    "feedback_viewed",
    "zc_realized",
}

CATEGORICAL_AUTO = {
    "entry_channel",
    "revision_action",
    "share_object_chosen",
    "incentive_claimed",
    "B1",
}

COUNT_AUTO = {
    "steps_to_first_answer",
    "revision_count",
    "invites_sent",
    "entry_reselect_count",
    "agent_repeat_explain",
    "return_sessions_7d",
    "variant_followups_done",
}

DURATION_AUTO = {
    "time_to_first_answer_sec",
    "passive_time_ratio",
}

MONEY_AUTO = {"referral_net_contribution"}


def _consent_denominator_rows(all_user_meta: dict[str, Any], rows: list[dict[str, Any]]) -> dict[str, Any]:
    registered = all_user_meta.get("registered_users", 0)
    consented = all_user_meta.get("consented_total", 0)
    withdrawn = max(0, consented - len([r for r in rows if not r.get("withdrawn")]))
    return {"registered": registered, "consented": consented}


def compute_overview(rows: list[dict[str, Any]], meta: dict[str, Any]) -> dict[str, Any]:
    registered = meta.get("registered_users", 0)
    consented_total = meta.get("consented_total", 0)
    filtered = len(rows)

    consent_seen = consented_total  # users with accepted consent in cohort definition
    withdrawn = 0  # already excluded from rows

    first_answer = sum(
        1
        for r in rows
        if (r.get("auto") or {}).get("answered_before_feedback") == 1
        or (r.get("auto") or {}).get("F2a") == 1
    )
    feedback = sum(1 for r in rows if (r.get("auto") or {}).get("feedback_viewed") == 1)
    qualified = sum(1 for r in rows if (r.get("auto") or {}).get("qualified_activation") == 1)

    now = datetime.now(timezone.utc)
    due_users = []
    posttest_done = 0
    for r in rows:
        due = r.get("posttest_due_at")
        if not due:
            continue
        try:
            due_dt = datetime.fromisoformat(due.replace("Z", "+00:00"))
        except ValueError:
            continue
        if due_dt <= now:
            due_users.append(r)
            if r.get("posttest_completed_at") or (r.get("auto") or {}).get("posttest_status") == "done":
                posttest_done += 1

    survey_shown = 0
    survey_answered = 0
    survey_skipped = 0
    for r in rows:
        survey = r.get("survey") or {}
        for rec in survey.values():
            if not isinstance(rec, dict):
                continue
            st = rec.get("status")
            if st == "answered":
                survey_answered += 1
                survey_shown += 1
            elif st in ("skipped", "no_response", "declined"):
                survey_skipped += 1
                survey_shown += 1

    funnel = [
        {"step": "同意研究", "n": filtered, "pct_of_consent": 1.0 if filtered else None},
        {
            "step": "完成首次作答",
            "n": first_answer,
            "pct_of_consent": first_answer / filtered if filtered else None,
        },
        {
            "step": "查看反馈",
            "n": feedback,
            "pct_of_consent": feedback / filtered if filtered else None,
        },
        {
            "step": "合格激活",
            "n": qualified,
            "pct_of_consent": qualified / filtered if filtered else None,
        },
        {
            "step": "7日后测完成",
            "n": posttest_done,
            "pct_of_consent": posttest_done / len(due_users) if due_users else None,
            "denominator_note": "已满7天到期用户",
        },
    ]

    kpis = {
        "registered_users": registered,
        "consent_rate": {
            "rate": consent_seen / registered if registered else None,
            "numerator": consent_seen,
            "denominator": registered,
            "withdrawn": withdrawn,
        },
        "qualified_activation_itt": {
            "rate": qualified / filtered if filtered else None,
            "numerator": qualified,
            "denominator": filtered,
        },
        "posttest_7d_rate": {
            "rate": posttest_done / len(due_users) if due_users else None,
            "numerator": posttest_done,
            "denominator": len(due_users),
            "attrition_rate": 1 - (posttest_done / len(due_users)) if due_users else None,
        },
        "micro_survey_response": {
            "rate": survey_answered / survey_shown if survey_shown else None,
            "numerator": survey_answered,
            "denominator": survey_shown,
            "skip_rate": survey_skipped / survey_shown if survey_shown else None,
        },
    }

    daily: dict[str, dict[str, int]] = defaultdict(lambda: {"consent": 0, "answers": 0, "posttest": 0})
    for r in rows:
        ca = r.get("consent_at")
        if ca:
            day = ca[:10]
            daily[day]["consent"] += 1
        if r.get("posttest_completed_at"):
            daily[r["posttest_completed_at"][:10]]["posttest"] += 1
        for rec in (r.get("survey") or {}).values():
            if isinstance(rec, dict) and rec.get("status") == "answered" and rec.get("answered_at"):
                daily[rec["answered_at"][:10]]["answers"] += 1

    trend = [{"date": d, **vals} for d, vals in sorted(daily.items())]

    return {
        "filtered_n": filtered,
        "consented_total": consented_total,
        "kpis": kpis,
        "funnel": funnel,
        "posttest_grid": posttest_grid(rows),
        "trigger_table": aggregate_trigger_rows(rows, meta),
        "daily_trend": trend,
    }


def _histogram(values: list[float], bins: int = 8) -> list[dict[str, Any]]:
    if not values:
        return []
    counts, edges = np.histogram(values, bins=bins)
    return [{"from": float(edges[i]), "to": float(edges[i + 1]), "count": int(counts[i])} for i in range(len(counts))]


def compute_passive(rows: list[dict[str, Any]]) -> dict[str, Any]:
    fields_out: dict[str, Any] = {}
    for field in sorted(
        BINARY_AUTO_FIELDS | CATEGORICAL_AUTO | COUNT_AUTO | DURATION_AUTO | MONEY_AUTO
        | set(k for r in rows for k in (r.get("auto") or {}).keys())
    ):
        values = []
        nulls = 0
        for r in rows:
            v = (r.get("auto") or {}).get(field)
            if v is None or v == "":
                nulls += 1
            else:
                values.append(v)
        n_eligible = len(rows)
        missing_rate = nulls / n_eligible if n_eligible else None
        entry: dict[str, Any] = {"field": field, "n_eligible": n_eligible, "missing_rate": missing_rate}

        if field in BINARY_AUTO_FIELDS or (values and all(v in (0, 1, True, False, "0", "1") for v in values)):
            ones = sum(1 for v in values if v in (1, True, "1"))
            trials = len(values)
            rate = ones / trials if trials else None
            lo, hi = wilson_interval(ones, trials)
            entry["type"] = "binary"
            entry["positives"] = suppress_count(ones)
            entry["trials"] = suppress_count(trials)
            entry["rate"] = suppress_rate(ones, trials, rate)
            entry["wilson_low"] = lo
            entry["wilson_high"] = hi
        elif field in CATEGORICAL_AUTO or (values and all(isinstance(v, str) for v in values)):
            counter = Counter(str(v) for v in values)
            entry["type"] = "categorical"
            entry["categories"] = [
                {"label": k, "count": suppress_count(v), "pct": v / len(values) if len(values) >= 5 else None}
                for k, v in counter.most_common()
            ]
        elif field in COUNT_AUTO | DURATION_AUTO:
            nums = [float(v) for v in values if isinstance(v, (int, float)) or str(v).replace(".", "").isdigit()]
            entry["type"] = "numeric"
            if nums:
                entry["median"] = float(np.median(nums))
                entry["mean"] = float(np.mean(nums))
                q1, q3 = np.percentile(nums, [25, 75])
                entry["iqr"] = [float(q1), float(q3)]
                entry["histogram"] = _histogram(nums)
        elif field in MONEY_AUTO:
            nums = [float(v) for v in values if isinstance(v, (int, float))]
            entry["type"] = "money"
            entry["total"] = sum(nums)
            entry["mean"] = float(np.mean(nums)) if nums else None
            entry["anomaly_n"] = sum(1 for r in rows if (r.get("auto") or {}).get("referral_anomaly") == 1)
        else:
            entry["type"] = "raw"
            entry["sample_n"] = len(values)
        fields_out[field] = entry
    return {"fields": fields_out}


def _likert_stats(values: list[float]) -> dict[str, Any]:
    if not values:
        return {"n": 0}
    arr = np.array(values)
    dist = Counter(int(v) for v in values if 1 <= v <= 7)
    n = len(values)
    positive = sum(dist.get(i, 0) for i in (5, 6, 7))
    negative = sum(dist.get(i, 0) for i in (1, 2, 3))
    return {
        "n": suppress_count(n),
        "distribution": {str(k): suppress_count(dist[k]) for k in sorted(dist)},
        "median": float(np.median(arr)),
        "mean": round(float(np.mean(arr)), 1),
        "std": round(float(np.std(arr, ddof=1)), 2) if n > 1 else 0,
        "positive_rate": positive / n if n >= 5 else None,
        "negative_rate": negative / n if n >= 5 else None,
    }


def compute_survey_items(rows: list[dict[str, Any]]) -> dict[str, Any]:
    items = load_survey_items()
    reverse_ids = {i["id"] for i in items if i.get("reverse")}
    out: dict[str, Any] = {}
    for item in items:
        item_id = item["id"]
        answered_vals: list[float] = []
        missing = skipped = declined = 0
        for r in rows:
            rec = (r.get("survey") or {}).get(item_id)
            if not rec:
                missing += 1
                continue
            st = rec.get("status")
            if st == "answered":
                try:
                    answered_vals.append(float(rec.get("value")))
                except (TypeError, ValueError):
                    missing += 1
            elif st == "declined":
                declined += 1
            else:
                skipped += 1
        eligible = len(rows) - missing
        entry: dict[str, Any] = {
            "id": item_id,
            "text": item.get("text"),
            "type": item.get("type"),
            "trigger": item.get("trigger"),
            "reverse": item_id in reverse_ids,
            "missing_rate": (skipped + declined) / eligible if eligible else None,
            "skipped": skipped,
            "declined": declined,
        }
        if item.get("type") == "likert7":
            entry["likert"] = _likert_stats(answered_vals)
        elif item.get("type") == "single":
            counter = Counter(str(v) for v in answered_vals)
            opts = item.get("options") or []
            entry["options"] = [
                {"label": opt, "count": suppress_count(counter.get(opt, 0))} for opt in opts
            ]
        out[item_id] = entry
    return {"items": out}


def b3_encoding(rows: list[dict[str, Any]]) -> dict[str, Any]:
    mapping = {
        "找出空白并练习应对追问": "accurate",
        "直接生成完美答案": "distort_perfect_answer",
        "保证提高录用率": "distort_hiring_promise",
        "模拟企业筛选打分": "distort_scoring",
        "不清楚": "unclear",
    }
    counts: Counter[str] = Counter()
    for r in rows:
        rec = (r.get("survey") or {}).get("B3")
        if not rec or rec.get("status") != "answered":
            continue
        label = mapping.get(str(rec.get("value")), "other")
        counts[label] += 1
    answered = sum(counts.values())
    unclear = counts.get("unclear", 0)
    accurate = counts.get("accurate", 0)
    denom_ex = answered - unclear
    return {
        "counts": dict(counts),
        "accuracy_excluding_unclear": accurate / denom_ex if denom_ex >= 5 else None,
        "accuracy_including_unclear": accurate / answered if answered >= 5 else None,
    }
