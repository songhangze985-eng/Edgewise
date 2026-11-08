from __future__ import annotations

from functools import lru_cache
from pathlib import Path
from typing import Any

import yaml

_APTITUDE_PATH = Path(__file__).resolve().parent.parent / "data" / "aptitude_items.yaml"
_PERSONALITY_PATH = Path(__file__).resolve().parent.parent / "data" / "personality_items.yaml"


@lru_cache(maxsize=1)
def load_aptitude_bank() -> dict[str, Any]:
    if not _APTITUDE_PATH.is_file():
        return {"blocks": [], "items": [], "meta": {}}
    raw = yaml.safe_load(_APTITUDE_PATH.read_text(encoding="utf-8")) or {}
    items = [i for i in (raw.get("items") or []) if isinstance(i, dict) and i.get("id")]
    blocks = [b for b in (raw.get("blocks") or []) if isinstance(b, dict) and b.get("category")]
    return {"meta": raw.get("meta") or {}, "blocks": blocks, "items": items}


@lru_cache(maxsize=1)
def load_personality_bank() -> dict[str, Any]:
    if not _PERSONALITY_PATH.is_file():
        return {"items": [], "meta": {}}
    raw = yaml.safe_load(_PERSONALITY_PATH.read_text(encoding="utf-8")) or {}
    items = [i for i in (raw.get("items") or []) if isinstance(i, dict) and i.get("id")]
    return {"meta": raw.get("meta") or {}, "items": items}
