from __future__ import annotations

from typing import Any

import numpy as np
from scipy.stats import chi2_contingency

from app.research.admin_stats.experiment import extract_outcome
from app.research.admin_stats.privacy import bucket_total, suppress_count

PRESETS = {
    "g5_share": ("survey:G5", "auto:share_object_chosen"),
    "g6_incentive": ("survey:G6", "auto:incentive_claimed"),
    "f1_zp": ("survey:F1", "auto:zp_assigned"),
    "c1_zc": ("survey:C1", "auto:zc_realized"),
    "h4_churn": ("survey:H4", "auto:churn_after_interview_date"),
    "j2_blind": ("survey:J2", "auto:blind_score_mean"),
}


def _read_var(row: dict[str, Any], var: str) -> Any:
    if var.startswith("survey:"):
        item = var.split(":", 1)[1]
        rec = (row.get("survey") or {}).get(item)
        if not rec or rec.get("status") != "answered":
            return None
        return rec.get("value")
    if var.startswith("auto:"):
        return (row.get("auto") or {}).get(var.split(":", 1)[1])
    if var.startswith("arm:"):
        return row.get("arm")
    if var.startswith("zc:"):
        return row.get("zc")
    if var.startswith("zp:"):
        return row.get("zp")
    return extract_outcome(row, var)


def crosstab(rows: list[dict[str, Any]], row_var: str, col_var: str) -> dict[str, Any]:
    table: dict[str, dict[str, int]] = {}
    blank = 0
    for row in rows:
        rv = _read_var(row, row_var)
        cv = _read_var(row, col_var)
        if rv is None or cv is None:
            blank += 1
            continue
        rs, cs = str(rv), str(cv)
        table.setdefault(rs, {})
        table[rs][cs] = table[rs].get(cs, 0) + 1
    row_labels = sorted(table.keys())
    col_labels = sorted({c for cols in table.values() for c in cols})
    counts: list[list[int | str]] = []
    col_totals = {c: 0 for c in col_labels}
    for rl in row_labels:
        row_counts: list[int | str] = []
        for cl in col_labels:
            n = table.get(rl, {}).get(cl, 0)
            col_totals[cl] += n
            row_counts.append(suppress_count(n) if n else 0)
        counts.append(row_counts)
    col_pct: list[list[float | None]] = []
    for rl in row_labels:
        pct_row: list[float | None] = []
        for cl in col_labels:
            n = table.get(rl, {}).get(cl, 0)
            total = col_totals[cl]
            if total < 5 or n < 5:
                pct_row.append(None)
            else:
                pct_row.append(n / total)
        col_pct.append(pct_row)
    test: dict[str, Any] = {}
    if row_labels and col_labels:
        raw = np.array([[table.get(rl, {}).get(cl, 0) for cl in col_labels] for rl in row_labels])
        if raw.sum() >= 5 and raw.min() >= 1:
            chi2, p, _, _ = chi2_contingency(raw)
            n = raw.sum()
            k = min(raw.shape) - 1
            cramers = float(np.sqrt(chi2 / (n * k))) if k > 0 else None
            test = {"chi2": float(chi2), "p_value": float(p), "cramers_v": cramers, "exploratory": True}
    return {
        "row_var": row_var,
        "col_var": col_var,
        "row_labels": row_labels,
        "col_labels": col_labels,
        "counts": counts,
        "col_percent": col_pct,
        "blank_skipped": blank,
        "col_totals": {c: bucket_total(col_totals[c]) for c in col_labels},
    }


def preset_agreement(rows: list[dict[str, Any]], preset: str) -> dict[str, Any]:
    if preset not in PRESETS:
        return {"error": "unknown_preset"}
    row_var, col_var = PRESETS[preset]
    pairs: list[tuple[str, str]] = []
    for row in rows:
        a = _read_var(row, row_var)
        b = _read_var(row, col_var)
        if a is None or b is None:
            continue
        pairs.append((str(a), str(b)))
    if not pairs:
        return {"preset": preset, "n": 0, "matrix": {}}
    agree = sum(1 for a, b in pairs if a == b)
    n = len(pairs)
    matrix: dict[str, dict[str, int]] = {}
    for a, b in pairs:
        matrix.setdefault(a, {})
        matrix[a][b] = matrix[a].get(b, 0) + 1
    return {
        "preset": preset,
        "n": suppress_count(n),
        "agreement_rate": agree / n if n >= 5 else None,
        "matrix": matrix,
        "note": "两者不一致是研究发现，不是数据错误",
    }
