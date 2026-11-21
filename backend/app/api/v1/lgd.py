from __future__ import annotations

import random
import threading
from datetime import datetime, timezone
from typing import Any
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from redis.asyncio import Redis

from app.api.deps import get_current_user, get_redis
from app.core.index_store import get_all_lgd_room_ids, index_add_lgd_room_id
from app.core.redis_client import get_json, set_json
from app.models.schemas import LgdParticipant, LgdRoomCreate, LgdRoomResponse, UserInDB
from app.services.lgd_acp_engine import (
    ACP_PROTOCOL_VERSION,
    abort_active_room_turn,
    acquire_floor_lock,
    build_reading_warmup_stances,
    compute_urgency_bids,
    format_sse_frame,
    get_floor_lock_state,
    release_floor_lock,
    stream_acp_agent_turn,
)
from app.services.lgd_multi_agent import (
    AGENT_SANDBOX_PROFILES,
    FAST_TRAINING_SCRIPTS,
    SEAT_ORDER,
    generate_lgd_agent_turn,
)
from app.services.lgd_observer import evaluate_utterance_side_channel
from app.services.lgd_scorer import score_lgd_discussion
from app.services.lgd_topics import build_phases, get_topic_by_id, load_lgd_topics

router = APIRouter(prefix="/lgd", tags=["lgd"])

DEFAULT_AGENTS = [
    "破冰者",
    "点子王",
    "逻辑王",
    "抢话者",
    "跑题者",
    "和事佬",
    "计时员",
]

USER_ROLES = ("leader", "timekeeper", "reporter", "member")
EXTENDED_ROLES = ("undetermined", "leader", "framework", "analyst", "timekeeper", "coordinator", "challenger", "reporter", "member")


def _resolve_user_role(payload: LgdRoomCreate) -> str:
    mode = (payload.role_mode or "pick").strip().lower()
    role = (payload.user_role or "member").strip().lower()
    if mode == "undetermined" or role == "undetermined":
        return "undetermined"
    if mode == "random":
        return random.choice(USER_ROLES)
    if role not in EXTENDED_ROLES:
        return "member"
    return role


def _resolve_topic(payload: LgdRoomCreate) -> tuple[str, str | None, str | None, str | None]:
    if payload.topic_id:
        entry = get_topic_by_id(payload.topic_id)
        if entry:
            return (
                entry.get("title") or payload.topic,
                entry.get("material") or payload.material,
                payload.topic_id,
                entry.get("topic_type") or payload.topic_type,
            )
    return payload.topic, payload.material, payload.topic_id, payload.topic_type


def _build_room_record(payload: LgdRoomCreate, current_user: UserInDB) -> dict:
    now = datetime.now(timezone.utc).isoformat()
    participant = LgdParticipant(user_id=current_user.id, name=current_user.name, role="host")
    topic, material, topic_id, topic_type = _resolve_topic(payload)
    phases = build_phases(payload.duration_minutes)
    user_role = _resolve_user_role(payload)
    return {
        "id": uuid4().hex,
        "host_user_id": current_user.id,
        "topic": topic,
        "material": material,
        "topic_id": topic_id,
        "topic_type": topic_type,
        "status": "waiting",
        "phase": "lobby",
        "participant_count": 1,
        "max_participants": payload.max_participants,
        "duration_minutes": payload.duration_minutes,
        "remaining_seconds": payload.duration_minutes * 60,
        "agents": payload.agents or DEFAULT_AGENTS,
        "phases": phases,
        "user_role": user_role,
        "role_mode": payload.role_mode or "pick",
        "script_id": payload.script_id or "standard_flow",
        "memory_enabled": payload.memory_enabled,
        "api_mode": payload.api_mode or "hybrid_sandbox",
        "advancement_quota": payload.advancement_quota or 3,
        "participants": [participant.model_dump()],
        "created_at": now,
        "updated_at": now,
    }


class LgdTopicItem(BaseModel):
    id: str
    title: str
    topic_type: str
    material: str


