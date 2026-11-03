from __future__ import annotations

import random
from datetime import datetime, timezone
from typing import Any
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from redis.asyncio import Redis

from app.api.deps import get_current_user, get_redis
from app.core.redis_client import get_json, set_json
from app.models.schemas import LgdParticipant, LgdRoomCreate, LgdRoomResponse, UserInDB
from app.services.lgd_multi_agent import (
    AGENT_SANDBOX_PROFILES,
    FAST_TRAINING_SCRIPTS,
    SEAT_ORDER,
    generate_lgd_agent_turn,
)
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


def _resolve_user_role(payload: LgdRoomCreate) -> str:
    role = (payload.user_role or "member").strip().lower()
    if payload.role_mode == "random":
        return random.choice(USER_ROLES)
    if role not in USER_ROLES:
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
        "script_id": payload.script_id or "standard_flow",
        "memory_enabled": payload.memory_enabled,
        "api_mode": payload.api_mode or "hybrid_sandbox",
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
    transcript: list[dict] = Field(default_factory=list)
    user_role: str | None = None
    participant_count: int = Field(default=8, ge=2, le=12)
    user_was_reporter: bool | None = None


class LgdScoreResponse(BaseModel):
    lgd_metrics: dict
    score: float | None = None
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
    )
    return result


@router.post("/score", response_model=LgdScoreResponse)
async def score_lgd(payload: LgdScoreRequest) -> LgdScoreResponse:
    metrics = score_lgd_discussion(
        payload.transcript,
        user_role=payload.user_role,
        participant_count=payload.participant_count,
        user_was_reporter=payload.user_was_reporter,
    )
    dims_raw = metrics.get("dimensions_suggested") or {}
    dimensions = {k: v for k, v in dims_raw.items() if isinstance(v, (int, float))}
    return LgdScoreResponse(
        lgd_metrics=metrics,
        score=metrics.get("overall_score"),
        dimensions=dimensions,
    )


@router.post("/rooms", response_model=LgdRoomResponse, status_code=status.HTTP_201_CREATED)
async def create_room(
    payload: LgdRoomCreate,
    current_user: UserInDB = Depends(get_current_user),
    redis: Redis = Depends(get_redis),
) -> LgdRoomResponse:
    room_record = _build_room_record(payload, current_user)
    await set_json(redis, f"lgd_room:{room_record['id']}", room_record)
    await redis.sadd("lgd_rooms:all", room_record["id"])
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
    room_ids = await redis.smembers("lgd_rooms:all")
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

