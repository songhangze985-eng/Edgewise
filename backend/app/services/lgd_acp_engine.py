"""ACP / A2A-Compatible Streaming Orchestrator, Urgency Bidding Router & Floor Lock Engine.

Implements Edgewise's recommended LGD real-time multi-agent architecture in-process:
1. Standard ACP/A2A Event Envelope (`edgewise.acp.a2a.v1`):
   - `bidding_round`: Zero-LLM `<1ms` heuristic urgency bidding across 7 candidate sandboxes
   - `seat_state`: Multi-state UI binding (`listening` / `reading` / `bidding` / `thinking` / `speaking` / `interrupted` / `yielding`)
   - `agent_thought_chunk`: Streaming internal monologue & mic-grab intent (`thought`) before speech
   - `agent_message_chunk`: Streaming spoken utterance delta (Markdown-free oral cadence)
   - `turn_aborted`: Instant cancellation (`session/cancel` / `AbortController`) with partial utterance retention
   - `message_final`: Completed ACP/A2A structured `Message` (`parts`: thought + text/plain)
2. Redis + In-Memory Millisecond Floor Lock & Typing Lock (`lgd_lock:{room_id}`):
   - Prevents AI from outrunning human typing (`typing_lock`) and supports instant Barge-in (`grab_mic`).
3. Zero-Dependency Cancellable OpenAI SSE Stream + Seamless Offline Fast-Script Stream Fallback.
"""

from __future__ import annotations

import asyncio
import dataclasses
import json
import math
import re
import threading
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone
from typing import Any, AsyncGenerator
from uuid import uuid4

from app.config import settings
from app.services.lgd_multi_agent import (
    AGENT_SANDBOX_PROFILES,
    CLAIMABLE_IDENTITY_LABELS,
    _normalize_openai_completions_url,
    _synthesize_sandbox_script_line,
    build_isolated_sandbox_context,
    clean_spoken_lgd_text,
    infer_agent_claimed_role,
    resolve_seat_number,
)

ACP_PROTOCOL_VERSION = "edgewise.acp.a2a.v1"

_IDEALISTIC_RE = re.compile(r"理想|弹性|自觉|文化|愿景|赋能|抓手|闭环|全靠|柔性|先试试")
_COST_OR_RISK_RE = re.compile(r"预算|成本|采购|补贴|系统改造|外包|激励|奖金|VR|元宇宙")
_METRIC_RE = re.compile(r"\d+(?:\.\d+)?(?:\s*%|\s*倍|\s*万|\s*天|\s*周|\s*分钟|\s*项)|ROI|准时率|转化率|时延")
_CLASH_RE = re.compile(r"打断|不同意|反对|太理想|流于形式|摸鱼|一刀切|根本推不动|分歧|争论")
_DIGRESS_RE = re.compile(r"纪录片|南极|科考|元宇宙|VR|游戏化公会|跑远了|跑题")

# Script-specific baseline urgency priors (0.0 - 10.0 scale)
_SCRIPT_PRIORS: dict[str, dict[str, float]] = {
    "standard_flow": {
        "ice_breaker": 5.4,
        "idea_king": 5.2,
        "logician": 5.5,
        "interrupter": 5.6,
        "digresser": 4.8,
        "mediator": 5.3,
        "timekeeper": 4.9,
    },
    "werewolf_clash": {
        "interrupter": 6.6,
        "logician": 6.4,
        "mediator": 5.8,
        "ice_breaker": 5.1,
        "idea_king": 4.9,
        "digresser": 4.5,
        "timekeeper": 5.0,
    },
    "convergence_sprint": {
        "digresser": 6.3,
        "timekeeper": 6.5,
        "idea_king": 5.9,
        "ice_breaker": 5.4,
        "logician": 5.3,
        "mediator": 5.0,
        "interrupter": 4.8,
    },
    "memory_adaptive": {
        "mediator": 6.3,
        "logician": 5.9,
        "interrupter": 5.8,
        "ice_breaker": 5.4,
        "timekeeper": 5.3,
        "idea_king": 5.0,
        "digresser": 4.6,
    },
    "anti_teleprompter_probe": {
        "logician": 6.5,
        "interrupter": 6.6,
        "ice_breaker": 5.2,
        "mediator": 5.3,
        "idea_king": 4.8,
        "timekeeper": 5.0,
        "digresser": 4.4,
    },
    "leader_vacancy_brawl": {
        "ice_breaker": 6.4,
        "interrupter": 6.5,
        "logician": 6.1,
        "idea_king": 5.7,
        "mediator": 5.2,
        "timekeeper": 5.0,
        "digresser": 4.5,
    },
}


@dataclasses.dataclass
class ActiveTurnHandle:
    room_id: str
    turn_id: str
    agent_id: str
    phase: str
    started_at: float
    cancel_event: threading.Event = dataclasses.field(default_factory=threading.Event)
    abort_reason: str = ""
    stage: str = "thinking"  # "thinking" | "speaking"


# Ephemeral in-process registries (paired with Redis lock keys for multi-worker coordination)
_ACTIVE_TURNS: dict[str, ActiveTurnHandle] = {}
_MEMORY_LOCKS: dict[str, dict[str, Any]] = {}


