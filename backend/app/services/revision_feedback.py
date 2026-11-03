"""Rule-based revision feedback (one gap, cited quote, no ideal rewrite)."""

from __future__ import annotations

import re
from abc import ABC, abstractmethod
from typing import Any

from app.services.logic_scorer import score_logic_answer

OPEN_TYPES = frozenset({"general", "resume_specific"})

PROBE_BY_GAP: dict[str, str] = {
    "contribution": "在这段经历里，你个人具体负责哪一部分、采取了哪些行动？",
    "evidence": "能否补充一个可核查的结果（数字、周期、规模或具体方法）？",
    "structure": "请按「背景 → 你的任务 → 行动 → 结果」简要重述一遍。",
    "causality": "当时的关键决策是什么？因为什么、所以做了什么、最终怎样？",
    "relevance": "请先点明题目在问什么，再给出与题眼直接相关的事例。",
}

GAP_LABELS: dict[str, str] = {
    "contribution": "个人贡献",
    "evidence": "证据与量化",
    "structure": "结构完整性",
    "causality": "因果链条",
    "relevance": "扣题程度",
}


def _clip_quote(text: str, anchor: str, *, window: int = 24) -> str:
    trimmed = (text or "").strip()
    if not trimmed:
        return ""
    idx = trimmed.find(anchor)
    if idx >= 0:
        start = max(0, idx - 8)
        end = min(len(trimmed), idx + len(anchor) + window)
        snippet = trimmed[start:end]
        if start > 0:
            snippet = "…" + snippet
        if end < len(trimmed):
            snippet = snippet + "…"
        return snippet
    if len(trimmed) <= 48:
        return trimmed
    return trimmed[:45] + "…"


def _quote_for_gap(answer: str, gap_key: str) -> str:
    trimmed = (answer or "").strip()
    if gap_key == "contribution":
        m = re.search(r"我们[^，。；\n]{0,20}", trimmed)
        if m:
            return _clip_quote(trimmed, m.group(0)[:2], window=20)
        m2 = re.search(r"团队[^，。；\n]{0,16}", trimmed)
        if m2:
            return _clip_quote(trimmed, "团队", window=18)
    if gap_key == "evidence":
        m = re.search(r"[\u4e00-\u9fff，。；\n]{8,40}", trimmed)
        if m and not re.search(r"\d", m.group(0)):
            return _clip_quote(trimmed, m.group(0)[:4], window=22)
    if len(trimmed) <= 40:
        return trimmed
    return trimmed[:38] + "…"


def _pick_weakest_gap(logic: dict[str, Any]) -> str:
    dims = logic.get("dimensions") or {}
    weakest = "contribution"
    weakest_score = 101
    for key, val in dims.items():
        if key not in PROBE_BY_GAP:
            continue
        score = val.get("score") if isinstance(val, dict) else None
        if isinstance(score, (int, float)) and score < weakest_score:
            weakest_score = float(score)
            weakest = key
    return weakest


class FeedbackProvider(ABC):
    @abstractmethod
    def build(
        self,
        *,
        answer_text: str,
        question_title: str,
        keywords: list[str] | None,
        question_type: str,
    ) -> dict[str, Any] | None:
        ...


class RuleFeedbackProvider(FeedbackProvider):
    """Single-gap feedback from logic_scorer dimensions."""

    def build(
        self,
        *,
        answer_text: str,
        question_title: str,
        keywords: list[str] | None,
        question_type: str,
    ) -> dict[str, Any] | None:
        trimmed = (answer_text or "").strip()
        if not trimmed or question_type not in OPEN_TYPES:
            return None

        logic = score_logic_answer(
            trimmed,
            question_title=question_title,
            keywords=keywords or [],
        )
        gap_key = _pick_weakest_gap(logic)
        i_count = len(re.findall(r"我", trimmed))
        we_count = len(re.findall(r"我们", trimmed))
        if we_count > 0 and we_count >= i_count:
            gap_key = "contribution"
        dim = (logic.get("dimensions") or {}).get(gap_key) or {}
        quote = _quote_for_gap(trimmed, gap_key)
        if not quote:
            return None

        comment = dim.get("comment") or GAP_LABELS.get(gap_key, gap_key)
        suggestion = dim.get("suggestion") or ""
        message = (
            f"依据你原文「{quote}」：当前主要缺口在「{GAP_LABELS.get(gap_key, gap_key)}」——{comment}。"
        )
        if suggestion:
            message += f" {suggestion}"

        return {
            "gap_key": gap_key,
            "gap_label": GAP_LABELS.get(gap_key, gap_key),
            "quote": quote,
            "message": message.strip(),
            "probe_question": PROBE_BY_GAP[gap_key],
            "logic_rule_version": logic.get("logic_rule_version"),
            "provider": "rule",
        }


default_feedback_provider = RuleFeedbackProvider()
