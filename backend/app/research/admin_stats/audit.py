from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Any

from redis.asyncio import Redis

AUDIT_KEY = "research:admin:audit"


async def write_audit(redis: Redis, admin_id: str, action: str, params: dict[str, Any] | None = None) -> None:
    entry = {
        "admin_id": admin_id,
        "action": action,
        "params": params or {},
        "ts": datetime.now(timezone.utc).isoformat(),
    }
    await redis.lpush(AUDIT_KEY, json.dumps(entry, ensure_ascii=False))
    await redis.ltrim(AUDIT_KEY, 0, 4999)
