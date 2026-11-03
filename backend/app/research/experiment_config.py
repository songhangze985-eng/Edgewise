"""Read-only experiment policy helpers (does not assign arms)."""

from __future__ import annotations

from typing import Any

from app.services.interview_config import ROUNDS_FORCED_BY_ARM

# Feature keys whose user toggles may be overridden by experiment arm when True.
FORCED_BY_ARM: dict[str, bool] = {
    "tts": False,
    "rounds": False,
    "revision": True,
    "followup": True,
    "referral_incentive": True,
    "task_entry": True,
    "creator_variant": True,
}


def _arm_factors(arm: str | None) -> dict[str, int | None]:
    if not arm or len(arm) < 2:
        return {"ZC": None, "ZP": None, "code": None}
    return {
        "ZC": int(arm[0]),
        "ZP": int(arm[1]),
        "code": arm,
    }


def policy_for(user_data: dict[str, Any] | None) -> dict[str, Any]:
    """Return experiment participation context for a user record (read-only)."""
    user_data = user_data or {}
    assignment = user_data.get("experiment_assignment") or {}
    arm_code = assignment.get("arm")
    in_experiment = bool(arm_code)
    arm = _arm_factors(arm_code)

    forced: dict[str, bool] = {}
    for feature_key, enabled in FORCED_BY_ARM.items():
        forced[feature_key] = bool(enabled and in_experiment)
    if forced.get("referral_incentive"):
        forced["REFERRAL_INCENTIVE"] = True

    rounds_override = None
    if (
        FORCED_BY_ARM.get("rounds")
        and arm_code
        and ROUNDS_FORCED_BY_ARM
        and arm_code in ROUNDS_FORCED_BY_ARM
    ):
        rounds_override = arm_code

    return {
        "in_experiment": in_experiment,
        "arm": arm,
        "forced": forced,
        "rounds_override_arm": rounds_override,
    }
