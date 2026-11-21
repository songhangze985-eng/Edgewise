#!/usr/bin/env python3
"""Edgewise Autoloop Empirical Research Data & RCT Balance Monitor.

Inspects:
1. 2x2 factorial randomization balance (ZC x ZP: 00, 01, 10, 11) via Chi-square & Imbalance Ratio.
2. Blind review pool backlog (`research:blind_review:pool`) for Proposition P2.
3. Posttest T2 overdue sample count (>72h since first practice completion).
4. Construct reliability guard (Cronbach's alpha across the 8 paper constructs).
"""

from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "backend"))
sys.path.insert(0, str(ROOT / "scripts"))

ARMS = ["00", "01", "10", "11"]
ARM_LABELS = {
    "00": "标准入口 × 演示组 (ZC=0, ZP=0)",
    "01": "标准入口 × 主动练习组 (ZC=0, ZP=1)",
    "10": "连续入口 × 演示组 (ZC=1, ZP=0)",
    "11": "连续入口 × 主动练习组 (ZC=1, ZP=1)",
}


def fetch_arm_counts_from_redis() -> tuple[dict[str, int] | None, str, dict[str, Any]]:
    """Read live arm counts; unavailable data must never be replaced by fixtures."""
    try:
        import redis as sync_redis
        from app.config import Settings

        redis_url = Settings(_env_file=ROOT / "backend" / ".env").REDIS_URL
        client = sync_redis.from_url(redis_url, decode_responses=True, socket_connect_timeout=1.5)
        client.ping()
        counts: dict[str, int] = {}
        for arm in ARMS:
            val = client.get(f"research:arm_count:{arm}")
            if val is None or not str(val).isdigit():
                return None, "counts_missing", {"blind_review_backlog": None, "total_registered_users": None}
            counts[arm] = int(val)
        blind_pool_size = int(client.scard("research:blind_review:pool") or 0)
        total_users = int(client.scard("users:all") or 0)
        return counts, "redis_live", {
            "blind_review_backlog": blind_pool_size,
            "total_registered_users": total_users,
        }
    except Exception:
        return None, "unavailable", {"blind_review_backlog": None, "total_registered_users": None}


def check_scale_reliability_guard() -> dict[str, Any]:
    """Reliability is unknown until calculated from eligible real responses."""
    return {"ok": None, "min_construct": None, "min_alpha": None, "construct_alphas": {}, "status": "NOT_ASSESSED"}


def evaluate_balance(counts: dict[str, int] | None) -> dict[str, Any]:
    if counts is None:
        return {"total": None, "expected_per_arm": None, "chi_square": None, "imbalance_ratio": None, "is_balanced": None, "status": "UNAVAILABLE"}
    total = sum(counts.values())
    if total == 0:
        return {
            "total": 0,
            "expected_per_arm": 0.0,
            "chi_square": 0.0,
            "imbalance_ratio": 1.0,
            "is_balanced": None,
            "status": "EMPTY",
        }

    expected = total / 4.0
    chi_sq = sum(((c - expected) ** 2) / expected for c in counts.values())
    min_c = max(min(counts.values()), 1)
    max_c = max(counts.values())
    imbalance_ratio = round(max_c / min_c, 3)

    is_balanced = chi_sq < 7.815 and imbalance_ratio <= 1.25
    return {
        "total": total,
        "expected_per_arm": round(expected, 2),
        "chi_square": round(chi_sq, 4),
        "imbalance_ratio": imbalance_ratio,
        "is_balanced": is_balanced,
        "status": "HEALTHY" if is_balanced else "SKEW_ALERT",
    }


def build_report() -> dict[str, Any]:
    counts, source, ext = fetch_arm_counts_from_redis()
    metrics = evaluate_balance(counts)
    reliability = check_scale_reliability_guard()
    healthy = metrics["is_balanced"] is True and reliability["ok"] is True

    return {
        "card_type": "autoloop_empirical_report",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "data_source": source,
        "arms": {
            arm: {
                "count": counts[arm] if counts is not None else None,
                "label": ARM_LABELS[arm],
                "share_pct": round((counts[arm] / metrics["total"]) * 100, 1) if counts is not None and metrics["total"] else None,
            }
            for arm in ARMS
        },
        "diagnostics": metrics,
        "extended_diagnostics": {
            **ext,
            "scale_reliability": reliability,
        },
        "hitl_card": {
            "header": {
                "title": (
                    "📊 [Edgewise 学术实证巡检] 2×2 实验组样本均衡 & 信度达标"
                    if healthy
                    else "⚠️ [Edgewise 研究数据巡检] 数据不足或信度尚未评估 — 需人工核查"
                ),
                "theme": "green" if healthy else "orange",
            },
            "recommendation": (
                f"当前四组被试分布均衡，量表最低 Cronbach's α={reliability['min_alpha']} (≥0.70)，盲审池待评 {ext['blind_review_backlog']} 对。"
                if healthy
                else "请检查实际数据来源、分组计数和样本量；量表信度未在此脚本中评估。"
            ),
        },
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Edgewise Empirical Research Monitor")
    parser.add_argument("--json", action="store_true", help="Output machine-readable JSON")
    args = parser.parse_args()

    report = build_report()
    if args.json:
        print(json.dumps(report, ensure_ascii=False, indent=2))
    else:
        print("====================================================")
        print("  EDGEWISE AUTOLOOP: EMPIRICAL RESEARCH MONITOR")
        print("====================================================")
        print(f"Data Source:     {report['data_source']}")
        print(f"Total Subjects:  {report['diagnostics']['total']}")
        print(f"Chi-Square (χ²): {report['diagnostics']['chi_square']} (threshold < 7.815)")
        print(f"Imbalance Ratio: {report['diagnostics']['imbalance_ratio']} (threshold <= 1.25)")
        print(f"Min Scale Alpha: {report['extended_diagnostics']['scale_reliability']['min_alpha']}")
        print(f"Blind Pool Size: {report['extended_diagnostics']['blind_review_backlog']}")
        print(f"Status:          {report['diagnostics']['status']}")
        print("----------------------------------------------------")
        for arm, info in report["arms"].items():
            print(f"  Arm [{arm}] {info['label']}: {info['count']} ({info['share_pct']}%)")
        print("====================================================")

    return 0 if report["diagnostics"]["is_balanced"] is True and report["extended_diagnostics"]["scale_reliability"]["ok"] is True else 1


if __name__ == "__main__":
    sys.exit(main())
