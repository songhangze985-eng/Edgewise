"""Read-only experiment policy helpers (does not assign arms)."""

from __future__ import annotations

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
