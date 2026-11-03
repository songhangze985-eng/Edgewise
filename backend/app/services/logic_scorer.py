"""Rule-based logic scoring for open interview answers (no external API)."""

from __future__ import annotations

import re
from typing import Any

from app.services.interview_config import LOGIC_RULE_VERSION

LOW_EFFORT_PATTERNS = [
    re.compile(r"^好的?[。.!]?$"),
    re.compile(r"^不知道[。.!]?$"),
    re.compile(r"^没(?:有)?想法[。.!]?$"),
    re.compile(r"^跳过[。.!]?$"),
    re.compile(r"^pass$", re.I),
    re.compile(r"^(?:idk|i don't know|dunno)[.!?]?$", re.I),
    re.compile(r"^ok(?:ay)?[.!?]?$", re.I),
]

STRUCTURE_SIGNALS_ZH = ("当时", "负责", "我做了", "我负责", "最终", "结果", "背景", "任务", "行动")
STRUCTURE_SIGNALS_EN = (
    "first",
    "second",
    "finally",
    "background",
    "situation",
    "task",
    "action",
    "result",
    "as a result",
    "i led",
    "i was responsible",
    "my role",
)

CAUSAL_SIGNALS_ZH = ("因为", "所以", "于是", "但是", "然而", "最终", "因此", "导致")
CAUSAL_SIGNALS_EN = ("because", "so", "therefore", "as a result", "however", "but", "led to", "thus")

EVIDENCE_PATTERN = re.compile(
    r"\d+%|\d+万|\d+人|\d+天|\d+个月|20\d{2}|Q[1-4]|python|java|react|sql|redis|fastapi",
    re.I,
)
CONTRADICTION_HINTS = (
    (re.compile(r"我负责全部|全权负责|独立负责"), re.compile(r"只参与|协助|打杂|旁听")),
    (
        re.compile(r"\b(?:owned|led|drove)\s+(?:the|entire|whole)\b", re.I),
        re.compile(r"\b(?:only|just)\s+(?:helped|assisted|supported)\b", re.I),
    ),
)


def _normalize_lang(lang: str | None) -> str:
    if lang and str(lang).lower().startswith("en"):
        return "en-US"
    return "zh-CN"


def _token_overlap(question: str, answer: str) -> float:
    q_tokens = set(re.findall(r"[\u4e00-\u9fff]{2,}|\w{3,}", question.lower()))
    a_tokens = set(re.findall(r"[\u4e00-\u9fff]{2,}|\w{3,}", answer.lower()))
    if not q_tokens:
        return 0.5
    return len(q_tokens & a_tokens) / len(q_tokens)


def _dim_structure(answer: str, *, lang: str) -> tuple[int, str, str]:
    signals = STRUCTURE_SIGNALS_EN if lang == "en-US" else STRUCTURE_SIGNALS_ZH
    score = 8
    lower = answer.lower() if lang == "en-US" else answer
    hits = sum(1 for s in signals if s in lower)
    score += min(8, hits * 2)
    if lang == "en-US":
        if re.search(r"[\n;]|first|second|finally|step \d", answer, re.I):
            score += 4
    elif re.search(r"[\n；;]|首先|其次|最后|第一|第二", answer):
        score += 4
    score = min(20, score)
    if lang == "en-US":
        comment = "Clear structure in the answer" if score >= 12 else "Structure is loose; background-action-result unclear"
        suggestion = "Use situation → your task → actions → measurable result"
    else:
        comment = "回答具备一定结构" if score >= 12 else "结构偏松散，背景-行动-结果不够清晰"
        suggestion = "建议用「背景 → 你的任务 → 具体行动 → 结果」四段式组织"
    return score, comment, suggestion


def _dim_contribution(answer: str, keywords: list[str], *, lang: str) -> tuple[int, str, str]:
    if lang == "en-US":
        i_count = len(re.findall(r"\bI\b", answer))
        we_count = len(re.findall(r"\bwe\b", answer, re.I))
    else:
        i_count = len(re.findall(r"我", answer))
        we_count = len(re.findall(r"我们", answer))
    total = max(i_count + we_count, 1)
    i_ratio = i_count / total
    score = 10
    if i_ratio >= 0.5:
        score += 6
    elif i_ratio >= 0.35:
        score += 3
    if we_count > i_count:
        score -= 4
    if keywords:
        mentioned = sum(1 for k in keywords if k and k.lower() in answer.lower())
        score += min(4, mentioned * 2)
    score = max(0, min(20, score))
    if lang == "en-US":
        comment = "Personal contribution is clear" if score >= 12 else "Too much \"we\" or missing \"I\" actions"
        suggestion = 'Use "I" for decisions, ownership, and deliverables; mention role keywords'
    else:
        comment = "个人贡献表述较清楚" if score >= 12 else "「我们」过多或缺少「我」的具体动作"
        suggestion = "多用「我」描述你的决策、分工与交付，并点明项目/技术关键词"
    return score, comment, suggestion


def _dim_evidence(answer: str, *, lang: str) -> tuple[int, str, str]:
    matches = EVIDENCE_PATTERN.findall(answer)
    score = 6 + min(14, len(matches) * 3)
    if re.search(r"\d", answer):
        score += 2
    score = min(20, score)
    if lang == "en-US":
        comment = "Includes metrics or concrete tools/methods" if score >= 12 else "Missing numbers, timelines, or named methods"
        suggestion = "Add metrics (e.g. +X%), timeline, team size, or tech stack"
    else:
        comment = "有量化或具体工具/方法" if score >= 12 else "缺少数字、时间或具体方法名"
        suggestion = "补充指标（提升 X%）、周期、团队规模或使用的技术栈"
    return score, comment, suggestion


