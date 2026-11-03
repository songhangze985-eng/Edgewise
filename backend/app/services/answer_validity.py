"""Shared answer validity checks for rule-based interview scoring."""

from __future__ import annotations

import re

LOW_EFFORT_PATTERNS = [
    re.compile(r"^好的?[。.!]?$"),
    re.compile(r"^不知道[。.!]?$"),
    re.compile(r"^没(?:有)?想法[。.!]?$"),
    re.compile(r"^跳过[。.!]?$"),
    re.compile(r"^pass$", re.I),
]


def assess_answer(answer_text: str, *, stt_failed: bool = False) -> dict[str, str | float | bool | None]:
    """
    Returns answer_valid, invalid_reason, and score.
    score is None for empty answers or STT failure; low numeric cap for filler/short text.
    """
    if stt_failed:
        return {
            "answer_valid": False,
            "invalid_reason": "语音识别失败，未获得有效作答",
            "score": None,
        }

    trimmed = (answer_text or "").strip()
    if not trimmed:
        return {
            "answer_valid": False,
            "invalid_reason": "未作答或内容为空",
            "score": None,
        }

    if any(p.match(trimmed) for p in LOW_EFFORT_PATTERNS):
        cap = min(20, max(5, len(trimmed) // 2 + 5))
        return {
            "answer_valid": False,
            "invalid_reason": "回答过于简略，缺少具体事例或结构",
            "score": float(cap),
        }

    if len(trimmed) < 20:
        cap = min(20, max(5, len(trimmed) // 2 + 5))
        return {
            "answer_valid": False,
            "invalid_reason": f"回答过短（{len(trimmed)} 字，建议至少 20 字）",
            "score": float(cap),
        }

    return {
        "answer_valid": True,
        "invalid_reason": None,
        "score": None,
    }
