"""Rule-based copilot triage (TriageProvider default)."""

from __future__ import annotations

import json
import re
import uuid
from abc import ABC, abstractmethod
from datetime import datetime, timezone
from functools import lru_cache
from pathlib import Path
from typing import Any

import yaml
from redis.asyncio import Redis

from app.research.events import append_research_event

RULES_PATH = Path(__file__).resolve().parent.parent / "data" / "triage_rules.yaml"


def triage_list_key(user_id: str) -> str:
    return f"copilot:{user_id}:triage"


@lru_cache(maxsize=1)
def _load_rules() -> dict[str, Any]:
    with RULES_PATH.open(encoding="utf-8") as handle:
        return yaml.safe_load(handle) or {}


def _normalize(text: str) -> str:
    return (text or "").strip().lower()


def _keyword_score(text: str, keywords: list[str]) -> tuple[int, list[str]]:
    normalized = _normalize(text)
    hits: list[str] = []
    for kw in keywords:
        token = (kw or "").strip().lower()
        if token and token in normalized:
            hits.append(kw)
    return len(hits), hits


def _pick_format_route(text: str, format_cfg: dict[str, Any]) -> dict[str, Any]:
    routes = format_cfg.get("routes") or {}
    normalized = _normalize(text)
    for key in ("lgd", "structured", "oneway"):
        block = routes.get(key) or {}
        for token in block.get("match") or []:
            if str(token).lower() in normalized:
                return {
                    "kind": block.get("kind", "page"),
                    "path": block.get("path", "/interview/lobby"),
                    "label": block.get("label", "开始练习"),
                }
    default = routes.get("default") or {}
    return {
        "kind": default.get("kind", "interview_lobby"),
        "path": default.get("path", "/interview/lobby"),
        "label": default.get("label", "进入面试大厅"),
    }


def _match_out_of_scope(text: str, rules: dict[str, Any]) -> dict[str, Any] | None:
    blocks = rules.get("out_of_scope") or {}
    best: tuple[int, str, dict[str, Any]] | None = None
    for name, cfg in blocks.items():
        if not isinstance(cfg, dict):
            continue
        score, hits = _keyword_score(text, cfg.get("keywords") or [])
        if score <= 0:
            continue
        priority = int(cfg.get("priority", 99))
        candidate = (priority, name, {**cfg, "_hits": hits, "_score": score})
        if best is None or candidate[0] < best[0] or (candidate[0] == best[0] and score > best[2]["_score"]):
            best = candidate
    if not best:
        return None
    _, name, cfg = best
    cfg["scope_id"] = name
    return cfg


def _match_need(
    text: str,
    rules: dict[str, Any],
    *,
    exclude: set[str] | None = None,
) -> tuple[str | None, dict[str, Any] | None, float, list[str]]:
    exclude = exclude or set()
    needs = rules.get("needs") or {}
    threshold = float(rules.get("confidence_threshold") or 0.62)

    ranked: list[tuple[float, int, str, dict[str, Any], list[str]]] = []
    for need_id, cfg in needs.items():
        if need_id in exclude or not isinstance(cfg, dict):
            continue
        score, hits = _keyword_score(text, cfg.get("keywords") or [])
        if score <= 0:
            continue
        priority = int(cfg.get("priority", 50))
        # More hits → higher confidence; priority breaks ties.
        confidence = min(0.98, 0.45 + 0.12 * score)
        ranked.append((confidence, priority, need_id, cfg, hits))

    if not ranked:
        return None, None, 0.0, []

    ranked.sort(key=lambda row: (-row[0], row[1]))
    confidence, _, need_id, cfg, hits = ranked[0]
    if confidence < threshold:
        return need_id, cfg, confidence, hits
    return need_id, cfg, confidence, hits


def _clarifying_question(rules: dict[str, Any], need_id: str | None, text: str) -> str:
    clar = rules.get("clarifying") or {}
    normalized = _normalize(text)
    if need_id in {"ownership", "followup"} or ("贡献" in normalized and "追问" in normalized):
        return str(clar.get("ownership_vs_followup") or clar.get("default"))
    return str(clar.get("default") or "能否再具体一点：你卡住的环节是？")


def _build_need_result(
    need_id: str,
    cfg: dict[str, Any],
    *,
    text: str,
    confidence: float,
) -> dict[str, Any]:
    judgment = str(cfg.get("judgment") or "").strip()
    micro_raw = cfg.get("micro_task") or {}
    micro_task = None
    if micro_raw.get("prompt"):
        micro_task = {
            "prompt": str(micro_raw.get("prompt")),
            "placeholder": micro_raw.get("placeholder"),
        }

    route = cfg.get("route")
    if need_id == "format":
        route = _pick_format_route(text, cfg)
    elif isinstance(route, dict):
        route = {
            "kind": route.get("kind", "page"),
            "path": route.get("path", "/"),
            "label": route.get("label", "开始练习"),
        }
    else:
        route = None

    return {
        "need": need_id,
        "confidence": round(confidence, 3),
        "judgment": judgment,
        "micro_task": micro_task,
        "route": route,
        "limitation": None,
        "clarifying_question": None,
    }


