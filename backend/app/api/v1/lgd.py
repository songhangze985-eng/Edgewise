from __future__ import annotations

from datetime import datetime, timezone
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, status
from redis.asyncio import Redis

from app.api.deps import get_current_user, get_redis
from app.core.redis_client import get_json, set_json
from app.models.schemas import LgdParticipant, LgdRoomCreate, LgdRoomResponse, UserInDB

router = APIRouter(prefix="/lgd", tags=["lgd"])

DEFAULT_AGENTS = [
    "破冰者",
    "点子王",
    "逻辑王",
    "计时员",
    "和事佬",
    "观察者",
    "总结者",
]


def _build_room_record(payload: LgdRoomCreate, current_user: UserInDB) -> dict:
    now = datetime.now(timezone.utc).isoformat()
    participant = LgdParticipant(user_id=current_user.id, name=current_user.name, role="host")
    return {
        "id": uuid4().hex,
        "host_user_id": current_user.id,
        "topic": payload.topic,
        "material": payload.material,
        "status": "waiting",
        "phase": "lobby",
        "participant_count": 1,
        "max_participants": payload.max_participants,
        "duration_minutes": payload.duration_minutes,
        "remaining_seconds": payload.duration_minutes * 60,
        "agents": payload.agents or DEFAULT_AGENTS,
        "participants": [participant.model_dump()],
        "created_at": now,
        "updated_at": now,
    }


@router.post("/rooms", response_model=LgdRoomResponse, status_code=status.HTTP_201_CREATED)
async def create_room(
    payload: LgdRoomCreate,
    current_user: UserInDB = Depends(get_current_user),
    redis: Redis = Depends(get_redis),
) -> LgdRoomResponse:
    room_record = _build_room_record(payload, current_user)
    await set_json(redis, f"lgd_room:{room_record['id']}", room_record)
    await redis.sadd("lgd_rooms:all", room_record["id"])
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
