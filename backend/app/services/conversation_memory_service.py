"""Multi-Turn Conversation Memory Service (`conversation_memory_service.py`).

Implements a 3-tier conversational memory architecture persisted in MongoDB (`conversation_memories` collection)
and hot-cached in Redis (`memory:conv:{user_id}:{scope}`):
  1. Tier 1 — Working Memory (`recent_turns`): Sliding window of the latest K=8 verbatim turns.
  2. Tier 2 — Episodic Summary (`episodic_summary`): Automatic compression of older turns that slide out of
     the K-turn window so context length stays bounded without losing historical context.
  3. Tier 3 — Long-Term User Profile Facts (`user_facts`): Cross-turn entity extraction (target position,
     target company, claimed projects, quantified metrics, and prior diagnostic needs).
"""

from __future__ import annotations

import re
from datetime import datetime, timezone
from typing import Any

from redis.asyncio import Redis

from app.config import settings
from app.core.mongo_client import mongo_store
from app.core.redis_client import get_json, invalidate_cache_key, set_json

CONV_MEMORY_TTL = 3600

_POSITION_RE = re.compile(
    r"(AI\s*产品经理|产品经理|后端开发|前端开发|算法工程师|Agent\s*工程师|数据分析师|商业分析|运营|战略咨询|Java\s*开发|Python\s*开发)",
    re.IGNORECASE,
)
_COMPANY_RE = re.compile(r"(字节跳动|字节|腾讯|阿里|阿里巴巴|美团|快手|小红书|百度|华为|京东|拼多多|大厂)")
_METRIC_RE = re.compile(r"\d+(?:\.\d+)?\s*(?:%|倍|万|ms|秒|人|天)")
_PROJECT_RE = re.compile(r"(?:做过|主导|负责|开发了|搭建了)([^，。；！？\n]{4,24})")


def conv_memory_key(user_id: str, scope: str = "copilot") -> str:
    safe_scope = (scope or "copilot").strip().lower()
    return f"memory:conv:{user_id}:{safe_scope}"


def _default_memory_doc(user_id: str, scope: str) -> dict[str, Any]:
    now = datetime.now(timezone.utc).isoformat()
    return {
        "id": conv_memory_key(user_id, scope),
        "user_id": user_id,
        "scope": scope,
        "turn_count": 0,
        "window_limit": settings.CONV_MEMORY_WINDOW_SIZE,
        "recent_turns": [],
        "episodic_summary": {
            "compressed_turns": 0,
            "summary_text": "",
            "milestones": [],
        },
        "user_facts": {
            "target_position": None,
            "target_company": None,
            "claimed_projects": [],
            "claimed_metrics": [],
            "last_need": None,
            "rejected_needs": [],
        },
        "created_at": now,
        "updated_at": now,
    }


def _extract_entities_into_facts(text: str, user_facts: dict[str, Any], *, intent: str | None = None) -> dict[str, Any]:
    cleaned = (text or "").strip()
    if not cleaned:
        return user_facts

    pos_match = _POSITION_RE.search(cleaned)
    if pos_match:
        user_facts["target_position"] = pos_match.group(1).strip()

    comp_match = _COMPANY_RE.search(cleaned)
    if comp_match:
        user_facts["target_company"] = comp_match.group(1).strip()

    for m in _PROJECT_RE.finditer(cleaned):
        proj = m.group(1).strip()
        if proj and proj not in user_facts["claimed_projects"]:
            user_facts["claimed_projects"] = (user_facts["claimed_projects"] + [proj])[-5:]

    for m in _METRIC_RE.finditer(cleaned):
        metric = m.group(0).strip()
        if metric and metric not in user_facts["claimed_metrics"]:
            user_facts["claimed_metrics"] = (user_facts["claimed_metrics"] + [metric])[-6:]

    if intent:
        user_facts["last_need"] = intent

    return user_facts


def _compress_evicted_turn(evicted: dict[str, Any], episodic: dict[str, Any]) -> dict[str, Any]:
    role_lbl = "用户" if evicted.get("role") == "user" else "助手"
    snippet = str(evicted.get("content") or "").strip()[:48]
    intent_str = f"[{evicted.get('intent')}] " if evicted.get("intent") else ""
    milestone = f"#{evicted.get('turn_index', 0)} {role_lbl}: {intent_str}{snippet}"
    milestones = list(episodic.get("milestones") or [])
    milestones.append(milestone)
    milestones = milestones[-10:]
    compressed_count = int(episodic.get("compressed_turns") or 0) + 1
    summary_text = f"早期已完成 {compressed_count} 轮对话，关键脉络：" + " ｜ ".join(milestones[-4:])
    return {
        "compressed_turns": compressed_count,
        "summary_text": summary_text,
        "milestones": milestones,
    }


