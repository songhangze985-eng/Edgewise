"""Case / system design interview flow — rule-based CaseInterviewer (no external API)."""

from __future__ import annotations

import re
from abc import ABC, abstractmethod
from functools import lru_cache
from pathlib import Path
from typing import Any

import yaml

CASE_BANK_PATH = Path(__file__).resolve().parent.parent / "data" / "case_bank.yaml"
CASE_RULE_VERSION = "case_v1"

CASE_STEP_IDS = ("clarify", "framework", "assumptions", "data", "conclusion")
SYSTEM_DESIGN_STEP_IDS = (
    "requirements",
    "estimation",
    "api",
    "data_model",
    "architecture",
    "tradeoffs",
)


@lru_cache(maxsize=1)
def load_case_bank() -> dict[str, Any]:
    with CASE_BANK_PATH.open(encoding="utf-8") as handle:
        return yaml.safe_load(handle) or {}


def list_case_prompts() -> list[dict[str, Any]]:
    bank = load_case_bank()
    items: list[dict[str, Any]] = []
    for row in bank.get("cases") or []:
        items.append(
            {
                "id": row["id"],
                "kind": "case",
                "title": row.get("title"),
                "prompt_preview": (row.get("prompt") or "")[:160],
            }
        )
    for row in bank.get("system_designs") or []:
        items.append(
            {
                "id": row["id"],
                "kind": "system_design",
                "title": row.get("title"),
                "prompt_preview": (row.get("prompt") or "")[:160],
            }
        )
    return items


def get_case_definition(case_id: str) -> dict[str, Any] | None:
    bank = load_case_bank()
    for row in (bank.get("cases") or []) + (bank.get("system_designs") or []):
        if row.get("id") == case_id:
            return row
    return None


def step_ids_for_kind(kind: str) -> tuple[str, ...]:
    if kind == "system_design":
        return SYSTEM_DESIGN_STEP_IDS
    return CASE_STEP_IDS


def step_labels_for_kind(kind: str) -> list[dict[str, str]]:
    bank = load_case_bank()
    key = "system_design_steps" if kind == "system_design" else "case_steps"
    catalog = {s["id"]: s.get("label", s["id"]) for s in (bank.get(key) or [])}
    return [{"id": sid, "label": catalog.get(sid, sid)} for sid in step_ids_for_kind(kind)]


def _normalize_text(text: str) -> str:
    return re.sub(r"\s+", "", (text or "").lower())


def _match_keywords(text: str, keywords: list[str]) -> bool:
    hay = _normalize_text(text)
    if not hay:
        return False
    hits = 0
    for kw in keywords:
        if kw and _normalize_text(kw) in hay:
            hits += 1
    return hits >= 1


class CaseInterviewer(ABC):
    @abstractmethod
    def intro(self) -> str: ...

    @abstractmethod
    def prompt_for_step(self, case_id: str, step_id: str) -> str: ...

    @abstractmethod
    def respond_clarification(self, case_id: str, user_text: str) -> dict[str, Any]: ...

    @abstractmethod
    def evaluate_step(self, case_id: str, step_id: str, answer: str) -> dict[str, Any]: ...

    @abstractmethod
    def data_tables_for_case(self, case_id: str) -> list[dict[str, Any]]: ...


class RuleCaseInterviewer(CaseInterviewer):
    """Default provider: scripted clarifications and checklist scoring from case_bank.yaml."""

    def __init__(self) -> None:
        self._bank = load_case_bank()
        self._script = self._bank.get("interviewer_script") or {}

    def intro(self) -> str:
        return str(self._script.get("intro") or "请按步骤完成本题。")

    def prompt_for_step(self, case_id: str, step_id: str) -> str:
        prompts = self._script.get("step_prompts") or {}
        if step_id in prompts:
            return str(prompts[step_id])
        definition = get_case_definition(case_id)
        kind = (definition or {}).get("kind") or "case"
        labels = {s["id"]: s["label"] for s in step_labels_for_kind(kind)}
        return f"请完成步骤：{labels.get(step_id, step_id)}"

    def respond_clarification(self, case_id: str, user_text: str) -> dict[str, Any]:
        definition = get_case_definition(case_id)
        if not definition:
            return {
                "matched": False,
                "reply": "暂无更多背景信息，请基于题目合理假设并说明。",
                "provider": "rule",
            }
        clarifications = definition.get("clarifications") or []
        for item in clarifications:
            keywords = item.get("keywords") or []
            if _match_keywords(user_text, keywords):
                return {
                    "matched": True,
                    "reply": str(item.get("answer") or ""),
                    "provider": "rule",
                }
        return {
            "matched": False,
            "reply": "这个问题暂无预设数据。请说明你的假设，或在框架/假设步骤写清。",
            "provider": "rule",
        }

    def evaluate_step(self, case_id: str, step_id: str, answer: str) -> dict[str, Any]:
        definition = get_case_definition(case_id)
        if not definition:
            return {"checklist": [], "passed": 0, "total": 0, "score": None, "provider": "rule"}

        checklists = (definition.get("step_checklists") or {}).get(step_id) or []
        text = (answer or "").strip()
        if len(text) < 8:
            return {
                "checklist": [
                    {
                        "id": "min_length",
                        "label": "作答过短",
                        "passed": False,
                        "hint": "本步请至少用几句话说明思路。",
                    }
                ],
                "passed": 0,
                "total": max(1, len(checklists)),
                "score": None,
                "provider": "rule",
            }

        results: list[dict[str, Any]] = []
        passed = 0
        for item in checklists:
            signals = item.get("signals") or []
            ok = _match_keywords(text, signals) if signals else len(text) >= 40
            if ok:
                passed += 1
            results.append(
                {
                    "id": item.get("id"),
                    "label": item.get("label"),
                    "passed": ok,
                    "hint": None if ok else "可补充相关要点或结构信号。",
                }
            )
        total = len(results) or 1
        score = round(passed / total * 100) if results else None
        return {
            "checklist": results,
            "passed": passed,
            "total": total,
            "score": score,
            "provider": "rule",
            "rule_version": CASE_RULE_VERSION,
        }

    def data_tables_for_case(self, case_id: str) -> list[dict[str, Any]]:
        definition = get_case_definition(case_id)
        if not definition:
            return []
        return list(definition.get("data_tables") or [])


default_case_interviewer: CaseInterviewer = RuleCaseInterviewer()


def build_case_question_item(
    *,
    case_id: str,
    round_index: int,
) -> dict[str, Any]:
    definition = get_case_definition(case_id)
    if not definition:
        raise ValueError(f"Unknown case id: {case_id}")
    kind = definition.get("kind") or "case"
    qid = f"case_{round_index}_{case_id}"
    return {
        "id": qid,
        "case_id": case_id,
        "kind": kind,
        "type": "case_interview",
        "title": definition.get("title") or case_id,
        "prompt": definition.get("prompt") or "",
        "steps": step_labels_for_kind(kind),
        "current_step_index": 0,
        "case_steps": [],
        "clarifications_log": [],
        "whiteboard_snapshot": None,
        "score": None,
    }


def pick_default_case_id(kind: str) -> str | None:
    bank = load_case_bank()
    if kind == "system_design":
        rows = bank.get("system_designs") or []
    else:
        rows = bank.get("cases") or []
    if not rows:
        return None
    return rows[0].get("id")
