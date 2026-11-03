"""Personality forced-choice consistency (no «correct» answers exposed)."""

from __future__ import annotations

from typing import Any

LOW_CONSISTENCY_THRESHOLD = 0.67

LOW_CONSISTENCY_TIP = (
    "部分迫选题的选择前后不太一致。正式测评时建议按第一反应作答，"
    "并避免在相似表述的题目上反复改口。"
)


def _choice_pole(item_def: dict[str, Any], choice: str | None) -> str | None:
    if choice not in ("A", "B"):
        return None
    if choice == "A":
        return str(item_def.get("a_pole") or "")
    return str(item_def.get("b_pole") or "")


def evaluate_personality_consistency(
    personality_items: list[dict[str, Any]],
    item_defs: list[dict[str, Any]],
) -> dict[str, Any]:
    """Compare poles within each consistency_pair; never returns correct answers."""
    defs_by_id = {d["id"]: d for d in item_defs if d.get("id")}
    pairs: dict[str, list[str]] = {}
    for item in personality_items:
        item_id = item.get("id")
        defn = defs_by_id.get(item_id)
        if not defn:
            continue
        pair_id = defn.get("consistency_pair")
        if not pair_id:
            continue
        pairs.setdefault(str(pair_id), []).append(item_id)

    total_pairs = 0
    consistent_pairs = 0
    for _pair_id, item_ids in pairs.items():
        if len(item_ids) < 2:
            continue
        poles: list[str | None] = []
        for iid in item_ids[:2]:
            row = next((x for x in personality_items if x.get("id") == iid), None)
            defn = defs_by_id.get(iid)
            if not row or not defn:
                poles.append(None)
                continue
            poles.append(_choice_pole(defn, row.get("choice")))
        if poles[0] is None or poles[1] is None:
            continue
        total_pairs += 1
        if poles[0] == poles[1]:
            consistent_pairs += 1

    if total_pairs == 0:
        score = 1.0
    else:
        score = consistent_pairs / total_pairs

    low = score < LOW_CONSISTENCY_THRESHOLD
    return {
        "consistency_score": round(score, 3),
        "pair_count": total_pairs,
        "consistent_pair_count": consistent_pairs,
        "low_consistency": low,
        "tip": LOW_CONSISTENCY_TIP if low else None,
    }
