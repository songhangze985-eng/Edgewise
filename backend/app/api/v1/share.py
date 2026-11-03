from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from redis.asyncio import Redis

from app.api.deps import get_current_token_payload, get_current_user, get_redis
from app.models.schemas import (
    PairAnswerSubmit,
    PairCreate,
    PairCreateResponse,
    PairPracticeView,
    PairVisibilityUpdate,
    ShareCardCreate,
    ShareCardCreateResponse,
    ShareCardPublic,
    ShareCardRevokeResponse,
    UserInDB,
)
from app.services.auth_service import get_user_by_id
from app.services.pair_practice_service import (
    create_pair,
    get_pair,
    set_pair_visibility,
    submit_pair_answer,
)
from app.services.share_card_service import create_share_card, get_share_card_public, revoke_share_card

router = APIRouter(tags=["share"])
optional_bearer = HTTPBearer(auto_error=False)


async def get_optional_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(optional_bearer),
    redis: Redis = Depends(get_redis),
) -> UserInDB | None:
    if credentials is None or credentials.scheme.lower() != "bearer":
        return None
    try:
        payload: dict[str, Any] = await get_current_token_payload(
            credentials,
            redis,
        )
    except HTTPException:
        return None
    user_id = payload.get("sub")
    if not user_id:
        return None
    return await get_user_by_id(redis, user_id)


@router.post("/share/cards", response_model=ShareCardCreateResponse)
async def post_share_card(
    payload: ShareCardCreate,
    current_user: UserInDB = Depends(get_current_user),
    redis: Redis = Depends(get_redis),
) -> ShareCardCreateResponse:
    result = await create_share_card(
        redis,
        current_user,
        session_id=payload.session_id,
        question_id=payload.question_id,
        include_excerpt=payload.include_excerpt,
        excerpt=payload.excerpt,
    )
    return ShareCardCreateResponse.model_validate(result)


@router.get("/share/cards/{share_id}", response_model=ShareCardPublic)
async def read_share_card(
    share_id: str,
    redis: Redis = Depends(get_redis),
) -> ShareCardPublic:
    data = await get_share_card_public(redis, share_id)
    return ShareCardPublic.model_validate(data)


@router.delete("/share/cards/{share_id}", response_model=ShareCardRevokeResponse)
async def delete_share_card(
    share_id: str,
    current_user: UserInDB = Depends(get_current_user),
    redis: Redis = Depends(get_redis),
) -> ShareCardRevokeResponse:
    result = await revoke_share_card(redis, current_user, share_id)
    return ShareCardRevokeResponse.model_validate(result)


@router.post("/pair", response_model=PairCreateResponse)
async def post_pair(
    payload: PairCreate,
    current_user: UserInDB = Depends(get_current_user),
    redis: Redis = Depends(get_redis),
) -> PairCreateResponse:
    result = await create_pair(
        redis,
        current_user,
        probe_text=payload.probe_text,
        inviter_answer=payload.inviter_answer,
        share_id=payload.share_id,
    )
    return PairCreateResponse.model_validate(result)


@router.get("/pair/{pair_id}", response_model=PairPracticeView)
async def read_pair(
    pair_id: str,
    redis: Redis = Depends(get_redis),
    current_user: UserInDB | None = Depends(get_optional_user),
) -> PairPracticeView:
    data = await get_pair(redis, pair_id, current_user)
    return PairPracticeView.model_validate(data)


@router.post("/pair/{pair_id}/answer", response_model=PairPracticeView)
async def post_pair_answer(
    pair_id: str,
    payload: PairAnswerSubmit,
    current_user: UserInDB = Depends(get_current_user),
    redis: Redis = Depends(get_redis),
) -> PairPracticeView:
    data = await submit_pair_answer(redis, current_user, pair_id, payload.answer)
    return PairPracticeView.model_validate(data)


@router.post("/pair/{pair_id}/visibility", response_model=PairPracticeView)
async def post_pair_visibility(
    pair_id: str,
    payload: PairVisibilityUpdate,
    current_user: UserInDB = Depends(get_current_user),
    redis: Redis = Depends(get_redis),
) -> PairPracticeView:
    data = await set_pair_visibility(redis, current_user, pair_id, visible=payload.visible)
    return PairPracticeView.model_validate(data)
