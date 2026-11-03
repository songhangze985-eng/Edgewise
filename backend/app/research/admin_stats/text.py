from __future__ import annotations

import re
from collections import Counter
from typing import Any

from app.research.admin_stats.privacy import mask_sensitive_text

STOPWORDS = frozenset(
    "的 了 在 是 我 有 和 就 不 人 都 一 一个 上 也 很 到 说 要 去 你 会 着 没有 看 好 自己 这".split()
)

try:
    import jieba  # type: ignore
except ImportError:  # pragma: no cover
    jieba = None


def tokenize(text: str) -> list[str]:
    text = mask_sensitive_text(text)
    if jieba:
        tokens = [t.strip() for t in jieba.cut(text) if t.strip()]
    else:
        tokens = re.findall(r"[\u4e00-\u9fff]{2,}|[a-zA-Z]{3,}", text)
    return [t for t in tokens if t not in STOPWORDS and len(t) >= 2]


def word_frequencies(texts: list[str], *, min_count: int = 3) -> list[dict[str, Any]]:
    counter: Counter[str] = Counter()
    for text in texts:
        counter.update(tokenize(text))
    return [
        {"word": word, "count": count}
        for word, count in counter.most_common(50)
        if count >= min_count
    ]
