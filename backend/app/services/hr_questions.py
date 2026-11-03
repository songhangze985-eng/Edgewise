"""Load HR interview questions from YAML and build round question lists."""

from __future__ import annotations

import random
from functools import lru_cache
from pathlib import Path
from typing import Any

import yaml

HR_QUESTIONS_PATH = Path(__file__).resolve().parent.parent / "data" / "hr_questions.yaml"

THEME_ORDER = ("motivation", "stability", "city", "salary_expectation", "personal")


@lru_cache(maxsize=1)
def load_hr_catalog() -> dict[str, list[dict[str, Any]]]:
    raw = yaml.safe_load(HR_QUESTIONS_PATH.read_text(encoding="utf-8")) or {}
    themes = raw.get("themes") or {}
    catalog: dict[str, list[dict[str, Any]]] = {}
    for theme, items in themes.items():
        catalog[str(theme)] = list(items or [])
    return catalog


def pick_hr_questions(question_count: int) -> list[dict[str, Any]]:
    """Pick HR questions covering core themes; personal items optional."""
    catalog = load_hr_catalog()
    count = max(1, min(8, question_count))
    picked: list[dict[str, Any]] = []
    used_ids: set[str] = set()

    for theme in THEME_ORDER:
        if len(picked) >= count:
            break
        if theme == "personal" and len(picked) >= count - 1:
            continue
        pool = [q for q in catalog.get(theme, []) if q.get("id") not in used_ids]
        if not pool:
            continue
        choice = random.choice(pool)
        used_ids.add(choice["id"])
        picked.append({**choice, "theme": theme})

    all_flat = [q for theme in THEME_ORDER for q in catalog.get(theme, [])]
    while len(picked) < count:
        pool = [q for q in all_flat if q.get("id") not in used_ids]
        if not pool:
            break
        choice = random.choice(pool)
        used_ids.add(choice["id"])
        theme = choice.get("theme") or "motivation"
        for t in THEME_ORDER:
            if choice in catalog.get(t, []):
                theme = t
                break
        picked.append({**choice, "theme": theme})

    random.shuffle(picked)
    return picked[:count]


def hr_question_session_item(q: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": q.get("id") or f"hr_{random.randint(1000, 9999)}",
        "type": "hr",
        "title": q.get("title") or "",
        "category": "HR面",
        "theme": q.get("theme") or "motivation",
        "declinable": bool(q.get("declinable")),
        "keywords": list(q.get("keywords") or []),
        "answer": None,
        "score": None,
        "logic_score": None,
        "logic_rule_version": None,
        "answer_valid": None,
        "invalid_reason": None,
        "declined": False,
    }
