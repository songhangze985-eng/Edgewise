"""Synthetic Redis fixtures for research admin stats tests (test DB only)."""

from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Any

from redis.asyncio import Redis

from app.research.keys import auto_hash_key, survey_hash_key


async def seed_minimal_cohort(redis: Redis, user_id: str = "u-test-1") -> None:
    await redis.sadd("users:all", user_id)
    await redis.set(
        f"user:{user_id}",
        json.dumps(
            {
                "id": user_id,
                "research_consent": {
                    "accepted": True,
                    "accepted_at": datetime.now(timezone.utc).isoformat(),
                    "version": "test",
                },
                "experiment_assignment": {
                    "arm": "10",
                    "factors": {"continuity": 1, "participation": 0},
                    "assigned_at": datetime.now(timezone.utc).isoformat(),
                    "source": "test",
                },
                "posttest_due_at": "2020-01-01T00:00:00+00:00",
                "posttest_completed_at": "2020-01-02T00:00:00+00:00",
            }
        ),
    )
    await redis.hset(
        auto_hash_key(user_id),
        mapping={
            "qualified_activation": "1",
            "entry_channel": json.dumps("search"),
            "feedback_viewed": "1",
            "answered_before_feedback": "1",
            "posttest_status": json.dumps("done"),
        },
    )
    await redis.hset(
        survey_hash_key(user_id),
        "C1",
        json.dumps({"status": "answered", "value": 6, "answered_at": datetime.now(timezone.utc).isoformat()}),
    )
    await redis.hset(
        survey_hash_key(user_id),
        "A7a",
        json.dumps({"status": "answered", "value": 5, "answered_at": datetime.now(timezone.utc).isoformat()}),
    )