# Psycholinguistic persona baseline rates & urgency sensitivities
# Grounded in Gersick (1988) Midpoint Transition + Maule, Hockey & Bdzola (2000) / Lindblom (1990)
_AGENT_SPEECH_TEMPO_PROFILES: dict[str, tuple[float, float, str]] = {
    "ice_breaker": (1.03, 1.00, "稳健清晰"),
    "idea_king": (1.16, 1.05, "轻快跳跃"),
    "logician": (0.95, 0.92, "沉稳严密"),
    "interrupter": (1.24, 1.15, "急促凌厉"),
    "digresser": (0.90, 0.78, "漫游拖沓"),
    "mediator": (0.88, 0.95, "温润舒缓"),
    "timekeeper": (1.10, 1.30, "干脆紧迫"),
}


def _dual_logistic_arousal(elapsed_ratio: float) -> float:
    s1 = 1.0 / (1.0 + math.exp(-10.0 * (elapsed_ratio - 0.50)))
    s2 = 1.0 / (1.0 + math.exp(-18.0 * (elapsed_ratio - 0.80)))
    return 0.12 * s1 + 0.24 * s2


_AROUSAL_ZERO = _dual_logistic_arousal(0.0)


def compute_psycholinguistic_speech_rate(
    agent_id: str,
    *,
    remaining_seconds: int = 300,
    total_phase_seconds: int = 600,
    phase: str = "free_discussion",
) -> dict[str, Any]:
    """Compute persona-differentiated speech rate & deadline urgency acceleration."""
    base_rate, sens, persona = _AGENT_SPEECH_TEMPO_PROFILES.get(
        agent_id, (1.02, 1.0, "稳健清晰")
    )
    safe_total = max(30, int(total_phase_seconds or 600))
    safe_rem = max(0, min(safe_total, int(remaining_seconds if remaining_seconds is not None else safe_total)))
    elapsed = 0.0 if phase == "reading" else max(0.0, min(1.0, 1.0 - safe_rem / safe_total))
    raw_gain = max(0.0, _dual_logistic_arousal(elapsed) - _AROUSAL_ZERO)
    phase_mod = 1.0 if phase == "free_discussion" else (0.85 if phase == "summary_report" else 0.65)
    urgency_gain = raw_gain * sens * phase_mod
    effective_rate = round(max(0.84, min(1.65, base_rate * (1.0 + urgency_gain))), 2)
    stage = (
        "deadline_sprint"
        if elapsed >= 0.80
        else "midpoint_shift"
        if elapsed >= 0.50
        else "baseline"
    )
    return {
        "base_rate": base_rate,
        "effective_rate": effective_rate,
        "tempo_persona": persona,
        "tempo_stage": stage,
        "accelerated": elapsed >= 0.50,
    }


def make_acp_event(event_type: str, **payload: Any) -> dict[str, Any]:
    """Construct a standardized ACP/A2A streaming event dictionary."""
    return {
        "protocol": ACP_PROTOCOL_VERSION,
        "type": event_type,
        "ts": datetime.now(timezone.utc).isoformat(),
        **payload,
    }


def format_sse_frame(event: dict[str, Any]) -> str:
    """Serialize an ACP event dict as a Server-Sent Events `data:` frame."""
    return f"data: {json.dumps(event, ensure_ascii=False)}\n\n"


def _lock_redis_key(room_id: str) -> str:
    return f"lgd_lock:{room_id}"


