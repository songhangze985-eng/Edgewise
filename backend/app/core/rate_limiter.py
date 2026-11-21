"""Redis Sliding-Window & Token-Bucket API Anti-Scraping Rate Limiter (`rate_limiter.py`).

Enforces 4-tier anti-scraping & DoS protection across `/api/v1/*`:
  1. `auth` (`/api/v1/auth/login`, `/api/v1/auth/register`): 20 req / 60s (anti-brute-force)
  2. `heavy_ai` (`/agent-turn`, `/stream-turn`, `/resume-screener`, `/post-deep-dive-probes`, `/upload`): 30 req / 60s
  3. `telemetry` (`/research/events`, `/observer-tag`): 120 req / 60s
  4. `default` (all other `/api/v1/*` endpoints): 240 req / 60s
"""

from __future__ import annotations

import hashlib
import time
from typing import Any

from fastapi import Request
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware

from app.config import settings
from app.core.redis_client import get_cache_telemetry

RATE_LIMIT_TIERS: dict[str, dict[str, int]] = {
    "auth": {"limit": 20, "window_seconds": 60},
    "heavy_ai": {"limit": 30, "window_seconds": 60},
    "telemetry": {"limit": 120, "window_seconds": 60},
    "default": {"limit": 240, "window_seconds": 60},
}


def classify_path_tier(path: str, method: str = "GET") -> str:
    p = (path or "").lower()
    if "/auth/login" in p or "/auth/register" in p:
        return "auth"
    if any(
        token in p
        for token in (
            "/agent-turn",
            "/stream-turn",
            "/resume-screener",
            "/post-deep-dive-probes",
            "/hr-pressure-probe",
            "/upload",
        )
    ):
        return "heavy_ai"
    if "/research/events" in p or "/observer-tag" in p:
        return "telemetry"
    return "default"


def extract_client_subject(request: Request) -> str:
    auth_header = request.headers.get("authorization") or ""
    if auth_header.lower().startswith("bearer "):
        token = auth_header[7:].strip()
        if token:
            digest = hashlib.sha256(token.encode("utf-8")).hexdigest()[:16]
            return f"usr_{digest}"
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        ip = forwarded.split(",")[0].strip()
    elif request.client and request.client.host:
        ip = request.client.host
    else:
        ip = "127.0.0.1"
    return f"ip_{ip}"


class ApiRateLimiter:
    """Hybrid Redis + in-memory sliding-window rate limiter with telemetry."""

    def __init__(self) -> None:
        self._memory_counters: dict[str, tuple[int, float]] = {}
        self.telemetry: dict[str, Any] = {
            "allowed_requests": 0,
            "blocked_requests": 0,
            "blocked_by_tier": {"auth": 0, "heavy_ai": 0, "telemetry": 0, "default": 0},
        }

    def reset(self) -> None:
        self._memory_counters.clear()
        self.telemetry["allowed_requests"] = 0
        self.telemetry["blocked_requests"] = 0
        for k in self.telemetry["blocked_by_tier"]:
            self.telemetry["blocked_by_tier"][k] = 0

    async def check_rate_limit(
        self,
        subject: str,
        tier: str = "default",
        *,
        redis: Any = None,
        custom_limit: int | None = None,
        window_seconds: int | None = None,
    ) -> dict[str, Any]:
        cfg = RATE_LIMIT_TIERS.get(tier, RATE_LIMIT_TIERS["default"])
        limit = custom_limit if custom_limit is not None else cfg["limit"]
        window = window_seconds if window_seconds is not None else cfg["window_seconds"]

        now = time.time()
        bucket = int(now // window)
        reset_seconds = max(1, int((bucket + 1) * window - now))
        rl_key = f"rl:{tier}:{subject}:{bucket}"

        current_count = 0
        used_redis = False
        if redis is not None and hasattr(redis, "incr"):
            try:
                current_count = int(await redis.incr(rl_key))
                if current_count == 1 and hasattr(redis, "expire"):
                    await redis.expire(rl_key, window + 2)
                used_redis = True
            except Exception:
                used_redis = False

        if not used_redis:
            prev_count, exp_at = self._memory_counters.get(rl_key, (0, now + window))
            if now >= exp_at:
                prev_count = 0
                exp_at = now + window
            current_count = prev_count + 1
            self._memory_counters[rl_key] = (current_count, exp_at)

        allowed = current_count <= limit
        remaining = max(0, limit - current_count)

        if allowed:
            self.telemetry["allowed_requests"] += 1
        else:
            self.telemetry["blocked_requests"] += 1
            if tier in self.telemetry["blocked_by_tier"]:
                self.telemetry["blocked_by_tier"][tier] += 1

        return {
            "allowed": allowed,
            "tier": tier,
            "subject": subject,
            "limit": limit,
            "current": current_count,
            "remaining": remaining,
            "reset_seconds": reset_seconds,
            "engine": "redis_atomic_window" if used_redis else "memory_sliding_window",
        }

    def get_telemetry(self) -> dict[str, Any]:
        return {
            "enabled": settings.RATE_LIMIT_ENABLED,
            "tiers": RATE_LIMIT_TIERS,
            **self.telemetry,
        }


api_rate_limiter = ApiRateLimiter()


class RateLimitMiddleware(BaseHTTPMiddleware):
    """FastAPI HTTP Middleware enforcing tiered anti-scraping rate limits."""

    async def dispatch(self, request: Request, call_next):
        if not settings.RATE_LIMIT_ENABLED or not request.url.path.startswith("/api/v1"):
            return await call_next(request)

        tier = classify_path_tier(request.url.path, request.method)
        subject = extract_client_subject(request)
        redis = getattr(request.app.state, "redis", None)

        verdict = await api_rate_limiter.check_rate_limit(subject, tier, redis=redis)
        headers = {
            "X-RateLimit-Tier": verdict["tier"],
            "X-RateLimit-Limit": str(verdict["limit"]),
            "X-RateLimit-Remaining": str(verdict["remaining"]),
            "X-RateLimit-Reset": str(verdict["reset_seconds"]),
            "X-Cache-HitRate": f"{get_cache_telemetry()['hit_rate_pct']}%",
        }

        if not verdict["allowed"]:
            headers["Retry-After"] = str(verdict["reset_seconds"])
            return JSONResponse(
                status_code=429,
                content={
                    "detail": f"请求过于频繁（触发 {verdict['tier']} 级防刷限流保护），请在 {verdict['reset_seconds']} 秒后重试。",
                    "rate_limit": verdict,
                },
                headers=headers,
            )

        response = await call_next(request)
        for hk, hv in headers.items():
            response.headers[hk] = hv
        return response
