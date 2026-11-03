from __future__ import annotations

RULE_VERSION = "2026-11-03-v1"
SURVEY_ITEMS_VERSION = "2026-11-03-v1"

POSTTEST_PROBE_TEXT = (
    "请回忆你练习过的那段经历，回答下面这个问题："
    "「如果当时只有一半的时间，你会先砍掉哪部分工作？为什么？」"
)


def event_stream_key(user_id: str) -> str:
    return f"research:event:{user_id}"


def auto_hash_key(user_id: str) -> str:
    return f"research:auto:{user_id}"


def auto_meta_key(user_id: str) -> str:
    return f"research:auto:{user_id}:meta"


def survey_hash_key(user_id: str) -> str:
    return f"research:survey:{user_id}"


def survey_queue_key(user_id: str) -> str:
    return f"research:survey:{user_id}:queue"


def survey_shown_key(user_id: str) -> str:
    return f"research:survey:{user_id}:shown"


def survey_state_key(user_id: str) -> str:
    return f"research:survey:{user_id}:state"


def blind_pool_key() -> str:
    return "research:blind_review:pool"
