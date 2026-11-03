from __future__ import annotations

from datetime import datetime, timezone
from typing import Any
from uuid import uuid4

from redis.asyncio import Redis

from app.core.redis_client import get_json, set_json
from app.research.events import append_research_event

STORY_THEME_IDS = frozenset(
    {
        "leadership",
        "conflict",
        "failure",
        "teamwork",
        "pressure",
        "innovation",
    }
)


def _story_key(story_id: str) -> str:
    return f"story:{story_id}"


def _user_stories_key(user_id: str) -> str:
    return f"user:{user_id}:stories"


def _normalize_themes(raw: list[Any] | None) -> list[str]:
    if not raw:
        return []
    out: list[str] = []
    for item in raw:
        key = str(item).strip()
        if key in STORY_THEME_IDS and key not in out:
            out.append(key)
    return out


def _serialize(record: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": record["id"],
        "title": record.get("title") or "",
        "S": record.get("S") or "",
        "T": record.get("T") or "",
        "A": record.get("A") or "",
        "R": record.get("R") or "",
        "themes": _normalize_themes(record.get("themes")),
        "source_session": record.get("source_session"),
        "created_at": record.get("created_at") or "",
        "updated_at": record.get("updated_at") or "",
    }


def theme_coverage_counts(stories: list[dict[str, Any]]) -> dict[str, int]:
    counts = {theme: 0 for theme in STORY_THEME_IDS}
    for row in stories:
        for theme in _normalize_themes(row.get("themes")):
            counts[theme] = counts.get(theme, 0) + 1
    return counts


async def _emit_theme_coverage(redis: Redis, user_id: str, stories: list[dict[str, Any]]) -> None:
    coverage = theme_coverage_counts(stories)
    await append_research_event(
        redis,
        user_id,
        "story.theme_coverage",
        props={"coverage": coverage, "story_count": len(stories)},
        skip_consent_check=True,
    )


async def list_user_stories(redis: Redis, user_id: str) -> list[dict[str, Any]]:
    story_ids = await redis.smembers(_user_stories_key(user_id))
    rows: list[dict[str, Any]] = []
    for raw_id in story_ids:
        story_id = raw_id.decode() if isinstance(raw_id, bytes) else str(raw_id)
        record = await get_json(redis, _story_key(story_id))
        if not record or record.get("user_id") != user_id:
            continue
        rows.append(_serialize(record))
    rows.sort(key=lambda r: r.get("updated_at") or r.get("created_at") or "", reverse=True)
    return rows


async def get_user_story(redis: Redis, user_id: str, story_id: str) -> dict[str, Any] | None:
    record = await get_json(redis, _story_key(story_id))
    if not record or record.get("user_id") != user_id:
        return None
    return _serialize(record)


async def create_story(
    redis: Redis,
    user_id: str,
    *,
    title: str,
    situation: str,
    task: str,
    action: str,
    result: str,
    themes: list[str] | None = None,
    source_session: str | None = None,
    source: str = "manual",
) -> dict[str, Any]:
    now = datetime.now(timezone.utc).isoformat()
    story_id = uuid4().hex[:16]
    record = {
        "id": story_id,
        "user_id": user_id,
        "title": title.strip(),
        "S": situation.strip(),
        "T": task.strip(),
        "A": action.strip(),
        "R": result.strip(),
        "themes": _normalize_themes(themes),
        "source_session": source_session.strip() if source_session else None,
        "created_at": now,
        "updated_at": now,
    }
    await set_json(redis, _story_key(story_id), record)
    await redis.sadd(_user_stories_key(user_id), story_id)
    await append_research_event(
        redis,
        user_id,
        "story.created",
        props={"story_id": story_id, "source": source, "theme_count": len(record["themes"])},
        skip_consent_check=True,
    )
    all_stories = await list_user_stories(redis, user_id)
    await _emit_theme_coverage(redis, user_id, all_stories)
    return _serialize(record)


async def update_story(
    redis: Redis,
    user_id: str,
    story_id: str,
    *,
    title: str | None = None,
    situation: str | None = None,
    task: str | None = None,
    action: str | None = None,
    result: str | None = None,
    themes: list[str] | None = None,
) -> dict[str, Any]:
    record = await get_json(redis, _story_key(story_id))
    if not record or record.get("user_id") != user_id:
        raise ValueError("not_found")
    if title is not None:
        record["title"] = title.strip()
    if situation is not None:
        record["S"] = situation.strip()
    if task is not None:
        record["T"] = task.strip()
    if action is not None:
        record["A"] = action.strip()
    if result is not None:
        record["R"] = result.strip()
    if themes is not None:
        record["themes"] = _normalize_themes(themes)
    record["updated_at"] = datetime.now(timezone.utc).isoformat()
    await set_json(redis, _story_key(story_id), record)
    all_stories = await list_user_stories(redis, user_id)
    await _emit_theme_coverage(redis, user_id, all_stories)
    return _serialize(record)


async def delete_story(redis: Redis, user_id: str, story_id: str) -> None:
    record = await get_json(redis, _story_key(story_id))
    if not record or record.get("user_id") != user_id:
        raise ValueError("not_found")
    await redis.delete(_story_key(story_id))
    await redis.srem(_user_stories_key(user_id), story_id)
    all_stories = await list_user_stories(redis, user_id)
    await _emit_theme_coverage(redis, user_id, all_stories)
