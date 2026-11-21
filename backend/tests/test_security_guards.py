from __future__ import annotations

import io
import unittest
from unittest.mock import AsyncMock, patch

from fastapi import HTTPException

from app.config import INSECURE_JWT_SECRET, Settings
from app.api.v1.resume import _read_upload_file_bounded
from app.main import app, lifespan
from app.services.seed_service import seed_all


class TestSecurityGuards(unittest.IsolatedAsyncioTestCase):
    async def test_non_dev_startup_rejects_public_placeholders_before_connecting(self):
        for environment in ("production", "staging", "uat"):
            for placeholder in (INSECURE_JWT_SECRET, "change-me-to-a-long-random-string", " "):
                with self.subTest(environment=environment, placeholder=placeholder):
                    config = Settings(APP_ENV=environment, JWT_SECRET=placeholder)
                    with patch("app.main.settings", config), patch("app.main.init_mongo", new_callable=AsyncMock) as init_mongo:
                        with self.assertRaisesRegex(RuntimeError, "JWT_SECRET cannot use the insecure default placeholder"):
                            async with lifespan(app):
                                self.fail("Startup accepted a public signing secret")
                        init_mongo.assert_not_awaited()

    def test_require_secure_jwt_allows_strong_secret_or_dev(self):
        # Strong secret in production is allowed
        secure_settings = Settings(
            APP_ENV="production",
            JWT_SECRET="super-strong-production-random-secret-key-987654321",
        )
        secure_settings.require_secure_jwt()  # Should not raise

        # Dev env with placeholder is tolerated
        dev_settings = Settings(
            APP_ENV="development",
            JWT_SECRET=INSECURE_JWT_SECRET,
        )
        dev_settings.require_secure_jwt()  # Should not raise

    async def test_deployment_seeds_catalog_without_demo_data(self):
        redis = AsyncMock()
        config = Settings(APP_ENV="production")
        with (
            patch("app.services.seed_service.settings", config),
            patch("app.services.seed_service.lookup_user_id_by_email", new_callable=AsyncMock, return_value=None) as lookup,
            patch("app.services.seed_service.get_json", new_callable=AsyncMock, return_value={"is_admin": True}),
            patch("app.services.seed_service.seed_questions_if_needed", new_callable=AsyncMock) as seed_questions,
            patch("app.services.series_service.seed_creator_series_if_needed", new_callable=AsyncMock) as seed_series,
            patch("app.services.seed_service.seed_demo_user_if_needed", new_callable=AsyncMock) as seed_demo,
        ):
            await seed_all(redis)
            seed_questions.assert_awaited_once_with(redis)
            seed_series.assert_awaited_once_with(redis)
            seed_demo.assert_not_awaited()

            lookup.return_value = "legacy-demo-admin"
            with self.assertRaisesRegex(RuntimeError, "demo administrator exists"):
                await seed_all(redis)
            seed_questions.assert_awaited_once_with(redis)
            seed_demo.assert_not_awaited()

    def test_cors_origins_parsing(self):
        s_csv = Settings(CORS_ORIGINS="https://foo.com, https://bar.com")
        self.assertEqual(s_csv.CORS_ORIGINS, ["https://foo.com", "https://bar.com"])

        s_json = Settings(CORS_ORIGINS='["https://foo.com", "https://bar.com"]')
        self.assertEqual(s_json.CORS_ORIGINS, ["https://foo.com", "https://bar.com"])

    async def test_bounded_upload_reader_rejects_oversized_file(self):
        class MockUploadFile:
            def __init__(self, data: bytes):
                self._stream = io.BytesIO(data)

            async def read(self, size: int = -1) -> bytes:
                return self._stream.read(size)

        small_file = MockUploadFile(b"small content")
        result = await _read_upload_file_bounded(small_file, max_bytes=100)
        self.assertEqual(result, b"small content")

        large_file = MockUploadFile(b"x" * 200)
        with self.assertRaises(HTTPException) as ctx:
            await _read_upload_file_bounded(large_file, max_bytes=100)
        self.assertEqual(ctx.exception.status_code, 413)


if __name__ == "__main__":
    unittest.main()