class LgdScoreRequest(BaseModel):
    topic: str | None = None
    topic_type: str | None = None
    transcript: list[dict] = Field(default_factory=list)
    user_role: str | None = None
    participant_count: int = Field(default=8, ge=2, le=12)
    user_was_reporter: bool | None = None
    visual_board: dict[str, Any] | None = None
    followup_qa: list[dict[str, Any]] = Field(default_factory=list)
    listener_notes: str | None = None
    advancement_quota: int = Field(default=3, ge=1, le=4)
    seat_map: dict[str, int] | None = None
    participant_roles: dict[str, str] | None = None


class LgdScoreResponse(BaseModel):
    lgd_metrics: dict
    score: float | None = None
    overall_score: float | None = None
    dimensions: dict[str, float | None] = Field(default_factory=dict)


class LgdMemoryPayload(BaseModel):
    memory_enabled: bool = True
    topic_id: str | None = None
    last_topic: str | None = None
    duration_minutes: int = 20
    user_role: str = "member"
    role_mode: str = "pick"
    script_id: str = "standard_flow"
    api_mode: str = "hybrid_sandbox"
    weak_dimensions: list[str] = Field(default_factory=list)
    last_score: float | None = None
    notes: str | None = None
    updated_at: str | None = None


class LgdAgentTurnRequest(BaseModel):
    agent_id: str
    topic: str = "远程团队协作效率提升方案"
    material: str | None = None
    phase: str = "free_discussion"
    transcript: list[dict[str, Any]] = Field(default_factory=list)
    script_id: str = "standard_flow"
    memory_enabled: bool = True
    turn_index: int = 0
    api_key: str | None = None
    base_url: str | None = None
    model: str | None = None
    seat_map: dict[str, int] | None = None
    identity_mode: str = "random"
    participant_roles: dict[str, str] | None = None
    visual_board_summary: str | None = None


class LgdBiddingRequest(BaseModel):
    transcript: list[dict[str, Any]] = Field(default_factory=list)
    script_id: str = "standard_flow"
    remaining_seconds: int = 420
    total_phase_seconds: int = 600
    memory_enabled: bool = True
    turn_index: int = 0
    seat_map: dict[str, int] | None = None
    identity_mode: str = "random"
    participant_roles: dict[str, str] | None = None
    visual_board_summary: str | None = None


class LgdAcpStreamRequest(BaseModel):
    agent_id: str | None = None
    topic: str = "远程团队协作效率提升方案"
    material: str | None = None
    phase: str = "free_discussion"
    transcript: list[dict[str, Any]] = Field(default_factory=list)
    script_id: str = "standard_flow"
    memory_enabled: bool = True
    memory_snapshot: dict[str, Any] | None = None
    remaining_seconds: int = 420
    total_phase_seconds: int = 600
    turn_index: int = 0
    api_mode: str = "hybrid_sandbox"
    api_key: str | None = None
    base_url: str | None = None
    model: str | None = None
    seat_map: dict[str, int] | None = None
    identity_mode: str = "random"
    participant_roles: dict[str, str] | None = None
    visual_board_summary: str | None = None


class LgdRoomSignalRequest(BaseModel):
    action: str = Field(default="typing_start", max_length=32)
    holder: str | None = Field(default=None, max_length=64)
    ttl_seconds: int = Field(default=15, ge=3, le=60)
    reason: str | None = Field(default=None, max_length=80)
    topic: str | None = Field(default=None, max_length=200)
    material: str | None = Field(default=None, max_length=5000)
    seat_map: dict[str, int] | None = None
    identity_mode: str = "random"
    participant_roles: dict[str, str] | None = None


class LgdObserverTagRequest(BaseModel):
    utterance: dict[str, Any]
    transcript_prior: list[dict[str, Any]] = Field(default_factory=list)
    prior_transcript: list[dict[str, Any]] | None = None
    user_role: str = "member"
    phase: str = "free_discussion"
    elapsed_seconds: int | float | None = None
    turn_index: int = 0


@router.get("/topics", response_model=list[LgdTopicItem])
async def list_topics() -> list[LgdTopicItem]:
    items: list[LgdTopicItem] = []
    for row in load_lgd_topics():
        items.append(
            LgdTopicItem(
                id=str(row["id"]),
                title=str(row.get("title") or row["id"]),
                topic_type=str(row.get("topic_type") or "open"),
                material=str(row.get("material") or ""),
            )
        )
    return items


