from __future__ import annotations

import unittest
from unittest.mock import AsyncMock, patch

from app.config import settings
from app.core.redis_client import set_json
from app.services.seed_service import DEMO_EMAIL, seed_demo_user_if_needed


class FakeRedis:
    """Same get/set double as the LGD API tests, plus the set write the seeder uses."""

    def __init__(self) -> None:
        self.store: dict[str, str] = {}
        self.sets: dict[str, set[str]] = {}

    async def get(self, key: str):
        return self.store.get(key)

    async def set(self, key: str, value: str, ex=None):
        self.store[key] = value
        return True

    async def sadd(self, key: str, *members: str):
        bucket = self.sets.setdefault(key, set())
        before = len(bucket)
        bucket.update(members)
        return len(bucket) - before


class TestDemoUserSeed(unittest.IsolatedAsyncioTestCase):
    def setUp(self) -> None:
        self._app_env = settings.APP_ENV

    def tearDown(self) -> None:
        settings.APP_ENV = self._app_env

    async def test_non_development_does_not_create_demo_user(self) -> None:
        for app_env in ("production", "staging"):
            settings.APP_ENV = app_env
            redis = FakeRedis()
            with self._quiet_side_effects():
                created = await seed_demo_user_if_needed(redis)
            self.assertTrue(created is None)
            self.assertTrue(f"user:email:{DEMO_EMAIL}" not in redis.store)
            self.assertEqual(redis.sets.get("users:all", set()), set())

    async def test_development_seeds_non_admin_and_repeat_returns_same_user(self) -> None:
        settings.APP_ENV = "development"
        redis = FakeRedis()
        with self._quiet_side_effects():
            first = await seed_demo_user_if_needed(redis)
            second = await seed_demo_user_if_needed(redis)
        self.assertTrue(first is not None and second is not None)
        self.assertEqual(first["id"], second["id"])
        self.assertTrue(first.get("is_admin") is False)
        self.assertTrue(second.get("is_admin") is False)
        self.assertEqual(len(redis.sets.get("users:all", set())), 1)

    async def test_non_development_returns_existing_record_unchanged(self) -> None:
        settings.APP_ENV = "production"
        redis = FakeRedis()
        user_id = "existing-demo-user"
        await set_json(
            redis,
            f"user:{user_id}",
            {
                "id": user_id,
                "email": DEMO_EMAIL,
                "is_admin": True,
                "research_consent": {"accepted": True, "version": "v"},
                "experiment_assignment": {"arm": "00"},
            },
        )
        await redis.set(f"user:email:{DEMO_EMAIL}", user_id)
        with self._quiet_side_effects():
            loaded = await seed_demo_user_if_needed(redis)
        self.assertEqual(loaded["id"], user_id)
        self.assertTrue(loaded.get("is_admin") is True)

    def _quiet_side_effects(self):
        return patch.multiple(
            "app.services.seed_service",
            ensure_user_invite_code=AsyncMock(),
            assign_experiment_arm=AsyncMock(),
        )


if __name__ == "__main__":
    unittest.main()
