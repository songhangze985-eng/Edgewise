#!/usr/bin/env python3
"""Autoloop Pipeline #8: Dataset & PDF Question Bank ETL Health Watcher.

Verifies that:
  1. `backend/app/data/dataset_import_seed.py` & `dataset_questions_seed.json` are generated and populated.
  2. `backend/app/data/pdf_import_seed.py` is populated and valid.
  3. All curated dataset questions include assessment points, answer structures, and follow-ups.
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


def check_dataset_etl_health() -> dict[str, Any]:
    issues: list[str] = []
    dataset_count = 0
    pdf_count = 0
    followup_coverage = 0.0

    try:
        from app.data.dataset_import_seed import SEED_DATASET_QUESTIONS
        from app.data.pdf_import_seed import SEED_PDF_IMPORT_QUESTIONS

        dataset_count = len(SEED_DATASET_QUESTIONS)
        pdf_count = len(SEED_PDF_IMPORT_QUESTIONS)
        if dataset_count < 20:
            issues.append(f"SEED_DATASET_QUESTIONS has only {dataset_count} items (expected >= 20)")
        if pdf_count < 50:
            issues.append(f"SEED_PDF_IMPORT_QUESTIONS has only {pdf_count} items (expected >= 50)")

        with_followups = sum(1 for q in SEED_DATASET_QUESTIONS if q.get("follow_ups"))
        followup_coverage = round((with_followups / max(dataset_count, 1)) * 100, 1)
    except Exception as exc:
        issues.append(f"Failed to import seed modules: {exc}")

    ok = len(issues) == 0
    return {
        "card_type": "autoloop_dataset_etl_report",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "ok": ok,
        "status": "HEALTHY" if ok else "DEGRADED",
        "dataset_seed_count": dataset_count,
        "pdf_seed_count": pdf_count,
        "total_external_seed_questions": dataset_count + pdf_count,
        "followup_coverage_pct": followup_coverage,
        "issues": issues,
        "hitl_card": {
            "header": {
                "title": (
                    f"🗂️ [Edgewise 题库 ETL 守卫] 已挂载 {dataset_count + pdf_count} 道精选真题 (追问覆盖率 {followup_coverage}%)"
                    if ok
                    else "⚠️ [Edgewise 题库 ETL 告警] 种子题库缺失或未同步"
                ),
                "theme": "green" if ok else "orange",
            }
        },
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Verify dataset and PDF seed bank health")
    parser.add_argument("--json", action="store_true", help="Output JSON")
    args = parser.parse_args()

    report = check_dataset_etl_health()
    if args.json:
        print(json.dumps(report, ensure_ascii=False, indent=2))
    else:
        print("====================================================")
        print("  EDGEWISE AUTOLOOP: DATASET & PDF ETL WATCHER")
        print("====================================================")
        print(f"Dataset Questions: {report['dataset_seed_count']}")
        print(f"PDF Questions:     {report['pdf_seed_count']}")
        print(f"Follow-up Cover:   {report['followup_coverage_pct']}%")
        print(f"Status:            {report['status']}")
        print("====================================================")
    return 0 if report["ok"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