@router.get("/scripts")
async def list_fast_training_scripts() -> dict[str, Any]:
    return {
        "scripts": FAST_TRAINING_SCRIPTS,
        "seats": SEAT_ORDER,
        "sandboxes": list(AGENT_SANDBOX_PROFILES.values()),
    }


@router.get("/memory", response_model=LgdMemoryPayload)
async def get_lgd_memory(
    current_user: UserInDB = Depends(get_current_user),
    redis: Redis = Depends(get_redis),
) -> LgdMemoryPayload:
    saved = await get_json(redis, f"lgd_memory:{current_user.id}")
    if not saved:
        return LgdMemoryPayload()
    return LgdMemoryPayload.model_validate(saved)


@router.post("/memory", response_model=LgdMemoryPayload)
async def save_lgd_memory(
    payload: LgdMemoryPayload,
    current_user: UserInDB = Depends(get_current_user),
    redis: Redis = Depends(get_redis),
) -> LgdMemoryPayload:
    record = payload.model_dump()
    record["updated_at"] = datetime.now(timezone.utc).isoformat()
    await set_json(redis, f"lgd_memory:{current_user.id}", record)
    return LgdMemoryPayload.model_validate(record)


@router.post("/agent-turn")
async def create_lgd_agent_turn(
    payload: LgdAgentTurnRequest,
    current_user: UserInDB = Depends(get_current_user),
    redis: Redis = Depends(get_redis),
) -> dict[str, Any]:
    memory_state = None
    if payload.memory_enabled:
        memory_state = await get_json(redis, f"lgd_memory:{current_user.id}")
    result = await generate_lgd_agent_turn(
        agent_id=payload.agent_id,
        topic=payload.topic,
        material=payload.material,
        phase=payload.phase,
        transcript=payload.transcript,
        script_id=payload.script_id,
        memory_state=memory_state,
        turn_index=payload.turn_index,
        api_key_override=payload.api_key,
        base_url_override=payload.base_url,
        model_override=payload.model,
        seat_map=payload.seat_map,
        identity_mode=payload.identity_mode,
        participant_roles=payload.participant_roles,
        visual_board_summary=payload.visual_board_summary,
    )
    return result


@router.get("/handoff")
async def get_lgd_handoff_report(
    current_user: UserInDB = Depends(get_current_user),
    redis: Redis = Depends(get_redis),
) -> dict[str, Any]:
    from app.services.single_interview_taxonomy import build_lgd_report_json

    saved = await get_json(redis, f"lgd_report:{current_user.id}")
    if isinstance(saved, dict) and saved.get("behavior_slices"):
        return saved
    return build_lgd_report_json([])


@router.post("/handoff")
async def save_lgd_handoff_report(
    payload: dict[str, Any],
    current_user: UserInDB = Depends(get_current_user),
    redis: Redis = Depends(get_redis),
) -> dict[str, Any]:
    from app.services.single_interview_taxonomy import build_lgd_report_json

    if isinstance(payload.get("behavior_slices"), list) and payload.get("five_dimensions"):
        report = {
            **payload,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }
    else:
        report = build_lgd_report_json(
            payload.get("transcript") or [],
            payload.get("lgd_metrics") or {},
            topic=payload.get("topic"),
            room_id=payload.get("room_id"),
            user_role=payload.get("user_role"),
            user_seat=int(payload.get("user_seat") or 4),
        )
    await set_json(redis, f"lgd_report:{current_user.id}", report)
    return report


@router.post("/score", response_model=LgdScoreResponse)
async def score_lgd(payload: LgdScoreRequest) -> LgdScoreResponse:
    metrics = score_lgd_discussion(
        payload.transcript,
        user_role=payload.user_role,
        participant_count=payload.participant_count,
        user_was_reporter=payload.user_was_reporter,
        topic_type=payload.topic_type,
        visual_board=payload.visual_board,
        followup_qa=payload.followup_qa,
        listener_notes=payload.listener_notes,
        advancement_quota=payload.advancement_quota,
        seat_map=payload.seat_map,
        participant_roles=payload.participant_roles,
    )
    dims_raw = metrics.get("dimensions_suggested") or {}
    dimensions = {k: v for k, v in dims_raw.items() if isinstance(v, (int, float))}
    overall_val = metrics.get("overall_score")
    return LgdScoreResponse(
        lgd_metrics=metrics,
        score=overall_val,
        overall_score=overall_val,
        dimensions=dimensions,
    )


