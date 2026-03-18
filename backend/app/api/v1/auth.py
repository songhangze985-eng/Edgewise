from __future__ import annotations

from fastapi import APIRouter, Depends, status
from redis.asyncio import Redis

from app.api.deps import get_current_token_payload, get_current_user, get_redis
from app.models.schemas import MessageResponse, TokenResponse, UserLogin, UserPublic, UserRegister
from app.services.auth_service import authenticate_user, invalidate_token, register_user

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/register", response_model=UserPublic, status_code=status.HTTP_201_CREATED)
async def register(
    payload: UserRegister,
    redis: Redis = Depends(get_redis),
) -> UserPublic:
    return await register_user(redis, payload)


@router.post("/login", response_model=TokenResponse)
async def login(
    payload: UserLogin,
    redis: Redis = Depends(get_redis),
) -> TokenResponse:
    return await authenticate_user(redis, payload)


@router.get("/me", response_model=UserPublic)
async def me(current_user=Depends(get_current_user)) -> UserPublic:
    return UserPublic.model_validate(current_user.model_dump())


@router.post("/logout", response_model=MessageResponse)
async def logout(
    token_payload: dict = Depends(get_current_token_payload),
    redis: Redis = Depends(get_redis),
) -> MessageResponse:
    await invalidate_token(redis, token_payload)
    return MessageResponse(message="Logged out successfully")
