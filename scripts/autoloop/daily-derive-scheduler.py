#!/usr/bin/env python3
"""Autoloop Pipeline #5: Daily Research Derivation & Churn Survey Dispatcher."""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts"))

from run_daily_derive import main  # noqa: E402

if __name__ == "__main__":
    raise SystemExit(main())
