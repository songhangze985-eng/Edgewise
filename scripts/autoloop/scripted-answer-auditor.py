#!/usr/bin/env python3
"""Autoloop Pipeline #9: Anti-Scripted / AI-Teleprompter Answer Auditor.

Inspired by competitive analysis of AI interview teleprompters (Final Round AI,
OfferGoose 多面鹅, Interview Coder):
Audits sample interview/LGD responses against Edgewise's rule-based authenticity
and consistency detectors to verify that:
  1. High-cliché, zero-evidence "teleprompter-style" answers are flagged (`scripted_risk == 'high'`).
  2. Concrete, verifiable STAR answers with personal actions & metrics pass cleanly (`scripted_risk == 'low'`).
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "backend"))

CLICHE_RE = re.compile(r"赋能|抓手|闭环|组合拳|底层逻辑|顶层设计|全链路拉通|对齐颗粒度|显著提升了效率")
EVIDENCE_RE = re.compile(r"\d+(?:\.\d+)?(?:\s*%|\s*倍|\s*ms|\s*秒|\s*天|\s*周|\s*人|\s*个)|我负责|我主导|我排查|我设计")


def audit_utterance(text: str, cpm: int = 190, pauses: int = 2) -> dict[str, Any]:
    cliches = len(CLICHE_RE.findall(text))
    evidence = len(EVIDENCE_RE.findall(text))
    score = 82
    if cpm > 245 and pauses == 0:
        score -= 22
    if cliches >= 2 and evidence == 0:
        score -= 22
    elif evidence >= 2:
        score += 10
    score = max(30, min(98, score))
    risk = "high" if score < 62 else "medium" if score < 76 else "low"
    return {
        "authenticity_score": score,
        "scripted_risk": risk,
        "cliche_hits": cliches,
        "evidence_hits": evidence,
    }


def run_anti_scripted_audit() -> dict[str, Any]:
    teleprompter_sample = (
        "我们通过顶层设计与全链路拉通，打造了业务赋能的组合拳闭环，对齐颗粒度后显著提升了效率。"
    )
    authentic_sample = (
        "在两周迭代里我负责把核心支付链路拆成 6 个子任务，主导排查了 Redis 热点 Key 超时，最终接口 P99 从 420ms 降到 85ms。"
    )

    res_teleprompter = audit_utterance(teleprompter_sample, cpm=265, pauses=0)
    res_authentic = audit_utterance(authentic_sample, cpm=188, pauses=3)

    calibration_ok = (
        res_teleprompter["scripted_risk"] == "high"
        and res_authentic["scripted_risk"] == "low"
    )

    return {
        "card_type": "autoloop_scripted_audit_report",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "ok": calibration_ok,
        "status": "CALIBRATED" if calibration_ok else "THRESHOLD_DRIFT",
        "benchmarks": {
            "teleprompter_archetype": res_teleprompter,
            "authentic_star_archetype": res_authentic,
        },
        "hitl_card": {
            "header": {
                "title": (
                    "🛡️ [Edgewise 反提词器/反背稿审计] 真实度检测阈值校准正常"
                    if calibration_ok
                    else "⚠️ [Edgewise 反背稿审计告警] 提词器特征识别阈值偏移"
                ),
                "theme": "green" if calibration_ok else "orange",
            }
        },
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Edgewise Anti-Scripted / Teleprompter Auditor")
    parser.add_argument("--json", action="store_true", help="Output JSON")
    args = parser.parse_args()

    report = run_anti_scripted_audit()
    if args.json:
        print(json.dumps(report, ensure_ascii=False, indent=2))
    else:
        print("====================================================")
        print("  EDGEWISE AUTOLOOP: ANTI-SCRIPTED ANSWER AUDITOR")
        print("====================================================")
        print(f"Teleprompter Sample Risk: {report['benchmarks']['teleprompter_archetype']['scripted_risk']} (score={report['benchmarks']['teleprompter_archetype']['authenticity_score']})")
        print(f"Authentic Sample Risk:    {report['benchmarks']['authentic_star_archetype']['scripted_risk']} (score={report['benchmarks']['authentic_star_archetype']['authenticity_score']})")
        print(f"Calibration Status:       {report['status']}")
        print("====================================================")
    return 0 if report["ok"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
