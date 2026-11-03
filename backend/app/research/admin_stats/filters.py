from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Any


@dataclass
class StatsFilters:
    date_from: datetime | None = None
    date_to: datetime | None = None
    zc: list[int] | None = None
    zp: list[int] | None = None
    channel: str | None = None
    institution: str | None = None
    rule_version: str | None = None
    survey_version: str | None = None

    @classmethod
    def from_query(
        cls,
        *,
        from_: str | None = None,
        to: str | None = None,
        zc: str | None = None,
        zp: str | None = None,
        channel: str | None = None,
        institution: str | None = None,
        rule_version: str | None = None,
        survey_version: str | None = None,
    ) -> StatsFilters:
        def parse_list(raw: str | None) -> list[int] | None:
            if not raw:
                return None
            return [int(x) for x in raw.split(",") if x.strip().isdigit()]

        def parse_dt(raw: str | None) -> datetime | None:
            if not raw:
                return None
            return datetime.fromisoformat(raw.replace("Z", "+00:00"))

        return cls(
            date_from=parse_dt(from_),
            date_to=parse_dt(to),
            zc=parse_list(zc),
            zp=parse_list(zp),
            channel=channel or None,
            institution=institution or None,
            rule_version=rule_version or None,
            survey_version=survey_version or None,
        )

    def to_cache_params(self) -> dict[str, Any]:
        return {
            "from": self.date_from.isoformat() if self.date_from else None,
            "to": self.date_to.isoformat() if self.date_to else None,
            "zc": ",".join(str(x) for x in self.zc) if self.zc else None,
            "zp": ",".join(str(x) for x in self.zp) if self.zp else None,
            "channel": self.channel,
            "institution": self.institution,
            "rule_version": self.rule_version,
            "survey_version": self.survey_version,
        }


def parse_iso(ts: str | None) -> datetime | None:
    if not ts:
        return None
    try:
        return datetime.fromisoformat(ts.replace("Z", "+00:00"))
    except ValueError:
        return None


def row_matches_filters(row: dict[str, Any], filters: StatsFilters) -> bool:
    consent_at = parse_iso(row.get("consent_at"))
    if filters.date_from and consent_at and consent_at < filters.date_from:
        return False
    if filters.date_to and consent_at and consent_at > filters.date_to:
        return False
    if filters.zc is not None and row.get("zc") not in filters.zc:
        return False
    if filters.zp is not None and row.get("zp") not in filters.zp:
        return False
    if filters.channel and row.get("entry_channel") != filters.channel:
        return False
    if filters.institution and row.get("institution_id") != filters.institution:
        return False
    if filters.rule_version and row.get("rule_version") != filters.rule_version:
        return False
    if filters.survey_version and row.get("survey_version") != filters.survey_version:
        return False
    return True
