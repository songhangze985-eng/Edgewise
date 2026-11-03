"""Signal-based rubrics for civil / SOE structured interview answers."""

from __future__ import annotations

import hashlib
import random
import re
from typing import Any

STRUCTURED_RULE_VERSION = "structured_v1"

LOW_EFFORT = (
    re.compile(r"^好的?[。.!]?$"),
    re.compile(r"^不知道[。.!]?$"),
    re.compile(r"^没(?:有)?想法[。.!]?$"),
)

CATEGORY_LABELS = {
    "analysis": "综合分析",
    "planning": "计划组织",
    "emergency": "应急应变",
    "interpersonal": "人际关系",
    "fit": "岗位匹配",
}

RUBRICS: dict[str, dict[str, tuple[tuple[str, ...], str]]] = {
    "analysis": {
        "stance": (("我认为", "应当", "关键在于", "本质", "一方面", "另一方面"), "是否亮明立场并多角度分析"),
        "depth": (("原因", "影响", "利弊", "风险", "对策", "因此"), "是否展开原因—影响—对策"),
        "balance": (("既要", "也要", "统筹", "兼顾", "平衡"), "是否体现辩证与统筹思维"),
    },
    "planning": {
        "goal": (("目的", "目标", "为了", "确保"), "是否先说清活动/调研目的"),
        "prepare": (("准备", "人员", "物资", "预算", "方案", "预案"), "是否交代准备要素"),
        "execute": (("第一步", "其次", "然后", "实施", "推进", "落实"), "是否按步骤推进"),
        "close": (("总结", "反馈", "评估", "归档", "宣传", "复盘"), "是否收尾与反馈"),
    },
    "emergency": {
        "calm": (("先", "稳定", "控制", "冷静", "第一时间"), "是否先稳控局面"),
        "priority": (("生命", "安全", "优先", "轻重缓急", "紧急"), "是否分清轻重缓急"),
        "action": (("我会", "立即", "联系", "上报", "协调", "处置"), "是否给出可执行动作"),
        "followup": (("后续", "复盘", "预防", "完善", "机制"), "是否善后与预防"),
    },
    "interpersonal": {
        "empathy": (("理解", "换位思考", "感受", "尊重"), "是否体现换位与尊重"),
        "communicate": (("沟通", "交流", "倾听", "说明", "解释"), "是否强调沟通方式"),
        "resolve": (("协商", "折中", "共识", "化解", "合作"), "是否指向化解与共赢"),
        "principle": (("原则", "底线", "规章", "制度", "大局"), "是否把握原则与分寸"),
    },
    "fit": {
        "motivation": (("选择", "报考", "加入", "认同", "价值观"), "是否说明动机与认同"),
        "match": (("匹配", "胜任", "优势", "经验", "能力"), "是否对照岗位能力"),
        "plan": (("学习", "提升", "规划", "短期", "长期"), "是否给出成长规划"),
        "commit": (("踏实", "服务", "责任", "奉献", "长期"), "是否体现稳定性与担当"),
    },
}

STRUCTURE_TIPS: dict[str, str] = {
    "analysis": "建议结构：表态 → 多角度分析（原因/影响）→ 对策 → 简短收束。",
    "planning": "建议结构：目的 → 准备（人财物）→ 实施步骤 → 风险预案 → 总结反馈。",
    "emergency": "建议结构：稳控 → 分优先级处置 → 协调资源 → 善后与预防。",
    "interpersonal": "建议结构：理解对方 → 沟通方式 → 解决步骤 → 原则与复盘。",
    "fit": "建议结构：动机 → 能力与经历匹配 → 规划 → 态度与稳定性。",
}


def _category_key(raw: str | None) -> str:
    key = (raw or "analysis").strip().lower()
    return key if key in RUBRICS else "analysis"


def _score_signals(answer: str, signals: tuple[str, ...]) -> int:
    hits = sum(1 for s in signals if s in answer)
    return min(25, 8 + hits * 4)


def _simulate_panel(base: float, panel_size: int, seed: str) -> dict[str, Any]:
    size = max(3, min(9, int(panel_size or 5)))
    rng = random.Random(int(hashlib.sha256(seed.encode()).hexdigest()[:8], 16))
    raw = [round(max(0.0, min(100.0, base + rng.uniform(-8, 8))), 1) for _ in range(size)]
    if size >= 5:
        sorted_scores = sorted(raw)
        trimmed = sorted_scores[1:-1]
        final = round(sum(trimmed) / len(trimmed), 1)
        dropped = {"high": sorted_scores[-1], "low": sorted_scores[0]}
    else:
        final = round(sum(raw) / len(raw), 1)
        dropped = None
    return {
        "panel_size": size,
        "raw_scores": raw,
        "dropped_high_low": dropped,
        "panel_final": final,
        "simulated": True,
        "disclaimer": "模拟考官打分，去掉最高最低后取平均，仅供练习参考",
    }


def score_structured_answer(
    answer_text: str,
    *,
    structured_category: str | None = None,
    question_title: str = "",
    panel_size: int = 5,
    session_id: str = "",
    question_index: int = 0,
) -> dict[str, Any]:
    category = _category_key(structured_category)
    trimmed = (answer_text or "").strip()
    tips = STRUCTURE_TIPS.get(category, STRUCTURE_TIPS["analysis"])

    if not trimmed or len(trimmed) < 15 or any(p.match(trimmed) for p in LOW_EFFORT):
        cap = 0 if not trimmed else min(12, max(4, len(trimmed) // 3))
        dims = {
            k: {"score": cap, "comment": rub[1], "max": 25}
            for k, rub in RUBRICS[category].items()
        }
        panel = _simulate_panel(float(cap), panel_size, f"{session_id}:{question_index}:empty")
        return {
            "total": cap,
            "category": category,
            "category_label": CATEGORY_LABELS.get(category, category),
            "structure_tip": tips,
            "rule_note": "评分为规则估算，仅供参考；不提供标准答案。",
            "structured_rule_version": STRUCTURED_RULE_VERSION,
            "dimensions": dims,
            "panel": panel,
            "panel_final": panel["panel_final"],
        }

    dims: dict[str, Any] = {}
    total = 0
    for key, (signals, comment) in RUBRICS[category].items():
        sc = _score_signals(trimmed, signals)
        dims[key] = {"score": sc, "comment": comment, "max": 25}
        total += sc

    if re.search(r"[\n；;]|首先|其次|最后|第一|第二", trimmed):
        total = min(100, total + 5)

    overlap_tokens = set(re.findall(r"[\u4e00-\u9fff]{2,}", question_title))
    answer_tokens = set(re.findall(r"[\u4e00-\u9fff]{2,}", trimmed))
    if overlap_tokens and len(overlap_tokens & answer_tokens) / len(overlap_tokens) >= 0.25:
        total = min(100, total + 3)

    total = min(100, total)
    panel = _simulate_panel(float(total), panel_size, f"{session_id}:{question_index}:{total}")
    return {
        "total": total,
        "category": category,
        "category_label": CATEGORY_LABELS.get(category, category),
        "structure_tip": tips,
        "rule_note": "评分为规则估算，仅供参考；不提供标准答案。",
        "structured_rule_version": STRUCTURED_RULE_VERSION,
        "dimensions": dims,
        "panel": panel,
        "panel_final": panel["panel_final"],
    }
