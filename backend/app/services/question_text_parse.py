from __future__ import annotations

import re

QUESTION_START = re.compile(
    r"^\s*(?:"
    r"(?:(?:Q|q)\s*\d+\s*[:：.\-]?\s*)"
    r"|(?:\d+[\.、\)]\s*)"
    r")(?P<title>.+)\s*$"
)
CATEGORY_LINE = re.compile(r"^(?:分类|类别|题型)[:：]\s*(.+)$", re.IGNORECASE)
DIFFICULTY_LINE = re.compile(r"^难度[:：]\s*(.+)$", re.IGNORECASE)
STAR_LINES = {
    "s": re.compile(r"^(?:S|情境)[:：]\s*(.+)$", re.IGNORECASE),
    "t": re.compile(r"^(?:T|任务)[:：]\s*(.+)$", re.IGNORECASE),
    "a": re.compile(r"^(?:A|行动|做法)[:：]\s*(.+)$", re.IGNORECASE),
    "r": re.compile(r"^(?:R|结果)[:：]\s*(.+)$", re.IGNORECASE),
}

KNOWN_CATEGORIES = {"行为题", "逻辑题", "案例分析", "专业知识", "压力题", "创意题", "自定义"}
KNOWN_DIFFICULTIES = {"简单", "中等", "困难"}
DEFAULT_CATEGORY = "自定义"
DEFAULT_DIFFICULTY = "中等"
MIN_TITLE_LEN = 4


def _normalize_category(raw: str | None) -> str:
    if not raw:
        return DEFAULT_CATEGORY
    value = raw.strip()
    if value in KNOWN_CATEGORIES:
        return value
    for known in KNOWN_CATEGORIES:
        if known in value:
            return known
    return DEFAULT_CATEGORY


def _normalize_difficulty(raw: str | None) -> str:
    if not raw:
        return DEFAULT_DIFFICULTY
    value = raw.strip()
    if value in KNOWN_DIFFICULTIES:
        return value
    for known in KNOWN_DIFFICULTIES:
        if known in value:
            return known
    return DEFAULT_DIFFICULTY


def _parse_block(block: str) -> dict | None:
    lines = [line.strip() for line in block.strip().splitlines() if line.strip()]
    if not lines:
        return None

    title: str | None = None
    category: str | None = None
    difficulty: str | None = None
    star: dict[str, str] = {}
    body_lines: list[str] = []

    for line in lines:
        start_match = QUESTION_START.match(line)
        if start_match and title is None:
            title = start_match.group("title").strip()
            continue
        cat_match = CATEGORY_LINE.match(line)
        if cat_match:
            category = cat_match.group(1).strip()
            continue
        diff_match = DIFFICULTY_LINE.match(line)
        if diff_match:
            difficulty = diff_match.group(1).strip()
            continue
        matched_star = False
        for key, pattern in STAR_LINES.items():
            star_match = pattern.match(line)
            if star_match:
                star[key] = star_match.group(1).strip()
                matched_star = True
                break
        if matched_star:
            continue
        if title is None and not category and not difficulty and not star:
            title = line
        else:
            body_lines.append(line)

    if title is None and body_lines:
        title = body_lines.pop(0)

    if not title or len(title) < MIN_TITLE_LEN:
        return None

    payload: dict = {
        "title": title[:300],
        "category": _normalize_category(category),
        "difficulty": _normalize_difficulty(difficulty),
    }
    if star:
        payload["star"] = star
    if body_lines:
        extra = " ".join(body_lines).strip()
        if len(extra) >= MIN_TITLE_LEN:
            payload["ideal"] = extra[:5000]
    return payload


def _split_into_blocks(text: str) -> list[str]:
    normalized = text.replace("\r\n", "\n").strip()
    if not normalized:
        return []

    lines = normalized.split("\n")
    blocks: list[str] = []
    current: list[str] = []
    saw_numbered = False

    for line in lines:
        if QUESTION_START.match(line):
            saw_numbered = True
            if current:
                blocks.append("\n".join(current))
            current = [line]
        else:
            current.append(line)
    if current:
        blocks.append("\n".join(current))

    if saw_numbered and len(blocks) >= 1:
        return blocks

    delimiter_blocks = re.split(r"\n\s*---+\s*\n", normalized)
    if len(delimiter_blocks) > 1:
        return [block for block in delimiter_blocks if block.strip()]

    paragraph_blocks = re.split(r"\n\s*\n+", normalized)
    return [block for block in paragraph_blocks if block.strip()]


def parse_questions_from_text(text: str) -> list[dict]:
    blocks = _split_into_blocks(text)
    questions: list[dict] = []
    for block in blocks:
        record = _parse_block(block)
        if record:
            questions.append(record)
    return questions
