"""Rule-based scoring for candidate reverse questions at end of round."""

from __future__ import annotations

import re
from typing import Any

CATEGORY_PATTERNS: dict[str, list[re.Pattern[str]]] = {
    "strategic_pain_point": [
        re.compile(r"业务痛点|最大的痛点|核心卡点|AI\s*落地|商业化挑战|技术瓶颈|战略重心|护城河", re.IGNORECASE)
    ],
    "superficial_perk": [
        re.compile(r"几点下班|准点下班|几点打卡|食堂|下午茶|班车")
    ],
    "role": [re.compile(r"职责|考核|KPI|目标|90天|试用期")],
    "team": [re.compile(r"团队|汇报|协作|规模|架构|导师")],
    "growth": [re.compile(r"成长|晋升|培训|学习|发展路径")],
    "culture": [re.compile(r"文化|氛围|加班|弹性|价值观")],
    "process": [re.compile(r"流程|决策|迭代|评审|制度")],
    "compensation": [re.compile(r"薪酬|薪资|奖金|期权|package|福利")],
}

CATEGORY_LABELS: dict[str, str] = {
    "strategic_pain_point": "强加分项 · 业务痛点与战略思考",
    "superficial_perk": "减分项 · 琐碎考勤作息提问",
    "role": "加分项 · 岗位职责与90天目标",
    "team": "加分项 · 团队架构与协作模式",
    "growth": "常规项 · 培养与成长路径",
    "process": "加分项 · 研发与业务决策流程",
    "culture": "常规项 · 团队文化与工作节奏",
    "compensation": "常规项 · 薪酬福利制度",
    "general": "常规反问",
    "uncategorized": "未提问",
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
        return {"category": "uncategorized", "label": CATEGORY_LABELS["uncategorized"], "score": None}

    category = classify_reverse_question(stripped)
    if category == "superficial_perk":
        return {
            "category": category,
            "label": CATEGORY_LABELS[category],
            "score": 38.0,
            "verdict": "penalty",
            "comment": "问“公司几点下班/食堂伙食”在业务单面中易暴露好奇心不足，属于典型减分项。",
        }

    score = 55
    if len(stripped) >= 8:
        score += 10
    if len(stripped) >= 20:
        score += 10
    if re.search(r"[？?]", stripped):
        score += 8
    if re.search(r"如何|什么|哪些|是否|能否|怎么", stripped):
        score += 7
    if category == "strategic_pain_point":
        score = max(92, min(98, score + 16))
        verdict = "strong_bonus"
        comment = "直击团队 AI 落地与核心业务痛点，展现极强的业务好奇心与Owner意识（隐藏强加分项）。"
    elif category not in ("general", "uncategorized"):
        score = min(100, score + 10)
        verdict = "bonus"
        comment = f"关注「{CATEGORY_LABELS.get(category, category)}」，体现对岗位与团队协作的思考。"
    else:
        score = min(100, score)
        verdict = "neutral"
        comment = "建议进一步聚焦团队当前业务痛点、技术演进或首月考核期望。"

    return {
        "category": category,
        "label": CATEGORY_LABELS.get(category, "常规反问"),
        "score": float(score),
        "verdict": verdict,
        "comment": comment,
    }


def score_reverse_batch(questions: list[str]) -> list[dict[str, Any]]:
    items: list[dict[str, Any]] = []
    for q in questions[:3]:
        text = (q or "").strip()
        if not text:
            continue
        scored = score_reverse_question(text)
        items.append(
            {
                "question": text,
                "category": scored["category"],
                "label": scored.get("label"),
                "verdict": scored.get("verdict"),
                "comment": scored.get("comment"),
                "score": scored["score"],
            }
        )
    return items
