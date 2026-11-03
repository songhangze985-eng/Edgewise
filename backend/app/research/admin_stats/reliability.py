from __future__ import annotations

from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd
import yaml

from app.research.survey_engine import load_survey_items

CONSTRUCTS_PATH = Path(__file__).with_name("constructs.yaml")


def _load_constructs() -> dict[str, Any]:
    with CONSTRUCTS_PATH.open(encoding="utf-8") as handle:
        return yaml.safe_load(handle) or {}


def _reverse_map() -> dict[str, bool]:
    return {item["id"]: bool(item.get("reverse")) for item in load_survey_items()}


def _item_values(row: dict[str, Any], item_id: str, reverse: dict[str, bool]) -> float | None:
    survey = row.get("survey") or {}
    rec = survey.get(item_id)
    if not rec or rec.get("status") != "answered":
        return None
    val = rec.get("value")
    if isinstance(val, dict):
        val = val.get("rating") or val.get("score") or val.get("code")
    try:
        num = float(val)
    except (TypeError, ValueError):
        return None
    if reverse.get(item_id):
        return 8.0 - num
    return num


def cronbach_alpha(matrix: np.ndarray) -> float | None:
    if matrix.shape[0] < 2 or matrix.shape[1] < 2:
        return None
    k = matrix.shape[1]
    item_vars = matrix.var(axis=0, ddof=1)
    total_var = matrix.sum(axis=1).var(ddof=1)
    if total_var == 0:
        return None
    return float(k / (k - 1) * (1 - item_vars.sum() / total_var))


def spearman_brown(matrix: np.ndarray) -> float | None:
    if matrix.shape[1] != 2:
        return None
    r = np.corrcoef(matrix[:, 0], matrix[:, 1])[0, 1]
    if np.isnan(r):
        return None
    return float(2 * r / (1 + r))



def _to_float(v: Any) -> float | None:
    if v is None or v == "":
        return None
    if isinstance(v, bool):
        return float(v)
    if isinstance(v, (int, float)):
        return float(v)
    s = str(v).strip().lower()
    if s in ("revised", "done", "active", "true", "1"):
        return 1.0
    if s in ("none", "rejected_with_reason", "demo", "false", "0"):
        return 0.0
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def compute_reliability(rows: list[dict[str, Any]]) -> dict[str, Any]:
    spec = _load_constructs()
    reverse = _reverse_map()
    constructs_out: list[dict[str, Any]] = []

    for name, cfg in (spec.get("constructs") or {}).items():
        items = cfg.get("items") or []
        rel_type = cfg.get("reliability", "alpha")
        matrix_rows: list[list[float]] = []
        for row in rows:
            vals = [_item_values(row, item_id, reverse) for item_id in items]
            if any(v is None for v in vals):
                continue
            matrix_rows.append(vals)
        n_complete = len(matrix_rows)
        entry: dict[str, Any] = {
            "id": name,
            "items": items,
            "complete_n": n_complete,
            "cross_time": bool(cfg.get("cross_time")),
        }
        if n_complete < 30:
            entry["status"] = "insufficient"
            constructs_out.append(entry)
            continue
        mat = np.array(matrix_rows, dtype=float)
        if rel_type == "spearman_brown":
            alpha = spearman_brown(mat)
            entry["metric"] = "spearman_brown"
        else:
            alpha = cronbach_alpha(mat)
            entry["metric"] = "alpha"
        entry["value"] = alpha
        entry["status"] = "ok"
        if alpha is not None:
            if alpha < 0.6:
                entry["warning"] = "low"
            elif alpha < 0.7:
                entry["warning"] = "marginal"
        drop_alphas: dict[str, float | None] = {}
        item_total: dict[str, float | None] = {}
        if rel_type != "spearman_brown" and mat.shape[1] >= 3:
            for idx, item_id in enumerate(items):
                reduced = np.delete(mat, idx, axis=1)
                drop_alphas[item_id] = cronbach_alpha(reduced)
                total = mat.sum(axis=1)
                item_total[item_id] = float(np.corrcoef(mat[:, idx], total - mat[:, idx])[0, 1])
        entry["drop_item_alpha"] = drop_alphas
        entry["item_total_correlation"] = item_total
        constructs_out.append(entry)

    behavior: list[dict[str, Any]] = []
    for name, cfg in (spec.get("behavior_indices") or {}).items():
        fields = cfg.get("fields") or []
        frame: dict[str, list[float]] = {f: [] for f in fields}
        for row in rows:
            auto = row.get("auto") or {}
            vals = []
            for field in fields:
                v = auto.get(field)
                num_v = _to_float(v)
                if num_v is None:
                    vals = []
                    break
                vals.append(num_v)
            if len(vals) == len(fields):
                for field, val in zip(fields, vals):
                    frame[field].append(val)
        if not frame[fields[0]]:
            behavior.append({"id": name, "fields": fields, "status": "empty"})
            continue
        df = pd.DataFrame(frame)
        corr = df.corr(method="pearson").replace({np.nan: None}).to_dict()
        behavior.append({"id": name, "fields": fields, "correlation": corr, "n": len(df)})

    return {"constructs": constructs_out, "behavior_indices": behavior}