async def acquire_floor_lock(
    room_id: str,
    *,
    holder: str = "user",
    mode: str = "typing_lock",
    ttl_seconds: int = 15,
    interrupt_speaking: bool = False,
    redis: Any | None = None,
) -> dict[str, Any]:
    """Acquire human priority lock (Typing Lock or Hard Barge-in Mic Lock).

    - If `interrupt_speaking=True` (e.g. `grab_mic` or `vad_start`), aborts any active AI turn immediately.
    - If `interrupt_speaking=False` (e.g. `typing_start`), aborts an AI turn ONLY if it is still in `thinking`
      (before first spoken token) and suspends future AI bidding for `ttl_seconds`.
    """
    now_mono = time.monotonic()
    ttl = max(3, min(60, int(ttl_seconds)))
    lock_record = {
        "room_id": room_id,
        "locked": True,
        "holder": holder,
        "mode": mode,
        "ttl_seconds": ttl,
        "expires_mono": now_mono + ttl,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    _MEMORY_LOCKS[room_id] = lock_record

    if redis is not None:
        try:
            redis_payload = {k: v for k, v in lock_record.items() if k != "expires_mono"}
            await redis.set(_lock_redis_key(room_id), json.dumps(redis_payload, ensure_ascii=False), ex=ttl)
        except Exception:
            pass

    aborted_turn = None
    active = _ACTIVE_TURNS.get(room_id)
    if active and not active.cancel_event.is_set():
        if interrupt_speaking or active.stage == "thinking":
            active.abort_reason = mode
            active.cancel_event.set()
            aborted_turn = {
                "turn_id": active.turn_id,
                "agent_id": active.agent_id,
                "aborted_stage": active.stage,
            }

    return {
        "room_id": room_id,
        "locked": True,
        "holder": holder,
        "mode": mode,
        "ttl_seconds": ttl,
        "aborted_turn": aborted_turn,
    }


async def release_floor_lock(
    room_id: str,
    *,
    redis: Any | None = None,
) -> dict[str, Any]:
    """Release human typing/mic lock so AI urgency bidding can resume."""
    _MEMORY_LOCKS.pop(room_id, None)
    if redis is not None:
        try:
            if hasattr(redis, "delete"):
                await redis.delete(_lock_redis_key(room_id))
        except Exception:
            pass
    return {"room_id": room_id, "locked": False}


async def get_floor_lock_state(
    room_id: str,
    *,
    redis: Any | None = None,
) -> dict[str, Any]:
    """Check whether a human priority floor lock or typing lock is currently active."""
    now_mono = time.monotonic()
    mem = _MEMORY_LOCKS.get(room_id)
    if mem:
        if mem.get("expires_mono", 0) > now_mono:
            rem = round(mem["expires_mono"] - now_mono, 1)
            return {
                "room_id": room_id,
                "locked": True,
                "holder": mem.get("holder", "user"),
                "mode": mem.get("mode", "typing_lock"),
                "remaining_seconds": rem,
            }
        _MEMORY_LOCKS.pop(room_id, None)

    if redis is not None:
        try:
            raw = await redis.get(_lock_redis_key(room_id))
            if raw:
                parsed = json.loads(raw) if isinstance(raw, str) else raw
                if isinstance(parsed, dict) and parsed.get("locked"):
                    return {
                        "room_id": room_id,
                        "locked": True,
                        "holder": parsed.get("holder", "user"),
                        "mode": parsed.get("mode", "typing_lock"),
                        "remaining_seconds": parsed.get("ttl_seconds", 10),
                    }
        except Exception:
            pass

    return {"room_id": room_id, "locked": False, "holder": None, "mode": None, "remaining_seconds": 0}


def abort_active_room_turn(room_id: str, reason: str = "user_barge_in") -> dict[str, Any] | None:
    """Explicitly cancel an active in-flight ACP turn for `room_id`."""
    active = _ACTIVE_TURNS.get(room_id)
    if active and not active.cancel_event.is_set():
        active.abort_reason = reason
        active.cancel_event.set()
        return {
            "turn_id": active.turn_id,
            "agent_id": active.agent_id,
            "aborted_stage": active.stage,
            "reason": reason,
        }
    return None


def build_reading_warmup_stances(
    topic: str,
    material: str | None = None,
    *,
    seat_map: dict[str, int] | None = None,
    identity_mode: str = "random",
    participant_roles: dict[str, str] | None = None,
) -> list[dict[str, Any]]:
    """Generate lightweight initial reading-phase stance cards for all 7 AI seats."""
    short_topic = (topic or "远程团队协作效率提升方案")[:18]
    stance_templates = {
        "ice_breaker": f"正在拆解「{short_topic}」问题边界，准备按痛点/方案/指标三段立框…",
        "idea_king": f"正在构思「{short_topic}」的低成本异步化与创新抓手…",
        "logician": "正在梳理投入产出比（ROI）与量化验收指标口径…",
        "interrupter": "正在审视常见理想化盲区，准备质询执行责任人与刚性红线…",
        "digresser": "正在联想跨行业极端协同案例，准备切入侧翼视角…",
        "mediator": "正在预判效率与成本潜在冲突，准备搭建分阶段折中框架…",
        "timekeeper": "正在规划个人陈述与自由讨论的时间切分节点…",
    }
    cards: list[dict[str, Any]] = []
    for agent_id, profile in AGENT_SANDBOX_PROFILES.items():
        seat_num = resolve_seat_number(agent_id, seat_map)
        role_key = ((participant_roles or {}).get(agent_id) or "").strip().lower()
        if identity_mode == "undetermined" and (not role_key or role_key == "undetermined"):
            role_label = "待定"
        elif role_key in CLAIMABLE_IDENTITY_LABELS:
            role_label = CLAIMABLE_IDENTITY_LABELS[role_key]
        else:
            role_label = profile["role"]
        cards.append(
            {
                "agent_id": agent_id,
                "seat": seat_num,
                "name": profile["name"],
                "role": role_label,
                "ui_state": "reading",
                "thought": stance_templates.get(agent_id, "正在审题记笔记…"),
            }
        )
    cards.sort(key=lambda c: c["seat"])
    return cards


def _synthesize_agent_thought(
    agent_id: str,
    *,
    phase: str,
    intent: str,
    last_speaker_name: str | None,
    topic: str,
) -> str:
    """Synthesize a crisp, natural ACP internal `thought` before speaking."""
    profile = AGENT_SANDBOX_PROFILES.get(agent_id) or AGENT_SANDBOX_PROFILES["ice_breaker"]
    ref = f"听完{last_speaker_name}的发言，" if last_speaker_name else ""
    short_topic = (topic or "当前议题")[:12]

    if phase == "personal_statement":
        thoughts = {
            "ice_breaker": f"首轮陈述，先给「{short_topic}」立住三层分析框架。",
            "idea_king": f"{ref}补充一个差异化的异步创新抓手。",
            "logician": f"{ref}强调所有方案必须绑定可量化指标，并交棒4号。",
            "interrupter": f"{ref}观点偏温和，我要指出缺乏硬性考核红线的漏洞。",
            "digresser": f"{ref}联想到一个跨界案例，试着类比切入。",
            "mediator": f"{ref}把前面刚性与柔性的分歧桥接起来。",
            "timekeeper": "陈述临近收尾，提醒全组盯紧自由讨论时间窗口。",
        }
        return thoughts.get(agent_id, f"{profile['name']}正在组织个人陈述要点…")

    if phase == "summary_report":
        return f"快速整合本组已达成共识、核心指标与待验证分歧，按金字塔结构汇报。"

    return f"{ref}{intent}，准备切入发言…"


def compute_urgency_bids(
    *,
    transcript: list[dict[str, Any]] | None = None,
    script_id: str = "standard_flow",
    remaining_seconds: int = 420,
    total_phase_seconds: int = 600,
    memory_state: dict[str, Any] | None = None,
    turn_index: int = 0,
    seat_map: dict[str, int] | None = None,
    identity_mode: str = "random",
    participant_roles: dict[str, str] | None = None,
    visual_board_summary: str | None = None,
) -> list[dict[str, Any]]:
    """Compute `<1ms` Zero-Token Heuristic Urgency Bids across all 7 AI candidates.

    Eliminates 7x LLM bidding calls per turn while making free-discussion turn-taking
    react authentically to semantics, clashes, silence, and countdown pressure.
    """
    public_msgs = [
        m
        for m in (transcript or [])
        if m.get("role") != "system" and not m.get("isSystem") and (m.get("text") or m.get("content"))
    ]
    priors = _SCRIPT_PRIORS.get(script_id) or _SCRIPT_PRIORS["standard_flow"]
    user_seat = resolve_seat_number("user", seat_map)
    digresser_seat = resolve_seat_number("digresser", seat_map)

    last_msg = public_msgs[-1] if public_msgs else None
    last_text = str((last_msg or {}).get("text") or (last_msg or {}).get("content") or "").strip()
    last_sender_id = (last_msg or {}).get("senderId") or ""
    last_is_user = bool((last_msg or {}).get("isUser") or (last_msg or {}).get("role") == "user" or last_sender_id == "user")
    last_speaker_name = (
        f"{user_seat}号同学"
        if last_is_user
        else ((last_msg or {}).get("speaker") or (last_msg or {}).get("senderName") or None)
    )

    # Speak count & recency tracking
    speak_counts: dict[str, int] = {aid: 0 for aid in AGENT_SANDBOX_PROFILES}
    turns_since_user = 0
    turns_since_timekeeper = 0
    recent_clash_hits = 0

    for idx, msg in enumerate(reversed(public_msgs)):
        sid = msg.get("senderId") or ""
        txt = str(msg.get("text") or msg.get("content") or "")
        if sid in speak_counts:
            speak_counts[sid] += 1
        if idx < 2 and _CLASH_RE.search(txt):
            recent_clash_hits += 1

    for msg in reversed(public_msgs):
        if msg.get("isUser") or msg.get("role") == "user" or msg.get("senderId") == "user":
            break
        turns_since_user += 1

    for msg in reversed(public_msgs):
        if msg.get("senderId") == "timekeeper" or msg.get("speaker") == "刘时":
            break
        turns_since_timekeeper += 1

    total_sec = max(60, int(total_phase_seconds or 600))
    rem_ratio = max(0.0, min(1.0, float(remaining_seconds) / total_sec))
    elapsed_ratio = 1.0 - rem_ratio
    any_criteria = bool(visual_board_summary and "标准:" in visual_board_summary) or any(
        re.search(r"标准|权重|维度|原则|先定", str(m.get("text") or m.get("content") or ""))
        for m in public_msgs
    )

    weak_dims = (memory_state or {}).get("weak_dimensions") or [] if (memory_state or {}).get("memory_enabled", True) else []

    has_metric = bool(_METRIC_RE.search(last_text))
    is_idealistic = bool(_IDEALISTIC_RE.search(last_text))
    has_cost = bool(_COST_OR_RISK_RE.search(last_text))
    is_digressing = last_sender_id == "digresser" or bool(_DIGRESS_RE.search(last_text))

    bids: list[dict[str, Any]] = []

    for agent_id, profile in AGENT_SANDBOX_PROFILES.items():
        seat_num = resolve_seat_number(agent_id, seat_map)
        score = float(priors.get(agent_id, 5.0))
        intent = "顺承讨论脉络补充核心抓手"

        # 1. Fairness decay + Deterministic micro-tiebreaker by turn_index & seat
        score -= min(1.8, speak_counts.get(agent_id, 0) * 0.38)
        score += ((turn_index * 3 + seat_num) % 5) * 0.07

        # 1B. 2:6:2 Golden Ratio Front 20%: Propose evaluation criteria before jumping to options
        if elapsed_ratio < 0.20 and not any_criteria and agent_id in ("ice_breaker", "logician"):
            score += 0.65
            intent = "黄金2:6:2前20%·提议先立评判标准再谈选项"

        # 2. Opening turn of free discussion: Ice-breaker frames agenda (unless brawl script)
        if len(public_msgs) == 0 or (turn_index == 0 and last_sender_id not in ("ice_breaker", "user")):
            if agent_id == "ice_breaker" and script_id != "leader_vacancy_brawl":
                score += 2.6
                intent = "自由讨论开场立框·对齐优先级标准"

        # 3. Countdown pressure boosts Timekeeper
        if agent_id == "timekeeper":
            if rem_ratio <= 0.25 and turns_since_timekeeper >= 1:
                score += 3.9
                intent = "剩余时间不足25%·紧急催促收敛定稿"
            elif rem_ratio <= 0.50 and turns_since_timekeeper >= 3:
                score += 2.6
                intent = "半场时间节点预警·推进阶段小结"

        # 4. Semantic audit boosts Interrupter & Logician
        if last_text:
            if agent_id == "interrupter" and (is_idealistic or has_cost or (last_is_user and not has_metric)):
                score += 2.9 if last_is_user else 2.2
                intent = "抓住理想化/成本漏洞·质询刚性责任与淘汰红线"
            if agent_id == "logician" and ((not has_metric and len(last_text) > 12) or has_cost):
                score += 2.6
                intent = "审计逻辑因果链·追问ROI与可量化验收指标"

        # 5. Conflict synthesis & Silent-user cueing boosts Mediator
        if agent_id == "mediator":
            if recent_clash_hits >= 1 and last_sender_id in ("interrupter", "logician"):
                score += 3.1
                intent = "调解场上刚性冲突·搭建短期试点与长期机制折中桥"
            elif turns_since_user >= 3 or (weak_dims and turns_since_user >= 2):
                score += 2.7
                intent = f"察觉{user_seat}号发言空窗·主动桥接并点名邀请{user_seat}号破局"

        # 6. Drift pullback right after Digresser
        if is_digressing and agent_id in ("ice_breaker", "logician", "timekeeper"):
            score += 2.4
            intent = f"识别{digresser_seat}号边缘发散·温和拉回核心讨论主线"

        # 7. Controlled divergence in sprint/early discussion
        if rem_ratio > 0.40 and turn_index > 0 and turn_index % 3 == 2:
            if agent_id == "digresser" and speak_counts["digresser"] == 0:
                score += 2.3
                intent = "抛出跨界边缘类比·测试小组纠偏控场力"
            elif agent_id == "idea_king" and speak_counts["idea_king"] <= 1:
                score += 1.9
                intent = "注入反常规创新抓手·激活方案差异化"

        # 8. Strict cooldown: never let the exact same AI speak twice in a row
        if agent_id == last_sender_id:
            score = 0.25
            intent = "刚完成发言·静默倾听队友回应"

        urgency = round(max(0.1, min(9.9, score)), 2)
        role_key = ((participant_roles or {}).get(agent_id) or "").strip().lower()
        planned_claim_key = None
        if identity_mode == "undetermined" and (not role_key or role_key == "undetermined"):
            planned_claim_key, planned_claim_label = infer_agent_claimed_role(
                agent_id,
                participant_roles=participant_roles,
                phase="free_discussion",
            )
            display_role = f"待定→{planned_claim_label}"
        elif role_key in CLAIMABLE_IDENTITY_LABELS:
            display_role = CLAIMABLE_IDENTITY_LABELS[role_key]
        else:
            display_role = profile["role"]

        bids.append(
            {
                "agent_id": agent_id,
                "seat": seat_num,
                "name": profile["name"],
                "role": display_role,
                "planned_claim_role": planned_claim_key,
                "urgency": urgency,
                "intent": intent,
                "thought_preview": _synthesize_agent_thought(
                    agent_id,
                    phase="free_discussion",
                    intent=intent,
                    last_speaker_name=last_speaker_name,
                    topic="",
                ),
            }
        )

    bids.sort(key=lambda item: item["urgency"], reverse=True)
    for rank, item in enumerate(bids, start=1):
        item["queue_rank"] = rank
    return bids


def _split_oral_phrases(text: str) -> list[str]:
    """Split a line into natural streaming phrases (4–12 chars) for smooth ACP delta delivery."""
    if not text:
        return []
    tokens: list[str] = []
    buf = ""
    for ch in text:
        buf += ch
        if ch in "，。！？；：、" or len(buf) >= 9:
            tokens.append(buf)
            buf = ""
    if buf:
        tokens.append(buf)
    return tokens


def _stream_openai_sse_worker(
    *,
    url: str,
    api_key: str,
    model: str,
    messages: list[dict[str, str]],
    cancel_event: threading.Event,
    loop: asyncio.AbstractEventLoop,
    out_queue: asyncio.Queue[tuple[str, Any]],
) -> None:
    """Background worker reading OpenAI-compatible `stream=True` SSE lines with instant cancel."""
    body = json.dumps(
        {
            "model": model,
            "messages": messages,
            "temperature": 0.68,
            "max_tokens": 200,
            "stream": True,
        }
    ).encode("utf-8")

    req = urllib.request.Request(
        url,
        data=body,
        headers={
            "Content-Type": "application/json",
            "Accept": "text/event-stream",
            "Authorization": f"Bearer {api_key}",
        },
        method="POST",
    )

    try:
        with urllib.request.urlopen(req, timeout=10.0) as resp:
            for raw_line in resp:
                if cancel_event.is_set():
                    break
                line = raw_line.decode("utf-8", errors="ignore").strip()
                if not line or not line.startswith("data:"):
                    continue
                data_str = line[5:].strip()
                if data_str == "[DONE]":
                    break
                try:
                    pkt = json.loads(data_str)
                except json.JSONDecodeError:
                    continue
                choices = pkt.get("choices")
                if not isinstance(choices, list) or not choices:
                    continue
                delta_obj = choices[0].get("delta") or {}
                reasoning = delta_obj.get("reasoning_content") or ""
                content_piece = delta_obj.get("content") or ""
                if reasoning:
                    loop.call_soon_threadsafe(out_queue.put_nowait, ("reasoning", str(reasoning)))
                if content_piece:
                    loop.call_soon_threadsafe(out_queue.put_nowait, ("delta", str(content_piece)))
        loop.call_soon_threadsafe(out_queue.put_nowait, ("done", None))
    except Exception as exc:
        loop.call_soon_threadsafe(out_queue.put_nowait, ("error", str(exc)))


async def stream_acp_agent_turn(
    *,
    room_id: str,
    agent_id: str | None = None,
    topic: str = "远程团队协作效率提升方案",
    material: str | None = None,
    phase: str = "free_discussion",
    transcript: list[dict[str, Any]] | None = None,
    script_id: str = "standard_flow",
    memory_state: dict[str, Any] | None = None,
    remaining_seconds: int = 420,
    total_phase_seconds: int = 600,
    turn_index: int = 0,
    api_mode: str = "hybrid_sandbox",
    api_key_override: str | None = None,
    base_url_override: str | None = None,
    model_override: str | None = None,
    seat_map: dict[str, int] | None = None,
    identity_mode: str = "random",
    participant_roles: dict[str, str] | None = None,
    visual_board_summary: str | None = None,
    redis: Any | None = None,
    chunk_delay_sec: float = 0.035,
    external_cancel: threading.Event | None = None,
) -> AsyncGenerator[dict[str, Any], None]:
    """Stream a complete ACP/A2A LGD turn (`bidding` -> `thought` -> `message` -> `final` / `aborted`)."""
    # 0. Respect human priority floor/typing lock in free_discussion
    if phase == "free_discussion":
        lock_state = await get_floor_lock_state(room_id, redis=redis)
        if lock_state.get("locked"):
            yield make_acp_event(
                "lock_state",
                room_id=room_id,
                locked=True,
                holder=lock_state.get("holder", "user"),
                mode=lock_state.get("mode", "typing_lock"),
                remaining_seconds=lock_state.get("remaining_seconds", 10),
            )
            return

    # 1. Urgency Bidding (when `agent_id` is omitted or in `free_discussion`)
    chosen_intent = "结合上下文推进讨论"
    bidding_top: list[dict[str, Any]] = []
    if not agent_id or phase == "free_discussion":
        bids = compute_urgency_bids(
            transcript=transcript or [],
            script_id=script_id,
            remaining_seconds=remaining_seconds,
            total_phase_seconds=total_phase_seconds,
            memory_state=memory_state,
            turn_index=turn_index,
            seat_map=seat_map,
            identity_mode=identity_mode,
            participant_roles=participant_roles,
            visual_board_summary=visual_board_summary,
        )
        bidding_top = bids[:4]
        if not agent_id:
            winner = bids[0]
            agent_id = winner["agent_id"]
            chosen_intent = winner["intent"]
        else:
            matched = next((b for b in bids if b["agent_id"] == agent_id), None)
            if matched:
                chosen_intent = matched["intent"]

        if phase == "free_discussion":
            winner_row = next((b for b in bids if b["agent_id"] == agent_id), bids[0])
            yield make_acp_event(
                "bidding_round",
                room_id=room_id,
                winner_agent_id=winner_row["agent_id"],
                winner_seat=winner_row["seat"],
                winner_name=winner_row["name"],
                winner_role=winner_row["role"],
                urgency=winner_row["urgency"],
                intent=winner_row["intent"],
                candidates=bidding_top[:3],
                speaker_queue=bidding_top,
            )

    target_agent = agent_id or "ice_breaker"
    turn_id = f"turn-{uuid4().hex[:10]}"
    handle = ActiveTurnHandle(
        room_id=room_id,
        turn_id=turn_id,
        agent_id=target_agent,
        phase=phase,
        started_at=time.monotonic(),
    )
    if external_cancel is not None and external_cancel.is_set():
        handle.cancel_event.set()
    _ACTIVE_TURNS[room_id] = handle

    def _is_cancelled() -> bool:
        return handle.cancel_event.is_set() or (external_cancel is not None and external_cancel.is_set())

    try:
        sandbox = build_isolated_sandbox_context(
            target_agent,
            topic=topic,
            material=material,
            phase=phase,
            transcript=transcript or [],
            script_id=script_id,
            memory_state=memory_state,
            seat_map=seat_map,
            identity_mode=identity_mode,
            participant_roles=participant_roles,
            visual_board_summary=visual_board_summary,
        )
        seat_num = sandbox["seat_number"]
        user_seat = sandbox.get("user_seat", 4)
        agent_name = sandbox["agent_name"]
        agent_role = sandbox["agent_role"]
        claimed_role = sandbox.get("claimed_role")
        claimed_role_label = sandbox.get("claimed_role_label")

        last_speaker = None
        if sandbox["visible_window"]:
            last_item = sandbox["visible_window"][-1]
            last_speaker = f"{user_seat}号同学" if last_item.get("isUser") or last_item.get("role") == "user" else (
                last_item.get("speaker") or last_item.get("senderName")
            )

        synthesized_thought = _synthesize_agent_thought(
            target_agent,
            phase=phase,
            intent=chosen_intent,
            last_speaker_name=last_speaker,
            topic=topic,
        )

        tempo_info = compute_psycholinguistic_speech_rate(
            target_agent,
            remaining_seconds=remaining_seconds,
            total_phase_seconds=total_phase_seconds,
            phase=phase,
        )

        # 2. Emit `thinking` seat UI state
        yield make_acp_event(
            "seat_state",
            room_id=room_id,
            turn_id=turn_id,
            agent_id=target_agent,
            seat=seat_num,
            ui_state="thinking",
            speech_tempo=tempo_info,
        )

        api_key = "" if api_mode == "fast_script_only" else (api_key_override or settings.LGD_LLM_API_KEY or "").strip()
        base_url = (base_url_override or settings.LGD_LLM_BASE_URL or "https://api.openai.com/v1").strip()
        model = (model_override or settings.LGD_LLM_MODEL or "gpt-4o-mini").strip()

        thought_acc = ""
        spoken_acc = ""
        engine_source = "acp_sandbox_fast_script"
        emitted_speaking_state = False

        # 3A. Live OpenAI-Compatible Streaming Path (if API key configured)
        if api_key:
            try:
                norm_url = _normalize_openai_completions_url(base_url)
                llm_messages = list(sandbox["perspective_messages"]) + [
                    {
                        "role": "user",
                        "content": (
                            f"当前阶段：{phase}；你的抢麦意图：{chosen_intent}。\n"
                            "请先用 `[思考：18字以内心理活动]` 简短写出接话切入点，换行后直接输出自然口语发言"
                            "（60-95字，严禁使用Markdown标题、星号或数字列表）："
                        ),
                    }
                ]
                q: asyncio.Queue[tuple[str, Any]] = asyncio.Queue()
                loop = asyncio.get_running_loop()
                worker = threading.Thread(
                    target=_stream_openai_sse_worker,
                    kwargs={
                        "url": norm_url,
                        "api_key": api_key,
                        "model": model,
                        "messages": llm_messages,
                        "cancel_event": handle.cancel_event,
                        "loop": loop,
                        "out_queue": q,
                    },
                    daemon=True,
                )
                worker.start()

                raw_buf = ""
                in_bracket_thought = False
                thought_done = False

                while True:
                    if _is_cancelled():
                        handle.cancel_event.set()
                        break
                    try:
                        kind, val = await asyncio.wait_for(q.get(), timeout=0.15)
                    except asyncio.TimeoutError:
                        continue

                    if kind == "done":
                        break
                    if kind == "error":
                        if not spoken_acc:
                            raw_buf = ""
                        break
                    if kind == "reasoning":
                        thought_acc += val
                        yield make_acp_event(
                            "agent_thought_chunk",
                            room_id=room_id,
                            turn_id=turn_id,
                            agent_id=target_agent,
                            seat=seat_num,
                            delta=val,
                            thought=thought_acc,
                        )
                        continue

                    if kind == "delta":
                        raw_buf += val
                        # Parse optional leading `[思考：...]` prefix cleanly
                        if not thought_done:
                            stripped_lead = raw_buf.lstrip()
                            if stripped_lead.startswith("[思考") or stripped_lead.startswith("【思考"):
                                in_bracket_thought = True
                                end_idx = -1
                                for closer in ("]", "】", "\n"):
                                    pos = stripped_lead.find(closer)
                                    if pos != -1:
                                        end_idx = pos
                                        break
                                if end_idx == -1:
                                    inner = re.sub(r"^[\[【]思考[：:]?\s*", "", stripped_lead)
                                    if inner and inner != thought_acc:
                                        delta_t = inner[len(thought_acc) :]
                                        thought_acc = inner
                                        if delta_t:
                                            yield make_acp_event(
                                                "agent_thought_chunk",
                                                room_id=room_id,
                                                turn_id=turn_id,
                                                agent_id=target_agent,
                                                seat=seat_num,
                                                delta=delta_t,
                                                thought=thought_acc,
                                            )
                                    continue
                                else:
                                    header_part = stripped_lead[:end_idx]
                                    inner = re.sub(r"^[\[【]思考[：:]?\s*", "", header_part).strip()
                                    if inner:
                                        delta_t = inner[len(thought_acc) :]
                                        thought_acc = inner
                                        if delta_t:
                                            yield make_acp_event(
                                                "agent_thought_chunk",
                                                room_id=room_id,
                                                turn_id=turn_id,
                                                agent_id=target_agent,
                                                seat=seat_num,
                                                delta=delta_t,
                                                thought=thought_acc,
                                            )
                                    raw_buf = stripped_lead[end_idx + 1 :].lstrip("\n ：:")
                                    thought_done = True
                                    in_bracket_thought = False
                            elif len(stripped_lead) >= 4:
                                # Model started speaking directly without bracketed thought
                                if not thought_acc:
                                    thought_acc = synthesized_thought
                                    yield make_acp_event(
                                        "agent_thought_chunk",
                                        room_id=room_id,
                                        turn_id=turn_id,
                                        agent_id=target_agent,
                                        seat=seat_num,
                                        delta=thought_acc,
                                        thought=thought_acc,
                                    )
                                thought_done = True

                        if thought_done and raw_buf and not in_bracket_thought:
                            if not emitted_speaking_state:
                                handle.stage = "speaking"
                                emitted_speaking_state = True
                                yield make_acp_event(
                                    "seat_state",
                                    room_id=room_id,
                                    turn_id=turn_id,
                                    agent_id=target_agent,
                                    seat=seat_num,
                                    ui_state="speaking",
                                )
                            cleaned_now = clean_spoken_lgd_text(
                                spoken_acc + raw_buf,
                                max_chars=140,
                                strip_trailing=False,
                            )
                            raw_buf = ""
                            if len(cleaned_now) > len(spoken_acc):
                                piece = cleaned_now[len(spoken_acc) :]
                                spoken_acc = cleaned_now
                                engine_source = "acp_llm_stream"
                                yield make_acp_event(
                                    "agent_message_chunk",
                                    room_id=room_id,
                                    turn_id=turn_id,
                                    agent_id=target_agent,
                                    seat=seat_num,
                                    agent_name=agent_name,
                                    agent_role=agent_role,
                                    delta=piece,
                                    accumulated=spoken_acc,
                                )
            except Exception:
                pass

        # 3B. Seamless Offline Fast-Training ACP Stream Fallback (when no API key or upstream failed before speaking)
        if not spoken_acc and not _is_cancelled():
            thought_pieces = _split_oral_phrases(synthesized_thought)
            for tp in thought_pieces:
                if _is_cancelled():
                    break
                thought_acc += tp
                yield make_acp_event(
                    "agent_thought_chunk",
                    room_id=room_id,
                    turn_id=turn_id,
                    agent_id=target_agent,
                    seat=seat_num,
                    delta=tp,
                    thought=thought_acc,
                )
                if chunk_delay_sec > 0:
                    await asyncio.sleep(chunk_delay_sec * 0.8)

            if not _is_cancelled():
                script_line = _synthesize_sandbox_script_line(
                    sandbox,
                    phase=phase,
                    topic=topic,
                    turn_index=turn_index,
                )
                cleaned_line = clean_spoken_lgd_text(script_line, max_chars=135)
                handle.stage = "speaking"
                emitted_speaking_state = True
                yield make_acp_event(
                    "seat_state",
                    room_id=room_id,
                    turn_id=turn_id,
                    agent_id=target_agent,
                    seat=seat_num,
                    ui_state="speaking",
                )

                for chunk in _split_oral_phrases(cleaned_line):
                    if _is_cancelled():
                        break
                    spoken_acc += chunk
                    yield make_acp_event(
                        "agent_message_chunk",
                        room_id=room_id,
                        turn_id=turn_id,
                        agent_id=target_agent,
                        seat=seat_num,
                        agent_name=agent_name,
                        agent_role=agent_role,
                        delta=chunk,
                        accumulated=spoken_acc,
                    )
                    if chunk_delay_sec > 0:
                        await asyncio.sleep(chunk_delay_sec)

        # 4. Handle Barge-In / Cancellation vs Normal Completion
        if _is_cancelled():
            yield make_acp_event(
                "seat_state",
                room_id=room_id,
                turn_id=turn_id,
                agent_id=target_agent,
                seat=seat_num,
                ui_state="interrupted" if spoken_acc else "listening",
            )
            yield make_acp_event(
                "turn_aborted",
                room_id=room_id,
                turn_id=turn_id,
                agent_id=target_agent,
                seat=seat_num,
                agent_name=agent_name,
                agent_role=agent_role,
                reason=handle.abort_reason or "client_cancelled",
                partial_content=spoken_acc,
                thought=thought_acc,
            )
            return

        final_text = clean_spoken_lgd_text(spoken_acc, max_chars=135)
        acp_message = {
            "role": "agent",
            "parts": [
                {
                    "content_type": "text/thought",
                    "content": thought_acc or synthesized_thought,
                    "metadata": {"intent": chosen_intent, "seat": seat_num},
                },
                {
                    "content_type": "text/plain",
                    "content": final_text,
                    "metadata": {
                        "sender": target_agent,
                        "sender_name": agent_name,
                        "sender_role": agent_role,
                        "seat": seat_num,
                        "phase": phase,
                        "sandbox_id": sandbox["sandbox_id"],
                    },
                },
            ],
        }

        yield make_acp_event(
            "message_final",
            room_id=room_id,
            turn_id=turn_id,
            agent_id=target_agent,
            seat=seat_num,
            agent_name=agent_name,
            agent_role=agent_role,
            claimed_role=claimed_role,
            claimed_role_label=claimed_role_label,
            sandbox_id=sandbox["sandbox_id"],
            context_limit=sandbox["context_limit"],
            visible_context_count=sandbox["visible_context_count"],
            script_badge=sandbox["script_badge"],
            weakness_focus=sandbox["weakness_focus"],
            engine_source=engine_source,
            intent=chosen_intent,
            thought=thought_acc or synthesized_thought,
            content=final_text,
            audience_scope="all_participants",
            speech_tempo=tempo_info,
            message=acp_message,
        )
        yield make_acp_event(
            "seat_state",
            room_id=room_id,
            turn_id=turn_id,
            agent_id=target_agent,
            seat=seat_num,
            ui_state="listening",
        )
    finally:
        if _ACTIVE_TURNS.get(room_id) is handle:
            _ACTIVE_TURNS.pop(room_id, None)