@router.post("/observer-tag")
async def create_lgd_observer_tag(
    payload: LgdObserverTagRequest,
    current_user: UserInDB = Depends(get_current_user),
) -> dict[str, Any]:
    _ = current_user
    prior_list = payload.transcript_prior if payload.transcript_prior else (payload.prior_transcript or [])
    utt = dict(payload.utterance or {})
    if "isUser" not in utt and "role" not in utt:
        utt["role"] = "user"
    annotations = evaluate_utterance_side_channel(
        utt,
        prior_list,
        user_role=payload.user_role,
        phase=payload.phase,
        elapsed_seconds=payload.elapsed_seconds,
        turn_index=payload.turn_index,
    )
    return {
        "protocol": ACP_PROTOCOL_VERSION,
        "annotations": annotations,
        "tags": annotations,
    }


@router.post("/rooms/{room_id}/bidding")
async def compute_room_bidding(
    room_id: str,
    payload: LgdBiddingRequest,
    current_user: UserInDB = Depends(get_current_user),
    redis: Redis = Depends(get_redis),
) -> dict[str, Any]:
    lock_state = await get_floor_lock_state(room_id, redis=redis)
    if lock_state.get("locked"):
        return {
            "protocol": ACP_PROTOCOL_VERSION,
            "room_id": room_id,
            "locked": True,
            "lock": lock_state,
            "winner": None,
            "candidates": [],
            "speaker_queue": [],
        }

    memory_state = None
    if payload.memory_enabled:
        memory_state = await get_json(redis, f"lgd_memory:{current_user.id}")

    bids = compute_urgency_bids(
        transcript=payload.transcript,
        script_id=payload.script_id,
        remaining_seconds=payload.remaining_seconds,
        total_phase_seconds=payload.total_phase_seconds,
        memory_state=memory_state,
        turn_index=payload.turn_index,
        seat_map=payload.seat_map,
        identity_mode=payload.identity_mode,
        participant_roles=payload.participant_roles,
        visual_board_summary=payload.visual_board_summary,
    )
    return {
        "protocol": ACP_PROTOCOL_VERSION,
        "room_id": room_id,
        "locked": False,
        "winner": bids[0] if bids else None,
        "candidates": bids,
        "speaker_queue": bids[:4],
    }


@router.post("/rooms/{room_id}/signal")
async def post_room_signal(
    room_id: str,
    payload: LgdRoomSignalRequest,
    current_user: UserInDB = Depends(get_current_user),
    redis: Redis = Depends(get_redis),
) -> dict[str, Any]:
    action = (payload.action or "status").strip().lower()
    if action == "typing_start":
        res = await acquire_floor_lock(
            room_id,
            holder=current_user.id,
            mode="typing_lock",
            ttl_seconds=payload.ttl_seconds,
            interrupt_speaking=False,
            redis=redis,
        )
        return {"protocol": ACP_PROTOCOL_VERSION, "action": action, **res}

    if action in ("grab_mic", "vad_start"):
        res = await acquire_floor_lock(
            room_id,
            holder=current_user.id,
            mode=action,
            ttl_seconds=max(payload.ttl_seconds, 20),
            interrupt_speaking=True,
            redis=redis,
        )
        return {"protocol": ACP_PROTOCOL_VERSION, "action": action, **res}

    if action in ("typing_stop", "release_mic"):
        res = await release_floor_lock(room_id, redis=redis)
        return {"protocol": ACP_PROTOCOL_VERSION, "action": action, **res}

    if action == "abort":
        aborted = abort_active_room_turn(room_id, reason=payload.reason or "user_barge_in")
        return {"protocol": ACP_PROTOCOL_VERSION, "action": action, "aborted_turn": aborted}

    if action == "reading_warmup":
        stances = build_reading_warmup_stances(
            payload.topic or "",
            payload.material,
            seat_map=payload.seat_map,
            identity_mode=payload.identity_mode,
            participant_roles=payload.participant_roles,
        )
        return {"protocol": ACP_PROTOCOL_VERSION, "action": action, "stances": stances}

    state = await get_floor_lock_state(room_id, redis=redis)
    return {"protocol": ACP_PROTOCOL_VERSION, "action": "status", **state}


