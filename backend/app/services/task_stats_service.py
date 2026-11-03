from __future__ import annotations

from redis.asyncio import Redis

TASK_STAT_FIELDS = frozenset({"visits", "started", "qualified_activation"})


def task_stats_key(slug: str) -> str:
    return f"task:{slug}:stats"


async def increment_task_stat(redis: Redis, slug: str, field: str, amount: int = 1) -> None:
    if not slug or field not in TASK_STAT_FIELDS:
        return
    await redis.hincrby(task_stats_key(slug), field, amount)


async def get_task_stats(redis: Redis, slug: str) -> dict[str, int]:
    raw = await redis.hgetall(task_stats_key(slug))
    out: dict[str, int] = {}
    for key in TASK_STAT_FIELDS:
        val = raw.get(key) or raw.get(key.encode())  # type: ignore[arg-type]
        if val is None:
            out[key] = 0
        else:
            out[key] = int(val)
    return out
