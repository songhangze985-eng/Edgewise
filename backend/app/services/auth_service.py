from __future__ import annotations

from datetime import datetime, timezone
from typing import Any
from uuid import uuid4

from fastapi import HTTPException, status
from redis.asyncio import Redis

from app.config import settings
from app.core.redis_client import get_json, set_json
from app.core.security import create_access_token, hash_password, verify_password
from app.models.schemas import TokenResponse, UserInDB, UserLogin, UserPublic, UserRegister

DEFAULT_TIER = "Free"
DEFAULT_TIER_LABEL = "青铜免费版"
DEFAULT_CREDITS = 500


def _normalize_email(email: str) -> str:
    normalized = email.strip().lower()
    if "@" not in normalized or normalized.startswith("@") or normalized.endswith("@"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid email address",
        )
    return normalized


def _build_initials(name: str) -> str:
    compact_name = "".join(name.strip().split())
    if not compact_name:
        return "EW"
    return compact_name[:2].upper()


def _to_public_user(user_data: dict[str, Any]) -> UserPublic:
    return UserPublic.model_validate(
        {key: value for key, value in user_data.items() if key != "password_hash"}
    )


async def get_user_by_id(redis: Redis, user_id: str) -> UserInDB | None:
    user_data = await get_json(redis, f"user:{user_id}")
    if user_data is None:
        return None
    return UserInDB.model_validate(user_data)


async def get_user_by_email(redis: Redis, email: str) -> UserInDB | None:
    normalized_email = _normalize_email(email)
    user_id = await redis.get(f"user:email:{normalized_email}")
    if not user_id:
        return None
    return await get_user_by_id(redis, user_id)


async def register_user(redis: Redis, payload: UserRegister) -> UserPublic:
    normalized_email = _normalize_email(payload.email)
    existing_user = await redis.get(f"user:email:{normalized_email}")
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email already registered",
        )

    name = payload.name.strip()
    if not name:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Name cannot be empty",
        )

    now = datetime.now(timezone.utc).isoformat()
    user_id = uuid4().hex
    is_admin = (await redis.scard("users:all")) == 0

    user_record = {
        "id": user_id,
        "email": normalized_email,
        "name": name,
        "initials": _build_initials(name),
        "tier": DEFAULT_TIER,
        "tier_label": DEFAULT_TIER_LABEL,
        "credits": DEFAULT_CREDITS,
        "join_date": now[:10],
        "is_admin": is_admin,
        "created_at": now,
        "updated_at": now,
        "password_hash": hash_password(payload.password),
    }

    await set_json(redis, f"user:{user_id}", user_record)
    await redis.set(f"user:email:{normalized_email}", user_id)
    await redis.sadd("users:all", user_id)

    return _to_public_user(user_record)


async def authenticate_user(redis: Redis, payload: UserLogin) -> TokenResponse:
    user = await get_user_by_email(redis, payload.email)
    if user is None or not verify_password(payload.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
        )

    token, _ = create_access_token(
        subject=user.id,
        email=user.email,
        is_admin=user.is_admin,
    )

    user_record = user.model_dump()
    user_record["updated_at"] = datetime.now(timezone.utc).isoformat()
    await set_json(redis, f"user:{user.id}", user_record)

    return TokenResponse(
        access_token=token,
        expires_in=settings.JWT_EXPIRE_MINUTES * 60,
        user=_to_public_user(user_record),
    )


async def invalidate_token(redis: Redis, token_payload: dict[str, Any]) -> None:
    jti = token_payload.get("jti")
    exp = token_payload.get("exp")
    if not jti or not exp:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Token payload is missing required claims",
        )

    now_timestamp = int(datetime.now(timezone.utc).timestamp())
    ttl = max(int(exp) - now_timestamp, 1)
    await redis.set(f"token:blacklist:{jti}", "1", ex=ttl)
