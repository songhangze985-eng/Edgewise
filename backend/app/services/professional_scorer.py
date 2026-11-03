"""Rule-based scoring for professional (closed) interview questions."""

from __future__ import annotations

import re

LOW_EFFORT = [
    re.compile(r"^好的?[。.!]?$"),
    re.compile(r"^不知道[。.!]?$"),
    re.compile(r"^pass$", re.I),
]


def score_professional_answer(answer_text: str) -> tuple[float, str]:
    trimmed = (answer_text or "").strip()
    if not trimmed:
        return 0.0, "未作答或内容为空"
    if len(trimmed) < 20 or any(p.match(trimmed) for p in LOW_EFFORT):
        cap = min(20, max(5, len(trimmed) // 2 + 5)) if trimmed else 0
        return float(cap), f"回答过短（{len(trimmed)} 字）"

    score = 55.0
    if len(trimmed) >= 40:
        score += 8
    if len(trimmed) >= 80:
        score += 8
    if len(trimmed) >= 120:
        score += 6
    if re.search(r"因为|所以|首先|其次|最后|例如|比如|结果|STAR", trimmed, re.I):
        score += 10
    if re.search(r"\d+%|\d+万|\d+人|项目|团队|负责|推动", trimmed):
        score += 8
    score = min(92.0, max(40.0, score))
    return score, "评分为规则估算，仅供参考"
