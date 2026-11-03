"""1v1 interview constants (round weights, experiment overrides)."""

from __future__ import annotations

from typing import Any

# Per-round weights for final score (index 0 = round 1). Equal by default.
ROUND_WEIGHTS: list[float] = [1.0, 1.0, 1.0, 1.0, 1.0]

# When set, experiment arms use fixed rounds/mix instead of user choice (avoid confounds).
# Example:
# ROUNDS_FORCED_BY_ARM = {
#     "00": [{"name": "初面 · 综合", "question_count": 3, "mix": {"general": 1, "resume_specific": 1, "professional": 1}}],
# }
ROUNDS_FORCED_BY_ARM: dict[str, list[dict[str, Any]]] | None = None

LOGIC_RULE_VERSION = "1.1"

DEFAULT_ROUND_NAMES = [
    "初面 · 综合",
    "二面 · 专业",
    "终面 · 综合",
    "加面 · 深度",
    "终面 · 决策",
]

DEFAULT_MIX = {"general": 1, "resume_specific": 1, "professional": 1}
