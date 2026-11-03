"""Salary negotiation simulation (script + rules, not real market data)."""

from __future__ import annotations

import random
import re
from functools import lru_cache
from pathlib import Path
from typing import Any

import yaml

SCRIPT_PATH = Path(__file__).resolve().parent.parent / "data" / "negotiation_script.yaml"

ACCEPT_PATTERN = re.compile(r"接受\s*offer|同意\s*offer|可以\s*接受", re.I)
DECLINE_PATTERN = re.compile(r"拒绝|不考虑|算了|放弃\s*offer", re.I)
SALARY_PATTERN = re.compile(r"(\d{2,3})\s*[kK]|(\d{4,6})\s*元")


@lru_cache(maxsize=1)
def load_negotiation_script() -> dict[str, Any]:
    return yaml.safe_load(SCRIPT_PATH.read_text(encoding="utf-8")) or {}


def negotiation_disclaimer() -> str:
    return str(load_negotiation_script().get("disclaimer") or "")


def compute_initial_offer(floor_k: float) -> int:
    """floor_k: user expectation floor in 千元/月."""
    floor_yuan = max(1.0, float(floor_k)) * 1000.0
    pct = random.uniform(0.85, 0.95)
    return int(round(floor_yuan * pct))


def _parse_anchor_yuan(text: str) -> int | None:
    for m in SALARY_PATTERN.finditer(text or ""):
        if m.group(1):
            return int(m.group(1)) * 1000
        if m.group(2):
            return int(m.group(2))
    return None


def _evaluate_turn(text: str) -> dict[str, Any]:
    stripped = (text or "").strip()
    anchor = _parse_anchor_yuan(stripped)
    has_interval = bool(re.search(r"区间|到|—|–|-\s*\d|~\s*\d", stripped)) or anchor is not None
    rationale_hits = sum(
        1
        for token in ("因为", "依据", "市场", "能力", "成本", "生活", "对标", "涨幅", "package", "奖金")
        if token in stripped
    )
    structure_hits = sum(
        1 for token in ("首先", "其次", "另外", "第一", "第二", "综上", "同时") if token in stripped
    )
    interval_score = 30 if has_interval else 8
    rationale_score = min(40, 12 + rationale_hits * 8)
    structure_score = min(30, 10 + structure_hits * 6)
    total = min(100, interval_score + rationale_score + structure_score)
    return {
        "anchor_yuan": anchor,
        "interval_score": interval_score,
        "rationale_score": rationale_score,
        "structure_score": structure_score,
        "turn_score": float(total),
        "has_interval": has_interval,
    }


def init_negotiation_block(*, floor_k: float, ceiling_k: float | None = None) -> dict[str, Any]:
    initial = compute_initial_offer(floor_k)
    return {
        "initial_offer": initial,
        "user_anchor": None,
        "final_offer": None,
        "turns": [],
        "state": "presented",
        "floor_k": floor_k,
        "ceiling_k": ceiling_k,
        "outcome": None,
    }


def _format_prompt(template: str, **kwargs: Any) -> str:
    try:
        return template.format(**kwargs).strip()
    except KeyError:
        return template.strip()


def process_negotiation_turn(
    negotiation: dict[str, Any],
    user_message: str,
) -> dict[str, Any]:
    """Append a turn and advance state machine. Mutates negotiation in place."""
    script = load_negotiation_script()
    state = negotiation.get("state") or "presented"
    offer = int(negotiation.get("final_offer") or negotiation.get("initial_offer") or 0)
    evaluation = _evaluate_turn(user_message)
    anchor = evaluation.get("anchor_yuan")
    if anchor:
        negotiation["user_anchor"] = anchor

    turn_record = {
        "user_message": user_message,
        "state_before": state,
        "evaluation": evaluation,
    }

    hr_reply = ""
    done = False
    outcome = negotiation.get("outcome")

    if ACCEPT_PATTERN.search(user_message or ""):
        negotiation["final_offer"] = offer
        negotiation["state"] = "closed_accept"
        outcome = "accept"
        done = True
        hr_reply = _format_prompt(
            (script.get("states") or {}).get("closed_accept", {}).get("hr_prompt", ""),
            final_offer=offer,
        )
    elif DECLINE_PATTERN.search(user_message or ""):
        negotiation["state"] = "closed_decline"
        outcome = "decline"
        done = True
        hr_reply = (script.get("states") or {}).get("closed_decline", {}).get("hr_prompt", "")
    elif state == "presented":
        if evaluation["turn_score"] < 45 or not evaluation["has_interval"]:
            negotiation["state"] = "clarify"
            hr_reply = (script.get("states") or {}).get("clarify", {}).get("hr_prompt", "")
        else:
            negotiation["state"] = "counter"
            if anchor and anchor > offer:
                bump = min(anchor - offer, int(offer * 0.08) + 500)
                offer = offer + max(200, bump // 2)
                negotiation["final_offer"] = offer
            hr_reply = _format_prompt(
                (script.get("states") or {}).get("counter", {}).get("hr_prompt", ""),
                anchor=negotiation.get("user_anchor") or "—",
                offer=offer,
            )
    elif state in ("counter", "clarify"):
        if evaluation["turn_score"] < 50:
            negotiation["state"] = "clarify"
            hr_reply = (script.get("states") or {}).get("clarify", {}).get("hr_prompt", "")
        elif len(negotiation.get("turns") or []) >= 2:
            negotiation["state"] = "package"
            hints = script.get("bonus_hints") or ["年终奖金系数"]
            hr_reply = _format_prompt(
                (script.get("states") or {}).get("package", {}).get("hr_prompt", ""),
                offer=offer,
                bonus_hint=random.choice(hints),
            )
        else:
            negotiation["state"] = "counter"
            if anchor and anchor > offer:
                offer = min(anchor, offer + max(300, int((anchor - offer) * 0.35)))
                negotiation["final_offer"] = offer
            hr_reply = _format_prompt(
                (script.get("states") or {}).get("counter", {}).get("hr_prompt", ""),
                anchor=negotiation.get("user_anchor") or "—",
                offer=offer,
            )
    elif state == "package":
        if ACCEPT_PATTERN.search(user_message or "") or evaluation["turn_score"] >= 60:
            negotiation["final_offer"] = offer
            negotiation["state"] = "closed_accept"
            outcome = "accept"
            done = True
            hr_reply = _format_prompt(
                (script.get("states") or {}).get("closed_accept", {}).get("hr_prompt", ""),
                final_offer=offer,
            )
        else:
            negotiation["state"] = "closed_decline"
            outcome = "decline"
            done = True
            hr_reply = (script.get("states") or {}).get("closed_decline", {}).get("hr_prompt", "")

    turn_record["hr_reply"] = hr_reply
    turn_record["state_after"] = negotiation.get("state")
    turn_record["offer_after"] = offer
    turns = list(negotiation.get("turns") or [])
    turns.append(turn_record)
    negotiation["turns"] = turns
    negotiation["outcome"] = outcome

    if done and negotiation.get("final_offer") is None:
        negotiation["final_offer"] = offer

    round_score = None
    if done:
        scores = [t.get("evaluation", {}).get("turn_score") for t in turns if t.get("evaluation")]
        numeric = [float(s) for s in scores if isinstance(s, (int, float))]
        if numeric:
            round_score = round(sum(numeric) / len(numeric), 1)

    return {
        "hr_reply": hr_reply,
        "state": negotiation.get("state"),
        "offer": offer,
        "done": done,
        "outcome": outcome,
        "evaluation": evaluation,
        "round_score": round_score,
        "disclaimer": negotiation_disclaimer(),
    }
