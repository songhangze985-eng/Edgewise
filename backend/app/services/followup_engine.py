"""Rule-based dynamic follow-up question engine (up to 3 layers)."""

from __future__ import annotations

import re
from abc import ABC, abstractmethod
from functools import lru_cache
from pathlib import Path
from typing import Any

import yaml

from app.services.logic_scorer import score_logic_answer
from app.services.revision_feedback import (  # noqa: F401 — re-export for services
    GAP_LABELS,
    OPEN_TYPES,
    _pick_weakest_gap,
    _quote_for_gap,
)

TEMPLATES_PATH = Path(__file__).resolve().parent.parent / "data" / "followup_templates.yaml"

ALLOWED_TEMPLATE_VARS = frozenset(
    {"question_title", "gap_label", "keyword", "resume_snippet", "user_excerpt"}
)

GAP_FILLED_MIN_SCORE = 12


@lru_cache(maxsize=1)
def _load_templates() -> dict[str, Any]:
    with TEMPLATES_PATH.open(encoding="utf-8") as handle:
        data = yaml.safe_load(handle) or {}
    return data.get("layers") or {}


def _build_context_text(main_answer: str, followups: list[dict[str, Any]]) -> str:
    parts = [(main_answer or "").strip()]
    for item in followups:
        ans = (item.get("answer") or "").strip()
        if ans:
            parts.append(ans)
    return "\n".join(p for p in parts if p)


def _gap_score(answer_context: str, gap_key: str, *, question_title: str, keywords: list[str]) -> float:
    logic = score_logic_answer(
        answer_context,
        question_title=question_title,
        keywords=keywords or [],
    )
    dim = (logic.get("dimensions") or {}).get(gap_key) or {}
    score = dim.get("score")
    return float(score) if isinstance(score, (int, float)) else 0.0


def gap_is_filled(
    answer_context: str,
    gap_key: str,
    *,
    question_title: str,
    keywords: list[str] | None,
) -> bool:
    return _gap_score(answer_context, gap_key, question_title=question_title, keywords=keywords or []) >= GAP_FILLED_MIN_SCORE


def pick_followup_gap(
    answer_context: str,
    *,
    question_title: str,
    keywords: list[str] | None,
    exclude: set[str] | None = None,
) -> str | None:
    trimmed = (answer_context or "").strip()
    if not trimmed:
        return None
    logic = score_logic_answer(trimmed, question_title=question_title, keywords=keywords or [])
    gap_key = _pick_weakest_gap(logic)
    i_count = len(re.findall(r"我", trimmed))
    we_count = len(re.findall(r"我们", trimmed))
    if we_count > 0 and we_count >= i_count:
        gap_key = "contribution"
    exclude = exclude or set()
    if gap_key in exclude:
        dims = logic.get("dimensions") or {}
        candidates: list[tuple[float, str]] = []
        for key in GAP_LABELS:
            if key in exclude:
                continue
            val = dims.get(key) or {}
            score = val.get("score")
            if isinstance(score, (int, float)):
                candidates.append((float(score), key))
        if not candidates:
            return None
        candidates.sort(key=lambda x: x[0])
        gap_key = candidates[0][1]
    if gap_is_filled(trimmed, gap_key, question_title=question_title, keywords=keywords):
        return None
    return gap_key


def _render_template(
    layer: int,
    gap_key: str,
    variables: dict[str, str],
) -> str | None:
    layers = _load_templates()
    layer_cfg = layers.get(layer) or layers.get(str(layer))
    if not layer_cfg:
        return None
    gaps = layer_cfg.get("gaps") or {}
    gap_cfg = gaps.get(gap_key)
    if not gap_cfg:
        return None

    with_vars = gap_cfg.get("with_vars") or ""
    no_vars = gap_cfg.get("no_vars") or ""
    used_keys = set(re.findall(r"\{(\w+)\}", with_vars))
    if used_keys and used_keys.issubset(ALLOWED_TEMPLATE_VARS):
        missing = [k for k in used_keys if not (variables.get(k) or "").strip()]
        if missing:
            return (no_vars or with_vars).strip() or None
        try:
            return with_vars.format(**{k: variables.get(k, "") for k in used_keys}).strip()
        except (KeyError, ValueError):
            return (no_vars or with_vars).strip() or None
    return (no_vars or with_vars).strip() or None