@router.post("/rooms/{room_id}/stream-turn")
async def stream_room_agent_turn(
    room_id: str,
    payload: LgdAcpStreamRequest,
    request: Request,
    current_user: UserInDB = Depends(get_current_user),
    redis: Redis = Depends(get_redis),
) -> StreamingResponse:
    memory_state = None
    if payload.memory_enabled:
        memory_state = await get_json(redis, f"lgd_memory:{current_user.id}")

    disconnect_cancel = threading.Event()

    async def sse_generator():
        async for event in stream_acp_agent_turn(
            room_id=room_id,
            agent_id=payload.agent_id,
            topic=payload.topic,
            material=payload.material,
            phase=payload.phase,
            transcript=payload.transcript,
            script_id=payload.script_id,
            memory_state=memory_state,
            remaining_seconds=payload.remaining_seconds,
            total_phase_seconds=payload.total_phase_seconds,
            turn_index=payload.turn_index,
            api_mode=payload.api_mode,
            api_key_override=payload.api_key,
            base_url_override=payload.base_url,
            model_override=payload.model,
            seat_map=payload.seat_map,
            identity_mode=payload.identity_mode,
            participant_roles=payload.participant_roles,
            visual_board_summary=payload.visual_board_summary,
            redis=redis,
            external_cancel=disconnect_cancel,
        ):
            if await request.is_disconnected():
                disconnect_cancel.set()
                break
            yield format_sse_frame(event)

    return StreamingResponse(
        sse_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.post("/rooms", response_model=LgdRoomResponse, status_code=status.HTTP_201_CREATED)
async def create_room(
    payload: LgdRoomCreate,
    current_user: UserInDB = Depends(get_current_user),
    redis: Redis = Depends(get_redis),
) -> LgdRoomResponse:
    room_record = _build_room_record(payload, current_user)
    await set_json(redis, f"lgd_room:{room_record['id']}", room_record)
    await index_add_lgd_room_id(redis, room_record["id"])
    if payload.memory_enabled:
        existing_mem = await get_json(redis, f"lgd_memory:{current_user.id}") or {}
        existing_mem.update(
            {
                "memory_enabled": True,
                "topic_id": room_record["topic_id"],
                "last_topic": room_record["topic"],
                "duration_minutes": room_record["duration_minutes"],
                "user_role": room_record["user_role"],
                "role_mode": payload.role_mode,
                "script_id": room_record["script_id"],
                "api_mode": room_record["api_mode"],
                "updated_at": room_record["created_at"],
            }
        )
        await set_json(redis, f"lgd_memory:{current_user.id}", existing_mem)
    return LgdRoomResponse.model_validate(room_record)


@router.get("/rooms", response_model=list[LgdRoomResponse])
async def list_rooms(redis: Redis = Depends(get_redis)) -> list[LgdRoomResponse]:
    room_ids = await get_all_lgd_room_ids(redis)
    rooms: list[dict] = []
    for room_id in room_ids:
        room_record = await get_json(redis, f"lgd_room:{room_id}")
        if room_record:
            rooms.append(room_record)
    rooms.sort(key=lambda item: item["created_at"], reverse=True)
    return [LgdRoomResponse.model_validate(room) for room in rooms]


@router.get("/rooms/{room_id}", response_model=LgdRoomResponse)
async def get_room(
    room_id: str,
    redis: Redis = Depends(get_redis),
) -> LgdRoomResponse:
    room_record = await get_json(redis, f"lgd_room:{room_id}")
    if room_record is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="LGD room not found",
        )
    return LgdRoomResponse.model_validate(room_record)

