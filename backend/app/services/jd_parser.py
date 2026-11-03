"""JD keyword extraction via lexicon (default provider)."""

from __future__ import annotations

import re
from abc import ABC, abstractmethod
from functools import lru_cache
from pathlib import Path
from typing import Any

import yaml

_LEXICON_PATH = Path(__file__).resolve().parent.parent / "data" / "skill_lexicon.yaml"


@lru_cache(maxsize=1)
def _load_lexicon_entries() -> list[dict[str, Any]]:
    if not _LEXICON_PATH.is_file():
        return []
    raw = yaml.safe_load(_LEXICON_PATH.read_text(encoding="utf-8")) or {}
    return list(raw.get("entries") or [])


def _normalize_text(text: str) -> str:
    return (text or "").lower()


class JDParser(ABC):
    @abstractmethod
    def extract_keywords(self, jd_text: str, *, extra_terms: list[str] | None = None) -> list[str]:
        ...


class LexiconJDParser(JDParser):
    """Match canonical terms and aliases against JD plain text."""

    def extract_keywords(self, jd_text: str, *, extra_terms: list[str] | None = None) -> list[str]:
        haystack = _normalize_text(jd_text)
        if not haystack.strip() and not extra_terms:
            return []

        found: list[str] = []
        seen: set[str] = set()

        for entry in _load_lexicon_entries():
            term = (entry.get("term") or "").strip()
            if not term:
                continue
            needles = [term] + list(entry.get("aliases") or [])
            matched = False
            for needle in needles:
                n = (needle or "").strip()
                if len(n) < 2:
                    continue
                if n.lower() in haystack or n in jd_text:
                    matched = True
                    break
            if matched and term not in seen:
                seen.add(term)
                found.append(term)

        for raw in extra_terms or []:
            token = (raw or "").strip()
            if len(token) < 2 or token in seen:
                continue
            seen.add(token)
            found.append(token)

        return found


default_jd_parser: JDParser = LexiconJDParser()


def extract_resume_skill_terms(resume_record: dict | None) -> list[str]:
    """Resume-side terms for JD match (parsed skills + lexicon hits on preview)."""
    if not resume_record:
        return []
    parsed = resume_record.get("parsed_data") or {}
    terms: list[str] = []
    seen: set[str] = set()

    for skill in parsed.get("skills") or []:
        s = str(skill).strip()
        if s and s not in seen:
            seen.add(s)
            terms.append(s)

    preview = resume_record.get("preview_text") or ""
    parser = default_jd_parser
    for term in parser.extract_keywords(preview):
        if term not in seen:
            seen.add(term)
            terms.append(term)

    for project in parsed.get("projects") or []:
        name = (project.get("name") if isinstance(project, dict) else getattr(project, "name", "")) or ""
        name = str(name).strip()
        if name and len(name) <= 24 and name not in seen:
            seen.add(name)
            terms.append(name)

    return terms


def compute_skill_match(jd_keywords: list[str], resume_terms: list[str]) -> dict[str, Any]:
    jd_set = {k.strip() for k in jd_keywords if k and str(k).strip()}
    resume_set = {k.strip() for k in resume_terms if k and str(k).strip()}
    if not jd_set and not resume_set:
        return {"overlap": [], "jd_only": [], "resume_only": [], "coverage": 0.0}

    def norm_key(s: str) -> str:
        return s.lower()

    jd_norm = {norm_key(k): k for k in jd_set}
    resume_norm = {norm_key(k): k for k in resume_set}

    overlap_keys = set(jd_norm.keys()) & set(resume_norm.keys())
    jd_only_keys = set(jd_norm.keys()) - overlap_keys
    resume_only_keys = set(resume_norm.keys()) - overlap_keys

    overlap = sorted(jd_norm[k] for k in overlap_keys)
    jd_only = sorted(jd_norm[k] for k in jd_only_keys)
    resume_only = sorted(resume_norm[k] for k in resume_only_keys)
    coverage = round(100.0 * len(overlap) / len(jd_set), 1) if jd_set else 0.0

    return {
        "overlap": overlap,
        "jd_only": jd_only,
        "resume_only": resume_only,
        "coverage": coverage,
    }


def infer_job_title(jd_text: str) -> str | None:
    """First non-empty line that looks like a role title (no long boilerplate)."""
    for line in (jd_text or "").splitlines():
        candidate = line.strip()
        if not candidate or len(candidate) > 60:
            continue
        if re.search(r"[@#]|http|职责[:：]|要求[:：]|qualification", candidate, re.I):
            continue
        if len(candidate) >= 2:
            return candidate[:80]
    return None
