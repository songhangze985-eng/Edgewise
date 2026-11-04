from __future__ import annotations

import io
import unittest
from unittest.mock import AsyncMock

from fastapi import HTTPException

from app.config import INSECURE_JWT_SECRET, Settings
from app.api.v1.resume import _read_upload_file_bounded


class TestSecurityGuards(unittest.IsolatedAsyncioTestCase):
    def test_require_secure_jwt_blocks_non_dev_with_insecure_default(self):
        # Non-dev environment must refuse default insecure placeholder
        prod_settings = Settings(
            APP_ENV="production",
            JWT_SECRET=INSECURE_JWT_SECRET,
        )
        with self.assertRaises(RuntimeError) as ctx:
            prod_settings.require_secure_jwt()
        self.assertIn("JWT_SECRET cannot use the insecure default placeholder", str(ctx.exception))

        staging_settings = Settings(
            APP_ENV="staging",
            JWT_SECRET=INSECURE_JWT_SECRET,
        )
        with self.assertRaises(RuntimeError):
            staging_settings.require_secure_jwt()

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
