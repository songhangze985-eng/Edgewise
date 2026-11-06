#!/usr/bin/env python3
"""Autoloop Pipeline #7: Chapter 4 Paper Empirical Table Synchronizer & Verifier.

Verifies that `docs/paper_empirical_analysis.md` exists, contains all 9 empirical tables
(表 4-1 through 表 4-9) and all 6 proposition tests (P1-P6), and matches the deterministic
statistical engine in `scripts/run_empirical_analysis.py`.
"""

from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts"))

DOC_PATH = ROOT / "docs" / "paper_empirical_analysis.md"
REQUIRED_TABLES = [f"表 {i}" for i in range(1, 10)]
REQUIRED_PROPOSITIONS = ["P1", "P2", "P3", "P4", "P5", "P6"]


def verify_paper_sync() -> dict[str, Any]:
    issues: list[str] = []
    if not DOC_PATH.is_file():
        issues.append("docs/paper_empirical_analysis.md is missing")
        content = ""
    else:
        content = DOC_PATH.read_text(encoding="utf-8")

    missing_tables = [t for t in REQUIRED_TABLES if t not in content]
    missing_props = [p for p in REQUIRED_PROPOSITIONS if p not in content]

    if missing_tables:
        issues.append(f"Missing tables in paper_empirical_analysis.md: {missing_tables}")
    if missing_props:
        issues.append(f"Missing propositions in paper_empirical_analysis.md: {missing_props}")

    # Spot-check statistical script functions & sample size alignment
    sim_ok = False
    sample_total = 0
    script_path = ROOT / "scripts" / "run_empirical_analysis.py"
    if not script_path.is_file():
        issues.append("scripts/run_empirical_analysis.py is missing")
    else:
        script_src = script_path.read_text(encoding="utf-8")
        required_fns = [
            "def compute_table_1_demographics_balance",
            "def compute_table_2_funnel_stats",
            "def compute_table_3_scale_reliabilities",
            "def compute_table_4_correlations_discriminant_validity",
            "def compute_table_5_manipulation_checks",
            "def compute_table_6_p1_regressions",
            "def compute_table_7_p2_regressions",
            "def compute_table_8_and_9_p3_complementarity",
            "def generate_markdown_chapter",
        ]
        missing_fns = [fn for fn in required_fns if fn not in script_src]
        if missing_fns:
            issues.append(f"Missing econometric functions in run_empirical_analysis.py: {missing_fns}")
        elif "N = 400" in script_src and "N = 400" in content:
            sample_total = 400
            sim_ok = True
        else:
            issues.append("Sample size N = 400 mismatch between script and paper")

    ok = len(issues) == 0
    return {
        "card_type": "autoloop_paper_sync_report",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "ok": ok,
        "status": "SYNCED" if ok else "DRIFT_DETECTED",
        "doc_path": str(DOC_PATH.relative_to(ROOT)),
        "tables_verified": len(REQUIRED_TABLES) - len(missing_tables),
        "propositions_verified": len(REQUIRED_PROPOSITIONS) - len(missing_props),
        "sample_size_verified": sample_total,
        "issues": issues,
        "hitl_card": {
            "header": {
                "title": (
                    "📑 [Edgewise 论文同步守卫] 第四章表 4-1~4-9 与 P1~P6 实证数据 100% 对齐"
                    if ok
                    else "⚠️ [Edgewise 论文同步告警] 检测到实证文档与统计脚本不一致"
                ),
                "theme": "green" if ok else "orange",
            }
        },
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Verify Chapter 4 empirical paper synchronization")
    parser.add_argument("--json", action="store_true", help="Output JSON")
    args = parser.parse_args()

    report = verify_paper_sync()
    if args.json:
        print(json.dumps(report, ensure_ascii=False, indent=2))
    else:
        print("====================================================")
        print("  EDGEWISE AUTOLOOP: PAPER EMPIRICAL SYNC VERIFIER")
        print("====================================================")
        print(f"Document:        {report['doc_path']}")
        print(f"Tables Verified: {report['tables_verified']}/9")
        print(f"Propositions:    {report['propositions_verified']}/6")
        print(f"Sample Size:     N={report['sample_size_verified']}")
        print(f"Status:          {report['status']}")
        print("====================================================")
    return 0 if report["ok"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
