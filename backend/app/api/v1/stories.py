from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from redis.asyncio import Redis

from app.api.deps import get_current_user, get_redis
from app.models.schemas import StoryCreate, StoryUpdate, StoryView, UserInDB
from app.services import story_service

router = APIRouter(prefix="/stories", tags=["stories"])


@router.get("", response_model=list[StoryView])
async def list_stories(
    current_user: UserInDB = Depends(get_current_user),
    redis: Redis = Depends(get_redis),
) -> list[StoryView]:
    rows = await story_service.list_user_stories(redis, current_user.id)
    return [StoryView(**row) for row in rows]


@router.post("", response_model=StoryView)
async def create_story(
    payload: StoryCreate,
    current_user: UserInDB = Depends(get_current_user),
    redis: Redis = Depends(get_redis),
) -> StoryView:
    try:
        row = await story_service.create_story(
            redis,
            current_user.id,
            title=payload.title,
            situation=payload.S,
            task=payload.T,
            action=payload.A,
            result=payload.R,
            themes=payload.themes,
            source_session=payload.source_session,
            source=payload.source or "manual",
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="创建失败") from exc
    return StoryView(**row)


@router.patch("/{story_id}", response_model=StoryView)
async def patch_story(
    story_id: str,
    payload: StoryUpdate,
    current_user: UserInDB = Depends(get_current_user),
    redis: Redis = Depends(get_redis),
) -> StoryView:
    try:
        row = await story_service.update_story(
            redis,
            current_user.id,
            story_id,
            title=payload.title,
            situation=payload.S,
            task=payload.T,
            action=payload.A,
            result=payload.R,
            themes=payload.themes,
        )
    except ValueError as exc:
        if str(exc) == "not_found":
            raise HTTPException(status_code=404, detail="故事不存在") from exc
        raise HTTPException(status_code=400, detail="更新失败") from exc
    return StoryView(**row)


@router.delete("/{story_id}")
async def remove_story(
    story_id: str,
    current_user: UserInDB = Depends(get_current_user),
    redis: Redis = Depends(get_redis),
) -> dict[str, str]:
    try:
        await story_service.delete_story(redis, current_user.id, story_id)
    except ValueError as exc:
        if str(exc) == "not_found":
            raise HTTPException(status_code=404, detail="故事不存在") from exc
        raise HTTPException(status_code=400, detail="删除失败") from exc
    return {"message": "ok"}
