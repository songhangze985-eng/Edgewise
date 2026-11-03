from __future__ import annotations

import re

EMAIL_RE = re.compile(
    r"[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}",
    re.IGNORECASE,
)
PHONE_RE = re.compile(
    r"(?<!\d)(?:\+?86[-\s]?)?1[3-9]\d{9}(?!\d)|(?<!\d)\d{3,4}[-\s]?\d{7,8}(?!\d)",
)
CN_ID_RE = re.compile(r"(?<!\d)\d{17}[\dXx](?!\d)")


def contains_private_contact(text: str) -> bool:
    if not text or not str(text).strip():
        return False
    s = str(text)
    return bool(EMAIL_RE.search(s) or PHONE_RE.search(s) or CN_ID_RE.search(s))


def strip_private_contact(text: str) -> str:
    if not text:
        return ""
    s = str(text)
    s = EMAIL_RE.sub("[已移除]", s)
    s = PHONE_RE.sub("[已移除]", s)
    s = CN_ID_RE.sub("[已移除]", s)
    return s


def validate_experience_payload(
    *,
    company: str,
    role: str,
    stage: str,
    date_month: str,
    questions: list[str],
) -> None:
    blob = "\n".join([company, role, stage, date_month, *questions])
    if contains_private_contact(blob):
        raise ValueError("content_contains_private_contact")