class TriageProvider(ABC):
    @abstractmethod
    def triage(
        self,
        message: str,
        *,
        rejected_need: str | None = None,
        clarify_answer: str | None = None,
    ) -> dict[str, Any]:
        ...


class RuleTriageProvider(TriageProvider):
    def triage(
        self,
        message: str,
        *,
        rejected_need: str | None = None,
        clarify_answer: str | None = None,
    ) -> dict[str, Any]:
        rules = _load_rules()
        combined = message.strip()
        if clarify_answer and clarify_answer.strip():
            combined = f"{combined}\n{clarify_answer.strip()}"

        oos = _match_out_of_scope(combined, rules)
        if oos:
            route = None
            if oos.get("handoff_human"):
                route = {
                    "kind": "human",
                    "path": "/profile",
                    "label": str(oos.get("handoff_label") or "了解反馈渠道"),
                }
            return {
                "need": "out_of_scope",
                "confidence": 0.95,
                "judgment": "这类需求超出谈锋产品范围，我们没法代替人工服务或第三方渠道。",
                "micro_task": None,
                "route": route,
                "limitation": str(oos.get("limitation") or "").strip() or None,
                "clarifying_question": None,
                "scope_id": oos.get("scope_id"),
            }

        exclude: set[str] = set()
        if rejected_need:
            exclude.add(rejected_need.strip())

        need_id, cfg, confidence, _hits = _match_need(combined, rules, exclude=exclude)
        threshold = float(rules.get("confidence_threshold") or 0.62)

        if need_id and cfg and confidence >= threshold:
            return _build_need_result(need_id, cfg, text=combined, confidence=confidence)

        if need_id and cfg and confidence < threshold:
            return {
                "need": need_id,
                "confidence": round(confidence, 3),
                "judgment": "",
                "micro_task": None,
                "route": None,
                "limitation": None,
                "clarifying_question": _clarifying_question(rules, need_id, combined),
            }

        # No keyword hit — one clarifying question only
        return {
            "need": "unclear",
            "confidence": 0.0,
            "judgment": "",
            "micro_task": None,
            "route": None,
            "limitation": None,
            "clarifying_question": _clarifying_question(rules, None, combined),
        }


default_triage_provider: TriageProvider = RuleTriageProvider()


def summarize_input(text: str, *, max_len: int = 120) -> str:
    cleaned = re.sub(r"\s+", " ", (text or "").strip())
    if len(cleaned) <= max_len:
        return cleaned
    return cleaned[: max_len - 1] + "…"


async def append_triage_record(redis: Redis, user_id: str, record: dict[str, Any]) -> None:
    payload = json.dumps(record, ensure_ascii=False)
    await redis.rpush(triage_list_key(user_id), payload)
    # Keep recent history bounded
    await redis.ltrim(triage_list_key(user_id), -200, -1)


async def run_copilot_triage(
    redis: Redis,
    user_id: str,
    *,
    message: str,
    rejected_need: str | None = None,
    clarify_answer: str | None = None,
    provider: TriageProvider | None = None,
) -> dict[str, Any]:
    provider = provider or default_triage_provider
    result = provider.triage(
        message,
        rejected_need=rejected_need,
        clarify_answer=clarify_answer,
    )
    triage_id = uuid.uuid4().hex[:12]
    now = datetime.now(timezone.utc).isoformat()

    record = {
        "id": triage_id,
        "ts": now,
        "input_summary": summarize_input(message),
        "need": result.get("need"),
        "confidence": result.get("confidence"),
        "accepted": None,
        "rejected": bool(rejected_need),
        "handoff_human": result.get("need") == "out_of_scope" and bool(result.get("route")),
        "scope_id": result.get("scope_id"),
    }
    await append_triage_record(redis, user_id, record)

    await append_research_event(
        redis,
        user_id,
        "copilot.triage",
        props={
            "triage_id": triage_id,
            "need": result.get("need"),
            "confidence": result.get("confidence"),
            "rejected_prior": rejected_need,
            "has_clarify": bool(result.get("clarifying_question")),
        },
    )

    if rejected_need:
        await append_research_event(
            redis,
            user_id,
            "copilot.triage_rejected",
            props={"triage_id": triage_id, "rejected_need": rejected_need},
        )

    if result.get("need") == "out_of_scope" and result.get("route"):
        await append_research_event(
            redis,
            user_id,
            "copilot.handoff_human",
            props={"triage_id": triage_id, "scope_id": result.get("scope_id")},
        )

    return {**result, "triage_id": triage_id}


async def record_micro_task_done(
    redis: Redis,
    user_id: str,
    *,
    triage_id: str | None,
    need: str,
    answer_summary: str,
) -> None:
    await append_triage_record(
        redis,
        user_id,
        {
            "ts": datetime.now(timezone.utc).isoformat(),
            "event": "micro_task_done",
            "triage_id": triage_id,
            "need": need,
            "answer_summary": summarize_input(answer_summary, max_len=200),
        },
    )
    await append_research_event(
        redis,
        user_id,
        "copilot.micro_task_done",
        props={"triage_id": triage_id, "need": need},
    )
