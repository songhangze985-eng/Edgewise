from __future__ import annotations

from functools import lru_cache
from pathlib import Path
from typing import Any

import yaml

_DATA_PATH = Path(__file__).resolve().parent.parent / "data" / "lgd_topics.yaml"


@lru_cache(maxsize=1)
def load_lgd_topics() -> list[dict[str, Any]]:
    if not _DATA_PATH.is_file():
        return []
    raw = yaml.safe_load(_DATA_PATH.read_text(encoding="utf-8")) or {}
    topics = raw.get("topics") or []
    return [t for t in topics if isinstance(t, dict) and t.get("id")]


def get_topic_by_id(topic_id: str) -> dict[str, Any] | None:
    for topic in load_lgd_topics():
        if topic.get("id") == topic_id:
            return topic
    return None


def build_phases(duration_minutes: int) -> list[dict[str, int | str]]:
    """Fixed LGD flow: reading → personal statements (8×1min) → free → reporter summary."""
    total = max(300, int(duration_minutes) * 60)
    reading = min(120, max(60, total // 12))
    personal = 8 * 60
    summary = 180
    free = max(180, total - reading - personal - summary)
    return [
        {"name": "reading", "seconds": reading},
        {"name": "personal_statement", "seconds": personal},
        {"name": "free_discussion", "seconds": free},
        {"name": "summary_report", "seconds": summary},
    ]
