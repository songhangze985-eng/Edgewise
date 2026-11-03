from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from redis.asyncio import Redis

from app.core.redis_client import get_json, set_json

SERIES_ALL = "series:all"


def _series_key(series_id: str) -> str:
    return f"series:{series_id}"


def _serialize_series(record: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": record["id"],
        "topic": record.get("topic") or "",
        "variant": record.get("variant") or "complementary",
        "episodes": record.get("episodes") or [],
        "disclosure": record.get("disclosure") or "",
        "published": bool(record.get("published", True)),
    }


async def get_series(redis: Redis, series_id: str) -> dict[str, Any] | None:
    record = await get_json(redis, _series_key(series_id))
    if not record or not record.get("published", True):
        return None
    return _serialize_series(record)


async def list_series(
    redis: Redis,
    *,
    variant: str | None = None,
) -> list[dict[str, Any]]:
    ids = sorted(await redis.smembers(SERIES_ALL))
    rows: list[dict[str, Any]] = []
    variant_q = (variant or "").strip().lower()
    for series_id in ids:
        record = await get_json(redis, _series_key(series_id))
        if not record or not record.get("published", True):
            continue
        if variant_q and (record.get("variant") or "").lower() != variant_q:
            continue
        rows.append(_serialize_series(record))
    return rows


async def upsert_series(redis: Redis, series_id: str, payload: dict[str, Any]) -> dict[str, Any]:
    existing = await get_json(redis, _series_key(series_id)) or {}
    now = datetime.now(timezone.utc).isoformat()
    record = {
        "id": series_id,
        "topic": str(payload.get("topic") or existing.get("topic") or "").strip(),
        "variant": str(payload.get("variant") or existing.get("variant") or "complementary").strip(),
        "episodes": payload.get("episodes") if payload.get("episodes") is not None else existing.get("episodes") or [],
        "disclosure": str(payload.get("disclosure") or existing.get("disclosure") or "").strip(),
        "published": payload.get("published") if payload.get("published") is not None else existing.get("published", True),
        "updated_at": now,
        "created_at": existing.get("created_at") or now,
    }
    await set_json(redis, _series_key(series_id), record)
    await redis.sadd(SERIES_ALL, series_id)
    return _serialize_series(record)


async def seed_creator_series_if_needed(redis: Redis) -> None:
    if await redis.scard(SERIES_ALL):
        return
    disclosure = (
        "本专栏内容由创作者与谈锋合作策划，旨在提供互补的追问视角；"
        "不构成录用承诺，也不代表任何雇主官方立场。"
    )
    complementary = {
        "id": "creator-internship-complementary",
        "topic": "同一段实习经历：三种互补追问",
        "variant": "complementary",
        "disclosure": disclosure,
        "published": True,
        "episodes": [
            {
                "id": "ep1",
                "creator": "创作者 A",
                "angle": "你具体负责哪一块，边界在哪里？",
                "video_url": "",
                "task_slug": "ownership-contribution",
                "summary": "从个人贡献边界切入，避免把团队成果说成个人功劳。",
            },
            {
                "id": "ep2",
                "creator": "创作者 B",
                "angle": "如果数据不如预期，你会先验证什么？",
                "video_url": "",
                "task_slug": "project-sounds-scripted",
                "summary": "从结果反思与验证步骤切入，考察结构化复盘。",
            },
            {
                "id": "ep3",
                "creator": "创作者 C",
                "angle": "再给你两周，你会优先改流程还是改指标？",
                "video_url": "",
                "task_slug": "structured-planning",
                "summary": "从取舍与优先级切入，产品目前无法替你做真实决策，仅提供练习框架。",
            },
        ],
    }
    mirror = {
        "id": "creator-internship-mirror",
        "topic": "同一段实习经历：三种常见结论复述",
        "variant": "conclusion",
        "disclosure": disclosure + "（对照组：强调结论一致性，供研究对比。）",
        "published": True,
        "episodes": [
            {
                "id": "ep1",
                "creator": "创作者 D",
                "angle": "总结三个关键词描述你的实习收获",
                "video_url": "",
                "task_slug": "ownership-contribution",
                "summary": "对照视角：先给出高度概括的结论。",
            },
            {
                "id": "ep2",
                "creator": "创作者 E",
                "angle": "用一句话说明项目最终成果",
                "video_url": "",
                "task_slug": "project-sounds-scripted",
                "summary": "对照视角：强调结果陈述。",
            },
            {
                "id": "ep3",
                "creator": "创作者 F",
                "angle": "重复团队使用的同一套方法论名称",
                "video_url": "",
                "task_slug": "structured-planning",
                "summary": "对照视角：结论趋同，便于与互补组对比。",
            },
        ],
    }
    for record in (complementary, mirror):
        await set_json(redis, _series_key(record["id"]), record)
        await redis.sadd(SERIES_ALL, record["id"])
