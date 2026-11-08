from __future__ import annotations

from redis.asyncio import Redis

TASK_STAT_FIELDS = frozenset({"visits", "started", "qualified_activation"})


def task_stats_key(slug: str) -> str:
    return f"task:{slug}:stats"


async def increment_task_stat(redis: Redis, slug: str, field: str, amount: int = 1) -> None:
    if not slug or field not in TASK_STAT_FIELDS:
        return
    await redis.hincrby(task_stats_key(slug), field, amount)
