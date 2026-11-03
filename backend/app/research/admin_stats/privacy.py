from __future__ import annotations

import hashlib
import hmac
import math
import re
from typing import Any

from app.config import settings

SMALL_N = 5


def research_hash_secret() -> str:
    return getattr(settings, "RESEARCH_HASH_SECRET", None) or settings.JWT_SECRET


def user_hash(user_id: str) -> str:
    digest = hmac.new(
        research_hash_secret().encode("utf-8"),
        user_id.encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()
    return digest[:12]


def resolve_user_id_by_hash(redis_user_ids: list[str], query_hash: str) -> str | None:
    target = query_hash.strip().lower()
    for uid in redis_user_ids:
        if user_hash(uid).lower() == target:
            return uid
    return None


def suppress_count(value: int | float | None) -> int | str | None:
    if value is None:
        return None
    n = int(value)
    if 0 < n < SMALL_N:
        return "<5"
    return n


def suppress_rate(numerator: int | None, denominator: int | None, rate: float | None) -> float | None:
    if denominator is not None and 0 < denominator < SMALL_N:
        return None
    if numerator is not None and 0 < numerator < SMALL_N:
        return None
    return rate


def bucket_total(total: int) -> int | str:
    if total < SMALL_N:
        return "<5"
    if total < 25:
        low = (total // 5) * 5
        high = low + 4
        return f"{low}–{high}"
    return total


def apply_small_n_dict(data: dict[str, Any]) -> dict[str, Any]:
    out: dict[str, Any] = {}
    for key, val in data.items():
        if isinstance(val, int) and key.endswith("_n") or key in ("n", "count", "total"):
            out[key] = suppress_count(val)
        else:
            out[key] = val
    return out


MASK_PHONE = re.compile(r"1[3-9]\d{9}")
MASK_EMAIL = re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}")
MASK_ID = re.compile(r"\d{17}[\dXx]|\d{15}")


def mask_sensitive_text(text: str) -> str:
    if not text:
        return text
    masked = MASK_PHONE.sub("[手机号已隐藏]", text)
    masked = MASK_EMAIL.sub("[邮箱已隐藏]", masked)
    masked = MASK_ID.sub("[证件号已隐藏]", masked)
    return masked


def wilson_interval(successes: int, trials: int, z: float = 1.96) -> tuple[float | None, float | None]:
    if trials <= 0:
        return None, None
    p = successes / trials
    denom = 1 + z**2 / trials
    center = (p + z**2 / (2 * trials)) / denom
    margin = (z / denom) * math.sqrt(p * (1 - p) / trials + z**2 / (4 * trials**2))
    return max(0.0, center - margin), min(1.0, center + margin)