async def get_conversation_memory(
    redis: Redis,
    user_id: str,
    scope: str = "copilot",
) -> dict[str, Any]:
    key = conv_memory_key(user_id, scope)
    doc = await get_json(redis, key)
    if isinstance(doc, dict) and doc.get("user_id") == user_id:
        return doc
    return _default_memory_doc(user_id, scope)


async def append_conversation_turn(
    redis: Redis,
    user_id: str,
    scope: str = "copilot",
    *,
    role: str,
    content: str,
    intent: str | None = None,
    rejected_need: str | None = None,
    extra_meta: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Append a turn to multi-turn memory, sliding the window and updating MongoDB + Redis cache."""
    doc = await get_conversation_memory(redis, user_id, scope)
    now = datetime.now(timezone.utc).isoformat()
    turn_index = int(doc.get("turn_count") or 0) + 1
    window_limit = int(doc.get("window_limit") or settings.CONV_MEMORY_WINDOW_SIZE or 8)

    user_facts = dict(doc.get("user_facts") or {})
    user_facts.setdefault("claimed_projects", [])
    user_facts.setdefault("claimed_metrics", [])
    user_facts.setdefault("rejected_needs", [])

    if role == "user":
        user_facts = _extract_entities_into_facts(content, user_facts, intent=intent)
    elif intent:
        user_facts["last_need"] = intent

    if rejected_need and rejected_need not in user_facts["rejected_needs"]:
        user_facts["rejected_needs"] = (user_facts["rejected_needs"] + [rejected_need])[-5:]

    turn_entry: dict[str, Any] = {
        "turn_index": turn_index,
        "role": role,
        "content": (content or "").strip()[:600],
        "intent": intent,
        "ts": now,
    }
    if extra_meta:
        turn_entry["meta"] = extra_meta

    recent_turns = list(doc.get("recent_turns") or [])
    recent_turns.append(turn_entry)

    episodic = dict(doc.get("episodic_summary") or {"compressed_turns": 0, "summary_text": "", "milestones": []})
    while len(recent_turns) > window_limit:
        evicted = recent_turns.pop(0)
        episodic = _compress_evicted_turn(evicted, episodic)

    doc.update(
        {
            "turn_count": turn_index,
            "window_limit": window_limit,
            "recent_turns": recent_turns,
            "episodic_summary": episodic,
            "user_facts": user_facts,
            "updated_at": now,
        }
    )

    key = conv_memory_key(user_id, scope)
    await set_json(redis, key, doc, ex=CONV_MEMORY_TTL)
    return doc


async def clear_conversation_memory(
    redis: Redis,
    user_id: str,
    scope: str = "copilot",
) -> dict[str, Any]:
    key = conv_memory_key(user_id, scope)
    await invalidate_cache_key(redis, key)
    await mongo_store.delete_by_cache_key(key)
    fresh = _default_memory_doc(user_id, scope)
    await set_json(redis, key, fresh, ex=CONV_MEMORY_TTL)
    return fresh


def build_multi_turn_context_prompt(memory_doc: dict[str, Any]) -> str:
    """Format the 3-tier memory into a concise prompt context block."""
    facts = memory_doc.get("user_facts") or {}
    episodic = memory_doc.get("episodic_summary") or {}
    recent = memory_doc.get("recent_turns") or []

    parts: list[str] = []
    fact_items: list[str] = []
    if facts.get("target_company"):
        fact_items.append(f"目标企业={facts['target_company']}")
    if facts.get("target_position"):
        fact_items.append(f"目标岗位={facts['target_position']}")
    if facts.get("claimed_projects"):
        fact_items.append(f"提及项目={','.join(facts['claimed_projects'][:2])}")
    if facts.get("claimed_metrics"):
        fact_items.append(f"关键数据={','.join(facts['claimed_metrics'][:3])}")
    if facts.get("last_need"):
        fact_items.append(f"上轮诉求={facts['last_need']}")
    if fact_items:
        parts.append("【跨轮记忆画像】" + "；".join(fact_items))

    if episodic.get("summary_text"):
        parts.append(f"【早期情节摘要】{episodic['summary_text']}")

    if recent:
        turn_lines = [
            f"T{t.get('turn_index')}[{t.get('role')}]: {t.get('content')}"
            for t in recent[-4:]
        ]
        parts.append("【最近对话窗口】" + " / ".join(turn_lines))

    return "\n".join(parts)