def build_template_variables(
    *,
    question_title: str,
    gap_key: str,
    answer_text: str,
    keywords: list[str] | None,
    resume_snippet: str | None,
) -> dict[str, str]:
    kw_list = [k for k in (keywords or []) if k]
    keyword = kw_list[0] if kw_list else ""
    excerpt = _quote_for_gap(answer_text or "", gap_key)
    return {
        "question_title": (question_title or "").strip(),
        "gap_label": GAP_LABELS.get(gap_key, gap_key),
        "keyword": keyword,
        "resume_snippet": (resume_snippet or "").strip(),
        "user_excerpt": excerpt,
    }


class FollowupProvider(ABC):
    @abstractmethod
    def build(
        self,
        *,
        layer: int,
        gap_type: str,
        question_title: str,
        answer_context: str,
        keywords: list[str] | None,
        resume_snippet: str | None,
    ) -> str | None:
        ...


class RuleFollowupProvider(FollowupProvider):
    def build(
        self,
        *,
        layer: int,
        gap_type: str,
        question_title: str,
        answer_context: str,
        keywords: list[str] | None,
        resume_snippet: str | None,
    ) -> str | None:
        variables = build_template_variables(
            question_title=question_title,
            gap_key=gap_type,
            answer_text=answer_context,
            keywords=keywords,
            resume_snippet=resume_snippet,
        )
        return _render_template(layer, gap_type, variables)


default_followup_provider = RuleFollowupProvider()


def revision_probe_gap(question: dict[str, Any]) -> str | None:
    revision = question.get("revision") or {}
    feedback = revision.get("feedback") or {}
    gap = feedback.get("gap_key")
    if gap and (revision.get("probe_answer") or "").strip():
        return str(gap)
    return None


def revision_probe_text(question: dict[str, Any]) -> str | None:
    revision = question.get("revision") or {}
    feedback = revision.get("feedback") or {}
    probe = (feedback.get("probe_question") or "").strip()
    return probe or None


def effective_max_layers(
    *,
    followup_intensity: str | int | None,
    difficulty: str | None,
    experiment_max: int | None,
    enabled: bool,
) -> int:
    if not enabled:
        return 0
    if experiment_max is not None:
        return max(0, min(3, int(experiment_max)))
    raw = followup_intensity
    if raw in (0, "0", "off"):
        return 0
    if raw in (1, "1"):
        return 1
    if raw in (3, "3"):
        return 3
    diff = (difficulty or "").lower()
    if diff in ("hard", "困难", "高压"):
        return 3
    return 1


def followup_experiment_limits(
    user_data: dict[str, Any] | None,
    session_metadata: dict[str, Any] | None,
) -> dict[str, Any]:
    from app.research.experiment_config import FORCED_BY_ARM

    user_data = user_data or {}
    session_metadata = session_metadata or {}
    assignment = user_data.get("experiment_assignment") or {}
    arm_code = session_metadata.get("experiment_arm") or assignment.get("arm")
    in_experiment = bool(arm_code and len(str(arm_code)) >= 2)
    forced = bool(FORCED_BY_ARM.get("followup") and in_experiment)
    if not forced:
        return {"enabled": True, "max_layers": None, "merge_revision_probe": False, "demo_only": False}
    zp = int(str(arm_code)[1])
    if zp == 0:
        return {"enabled": False, "max_layers": 0, "merge_revision_probe": False, "demo_only": True}
    if zp == 1:
        return {"enabled": True, "max_layers": 1, "merge_revision_probe": True, "demo_only": False}
    return {"enabled": True, "max_layers": None, "merge_revision_probe": False, "demo_only": False}


def next_followup_layer(existing: list[dict[str, Any]]) -> int:
    if not existing:
        return 1
    answered = [f for f in existing if (f.get("answer") or "").strip()]
    if len(answered) < len(existing):
        return int(existing[-1].get("layer") or len(existing))
    last_layer = int(answered[-1].get("layer") or len(answered))
    return last_layer + 1
