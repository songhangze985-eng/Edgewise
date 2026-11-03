"""Rule-based scoring for candidate reverse questions at end of round."""

from __future__ import annotations

import re
from typing import Any

CATEGORY_PATTERNS: dict[str, list[re.Pattern[str]]] = {
    "role": [re.compile(r"职责|考核|KPI|目标|90天|试用期")],
    "team": [re.compile(r"团队|汇报|协作|规模|架构|导师")],
    "growth": [re.compile(r"成长|晋升|培训|学习|发展路径")],
    "culture": [re.compile(r"文化|氛围|加班|弹性|价值观")],
    "process": [re.compile(r"流程|决策|迭代|评审|制度")],
    "compensation": [re.compile(r"薪酬|薪资|奖金|期权|package|福利")],
}


def classify_reverse_question(text: str) -> str:
    stripped = (text or "").strip()
    if not stripped:
        return "uncategorized"
    for category, patterns in CATEGORY_PATTERNS.items():
        if any(p.search(stripped) for p in patterns):
            return category
    return "general"


def score_reverse_question(text: str) -> dict[str, Any]:
    stripped = (text or "").strip()
    if not stripped:
        return {"category": "uncategorized", "score": None}

    category = classify_reverse_question(stripped)
    score = 55
    if len(stripped) >= 8:
        score += 10
    if len(stripped) >= 20:
        score += 10
    if re.search(r"[？?]", stripped):
        score += 8
    if re.search(r"如何|什么|哪些|是否|能否", stripped):
        score += 7
    if category != "general" and category != "uncategorized":
        score += 10
    score = min(100, score)

    return {"category": category, "score": float(score)}


def score_reverse_batch(questions: list[str]) -> list[dict[str, Any]]:
    items: list[dict[str, Any]] = []
    for q in questions[:3]:
        text = (q or "").strip()
        if not text:
            continue
        scored = score_reverse_question(text)
        items.append({"question": text, "category": scored["category"], "score": scored["score"]})
    return items
