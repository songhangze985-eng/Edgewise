from __future__ import annotations

from typing import Any

import numpy as np

from app.research.admin_stats.privacy import SMALL_N, suppress_count


def _cell_key(zc: int, zp: int) -> str:
    return f"{zc}{zp}"


def extract_outcome(row: dict[str, Any], field: str) -> float | None:
    if field.startswith("survey:"):
        item_id = field.split(":", 1)[1]
        rec = (row.get("survey") or {}).get(item_id)
        if not rec or rec.get("status") != "answered":
            return None
        try:
            return float(rec.get("value"))
        except (TypeError, ValueError):
            return None
    auto = row.get("auto") or {}
    val = auto.get(field)
    if val is None:
        return None
    if isinstance(val, bool):
        return float(val)
    if isinstance(val, (int, float)):
        return float(val)
    if val in ("done", "1", 1):
        return 1.0
    if val in ("0", 0, "none"):
        return 0.0
    try:
        return float(val)
    except (TypeError, ValueError):
        return None


def four_cell_means(rows: list[dict[str, Any]], field: str) -> dict[str, Any]:
    cells: dict[str, list[float]] = {"00": [], "01": [], "10": [], "11": []}
    missing = {"00": 0, "01": 0, "10": 0, "11": 0}
    for row in rows:
        arm = row.get("arm") or "00"
        if arm not in cells:
            continue
        val = extract_outcome(row, field)
        if val is None:
            missing[arm] += 1
        else:
            cells[arm].append(val)
    result: dict[str, Any] = {"cells": {}, "missing": {}, "field": field}
    for arm, vals in cells.items():
        n = len(vals)
        result["cells"][arm] = {
            "n": suppress_count(n),
            "mean": float(np.mean(vals)) if n else None,
        }
        result["missing"][arm] = suppress_count(missing[arm])
    return result


def effect_estimates(means: dict[str, float | None]) -> dict[str, float | None]:
    m = means

    def g(a: str) -> float | None:
        return m.get(a)

    zc = None
    if all(g(k) is not None for k in ("00", "01", "10", "11")):
        zc = ((g("10") + g("11")) - (g("00") + g("01"))) / 2  # type: ignore
    zp = None
    if all(g(k) is not None for k in ("00", "01", "10", "11")):
        zp = ((g("01") + g("11")) - (g("00") + g("10"))) / 2  # type: ignore
    interaction = None
    if all(g(k) is not None for k in ("00", "01", "10", "11")):
        interaction = g("11") - g("10") - g("01") + g("00")  # type: ignore
    return {"zc_main": zc, "zp_main": zp, "delta_cp": interaction}


def bootstrap_effects(
    rows: list[dict[str, Any]],
    field: str,
    *,
    n_boot: int = 2000,
    seed: int = 20261103,
) -> dict[str, Any]:
    rng = np.random.default_rng(seed)
    buckets: dict[str, list[float]] = {"00": [], "01": [], "10": [], "11": []}
    for row in rows:
        arm = row.get("arm") or "00"
        val = extract_outcome(row, field)
        if val is not None and arm in buckets:
            buckets[arm].append(val)
    if any(len(v) < SMALL_N for v in buckets.values()):
        return {"status": "suppressed", "reason": "cell_n_below_5"}
    zc_samples: list[float] = []
    zp_samples: list[float] = []
    cp_samples: list[float] = []
    for _ in range(n_boot):
        sample_means: dict[str, float] = {}
        for arm, vals in buckets.items():
            draw = rng.choice(vals, size=len(vals), replace=True)
            sample_means[arm] = float(np.mean(draw))
        zc_samples.append(((sample_means["10"] + sample_means["11"]) - (sample_means["00"] + sample_means["01"])) / 2)
        zp_samples.append(((sample_means["01"] + sample_means["11"]) - (sample_means["00"] + sample_means["10"])) / 2
        cp_samples.append(
            sample_means["11"] - sample_means["10"] - sample_means["01"] + sample_means["00"]
        )

    def interval(samples: list[float]) -> dict[str, float]:
        low, high = np.percentile(samples, [2.5, 97.5])
        return {"low": float(low), "high": float(high), "point": float(np.mean(samples))}

    unstable = any(len(v) < 30 for v in buckets.values())
    return {
        "status": "ok",
        "seed": seed,
        "unstable": unstable,
        "zc_main": interval(zc_samples),
        "zp_main": interval(zp_samples),
        "delta_cp": interval(cp_samples),
    }


def manipulation_checks(rows: list[dict[str, Any]]) -> dict[str, Any]:
    zc_pass = {"continuous": 0, "continuous_n": 0, "standard": 0, "standard_n": 0}
    zp_pass = {"active": 0, "active_n": 0, "demo": 0, "demo_n": 0, "other": 0}
    for row in rows:
        arm = row.get("arm") or "00"
        zc = int(arm[0])
        zp = int(arm[1])
        c1 = (row.get("survey") or {}).get("C1")
        if c1 and c1.get("status") == "answered":
            try:
                score = float(c1.get("value"))
            except (TypeError, ValueError):
                score = None
            if score is not None:
                if zc == 1:
                    zc_pass["continuous_n"] += 1
                    if score >= 5:
                        zc_pass["continuous"] += 1
                else:
                    zc_pass["standard_n"] += 1
                    if score <= 3:
                        zc_pass["standard"] += 1
        f1 = (row.get("survey") or {}).get("F1")
        if f1 and f1.get("status") == "answered":
            val = str(f1.get("value") or "")
            if zp == 1:
                zp_pass["active_n"] += 1
                if "自己作答" in val or val == "active":
                    zp_pass["active"] += 1
            else:
                zp_pass["demo_n"] += 1
                if "示范" in val or val == "demo":
                    zp_pass["demo"] += 1
            if "两者" in val or "不记得" in val:
                zp_pass["other"] += 1
    auto_zc = sum(1 for r in rows if (r.get("auto") or {}).get("zc_realized") == 1)
    return {"zc_c1": zc_pass, "zp_f1": zp_pass, "zc_realized_n": auto_zc}


def balance_distributions(rows: list[dict[str, Any]]) -> dict[str, Any]:
    arms = {"00": [], "01": [], "10": [], "11": []}
    for row in rows:
        arm = row.get("arm") or "00"
        if arm in arms:
            arms[arm].append(row)
    out: dict[str, Any] = {}
    for arm, subset in arms.items():
        channels: dict[str, int] = {}
        for r in subset:
            ch = r.get("entry_channel") or "unknown"
            channels[ch] = channels.get(ch, 0) + 1
        out[arm] = {
            "n": len(subset),
            "channels": channels,
            "consent_dates": [r.get("consent_at") for r in subset if r.get("consent_at")],
        }
    return out
