"""HR round scoring: logic dimensions + cross-answer consistency."""

from __future__ import annotations

import re
from typing import Any

from app.services.logic_scorer import score_logic_answer


def _extract_salary_range(text: str) -> tuple[int | None, int | None]:
    nums = [int(n) for n in re.findall(r"(\d{2,3})\s*[kK]", text or "")]
    nums += [int(n) // 1000 for n in re.findall(r"(\d{4,6})\s*元", text or "")]
    if not nums:
        return None, None
    if len(nums) == 1:
        return nums[0], nums[0]
    return min(nums), max(nums)


def apply_hr_consistency(question: dict[str, Any], session_signals: dict[str, Any]) -> float:
    """Return adjustment in [-8, 8] based on salary/city consistency."""
    theme = question.get("theme") or ""
    answer = str(question.get("answer") or "")
    adj = 0.0

    if theme == "salary_expectation" and answer.strip():
        lo, hi = _extract_salary_range(answer)
        if lo is not None:
            prev = session_signals.get("salary_range_k")
            if prev and isinstance(prev, dict):
                prev_lo, prev_hi = prev.get("lo"), prev.get("hi")
                if prev_lo is not None and abs(lo - prev_lo) > 8:
                    adj -= 6
                elif prev_lo is not None and abs(lo - prev_lo) <= 3:
                    adj += 4
            session_signals["salary_range_k"] = {"lo": lo, "hi": hi or lo}

    if theme == "city" and answer.strip():
        cities = re.findall(r"[\u4e00-\u9fff]{2,6}", answer)
        if cities:
            token = cities[0]
            prev_city = session_signals.get("city_token")
            if prev_city and prev_city != token and "不接受" not in answer and "调剂" not in answer:
                adj -= 4
            session_signals["city_token"] = token

    return max(-8.0, min(8.0, adj))


def score_hr_answer(
    answer_text: str,
    *,
    question_title: str,
    keywords: list[str],
    theme: str,
    session_signals: dict[str, Any],
    declined: bool = False,
) -> dict[str, Any]:
    if declined:
        return {
            "score": None,
            "logic_score": None,
            "logic_rule_version": None,
            "declined": True,
            "consistency_adj": 0.0,
        }

    logic = score_logic_answer(answer_text, question_title=question_title, keywords=keywords)
    q_stub = {"theme": theme, "answer": answer_text}
    adj = apply_hr_consistency(q_stub, session_signals)
    total = max(0.0, min(100.0, float(logic["total"]) + adj))
    logic = {**logic, "total": round(total, 1), "consistency_adj": adj}
    return {
        "score": float(logic["total"]),
        "logic_score": logic,
        "logic_rule_version": logic.get("logic_rule_version"),
        "declined": False,
        "consistency_adj": adj,
    }