def _dim_causality(answer: str, *, lang: str) -> tuple[int, str, str]:
    signals = CAUSAL_SIGNALS_EN if lang == "en-US" else CAUSAL_SIGNALS_ZH
    lower = answer.lower() if lang == "en-US" else answer
    hits = sum(1 for s in signals if s in lower)
    score = 8 + min(10, hits * 2)
    contradiction = False
    for pos, neg in CONTRADICTION_HINTS:
        if pos.search(answer) and neg.search(answer):
            contradiction = True
            score -= 4
    score = max(0, min(20, score))
    if lang == "en-US":
        comment = "Cause-effect chain is coherent" if score >= 12 else "Weak causal links and transitions"
        if contradiction:
            comment += "; ownership statements may conflict — align your story"
        suggestion = 'Link decisions with "because… so… as a result…"'
    else:
        comment = "因果链条较连贯" if score >= 12 else "因果与转折连接偏弱"
        if contradiction:
            comment += "；前后贡献描述可能不一致，建议统一口径"
        suggestion = "用「因为…所以…最终…」串联决策与结果，避免前后矛盾"
    return score, comment, suggestion


def _dim_relevance(question: str, answer: str, *, lang: str) -> tuple[int, str, str]:
    overlap = _token_overlap(question, answer)
    score = int(6 + overlap * 14)
    score = max(0, min(20, score))
    if lang == "en-US":
        comment = "Good overlap with question keywords" if score >= 12 else "Partly off-topic or too generic"
        suggestion = "Restate the question focus, then anchor examples to its keywords"
    else:
        comment = "与题目关键词重合度较好" if score >= 12 else "部分内容偏离题目或过于空泛"
        suggestion = "先复述题眼，再围绕题目关键词展开事例"
    return score, comment, suggestion


def score_logic_answer(
    answer_text: str,
    *,
    question_title: str = "",
    keywords: list[str] | None = None,
    lang: str | None = None,
) -> dict[str, Any]:
    """Return logic_score payload with total, dimensions, comments, version."""
    trimmed = (answer_text or "").strip()
    keywords = keywords or []
    lang_key = _normalize_lang(lang)

    min_len = 12 if lang_key == "en-US" else 20
    if not trimmed or len(trimmed) < min_len or any(p.match(trimmed) for p in LOW_EFFORT_PATTERNS):
        reason = "未作答、过短或无效敷衍"
        if lang_key == "en-US":
            reason = "Empty, too short, or low-effort answer"
        if trimmed and len(trimmed) >= 1:
            if lang_key == "en-US":
                reason = f"Answer too short ({len(trimmed)} chars)"
            else:
                reason = f"回答过短或过于简略（{len(trimmed)} 字）"
        cap = 0 if not trimmed else min(10, max(3, len(trimmed) // 2))
        if lang_key == "en-US":
            return {
                "total": cap,
                "rule_note": "Rule-based estimate for reference only",
                "low_effort_reason": reason,
                "logic_rule_version": LOGIC_RULE_VERSION,
                "dimensions": {
                    "structure": {"score": cap, "comment": reason, "suggestion": "Add a full STAR structure"},
                    "contribution": {"score": cap, "comment": reason, "suggestion": "Clarify what you personally did"},
                    "evidence": {"score": cap, "comment": reason, "suggestion": "Add quantified impact"},
                    "causality": {"score": cap, "comment": reason, "suggestion": "Connect cause and effect"},
                    "relevance": {"score": cap, "comment": reason, "suggestion": "Stay on the question keywords"},
                },
            }
        return {
            "total": cap,
            "rule_note": "评分为规则估算，仅供参考",
            "low_effort_reason": reason,
            "logic_rule_version": LOGIC_RULE_VERSION,
            "dimensions": {
                "structure": {"score": cap, "comment": reason, "suggestion": "补充完整 STAR 结构"},
                "contribution": {"score": cap, "comment": reason, "suggestion": "明确「我」的行动"},
                "evidence": {"score": cap, "comment": reason, "suggestion": "加入量化指标"},
                "causality": {"score": cap, "comment": reason, "suggestion": "补充因果连接"},
                "relevance": {"score": cap, "comment": reason, "suggestion": "紧扣题目关键词"},
            },
        }

    s, sc, ss = _dim_structure(trimmed, lang=lang_key)
    c, cc, cs = _dim_contribution(trimmed, keywords, lang=lang_key)
    e, ec, es = _dim_evidence(trimmed, lang=lang_key)
    ca, cac, cas = _dim_causality(trimmed, lang=lang_key)
    r, rc, rs = _dim_relevance(question_title, trimmed, lang=lang_key)
    total = s + c + e + ca + r

    rule_note = "Rule-based estimate for reference only" if lang_key == "en-US" else "评分为规则估算，仅供参考"

    return {
        "total": total,
        "rule_note": rule_note,
        "logic_rule_version": LOGIC_RULE_VERSION,
        "dimensions": {
            "structure": {"score": s, "comment": sc, "suggestion": ss},
            "contribution": {"score": c, "comment": cc, "suggestion": cs},
            "evidence": {"score": e, "comment": ec, "suggestion": es},
            "causality": {"score": ca, "comment": cac, "suggestion": cas},
            "relevance": {"score": r, "comment": rc, "suggestion": rs},
        },
    }
