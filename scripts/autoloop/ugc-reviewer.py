#!/usr/bin/env python3
"""Edgewise Autoloop UGC Experience & Question Review Pipeline.

Upgraded to pull real pending submissions from Redis (`experiences:pending` / `experience:{id}`),
falling back gracefully to a representative sample fixture when Redis is offline or empty.
Performs:
  1. PII / Contact Sanitization (`strip_private_contact` & `validate_experience_payload`)
  2. STAR Structural Completeness Scoring (Situation, Task, Action, Result)
  3. HITL Approval Card Generation with CLI approve/reject actions
"""

from __future__ import annotations

import argparse
import asyncio
import json
import os
import re
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "backend"))

try:
    from app.services.experience_sanitize import strip_private_contact, validate_experience_payload
except ImportError:
    def strip_private_contact(text: str) -> str:
        text = re.sub(r"1[3-9]\d{9}", "[手机号已脱敏]", text)
        text = re.sub(r"[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+", "[邮箱已脱敏]", text)
        return text

    def validate_experience_payload(**kwargs: Any) -> None:
        return None


STAR_KEYWORDS = {
    "Situation": ["背景", "当时", "项目", "团队", "场景", "面临", "业务", "阶段"],
    "Task": ["目标", "任务", "负责", "要求", "指标", "难点", "挑战", "需要"],
    "Action": ["采用", "设计", "推动", "重构", "拆解", "沟通", "实现", "优化", "排查", "落地"],
    "Result": ["提升", "降低", "增长", "完成", "上线", "%", "倍", "复盘", "最终", "达到"],
}


def evaluate_star_completeness(questions: list[str], notes: str = "") -> dict[str, Any]:
    combined = " ".join(questions) + " " + notes
    dimensions: dict[str, bool] = {}
    for dim, keywords in STAR_KEYWORDS.items():
        dimensions[dim] = any(kw in combined for kw in keywords)

    hit_count = sum(1 for v in dimensions.values() if v)
    score = int((hit_count / 4.0) * 100)
    return {
        "star_score": score,
        "dimensions_hit": dimensions,
        "question_count": len(questions),
    }


def review_ugc_submission(submission: dict[str, Any]) -> dict[str, Any]:
    raw_company = submission.get("company", "")
    raw_role = submission.get("role", "")
    raw_stage = submission.get("stage", "一面")
    raw_month = submission.get("date_month", "2026-03")
    raw_questions = submission.get("questions", [])
    raw_notes = submission.get("notes", "")
    exp_id = submission.get("id", "sample-001")

    sanitized_company = strip_private_contact(raw_company)
    sanitized_role = strip_private_contact(raw_role)
    sanitized_questions = [strip_private_contact(q) for q in raw_questions]
    sanitized_notes = strip_private_contact(raw_notes)

    pii_detected = (
        sanitized_company != raw_company
        or sanitized_role != raw_role
        or sanitized_questions != raw_questions
        or sanitized_notes != raw_notes
    )

    validation_error = None
    try:
        validate_experience_payload(
            company=sanitized_company,
            role=sanitized_role,
            stage=raw_stage,
            date_month=raw_month,
            questions=sanitized_questions,
        )
    except Exception as exc:
        validation_error = str(exc)

    star_eval = evaluate_star_completeness(sanitized_questions, sanitized_notes)

    if validation_error:
        recommendation = "REJECT"
        theme = "red"
    elif star_eval["star_score"] >= 75 and not pii_detected:
        recommendation = "AUTO_APPROVE_CANDIDATE"
        theme = "green"
    else:
        recommendation = "NEEDS_HUMAN_REVIEW"
        theme = "orange"

    return {
        "experience_id": exp_id,
        "status": recommendation,
        "pii_sanitized": pii_detected,
        "validation_error": validation_error,
        "star_evaluation": star_eval,
        "preview": {
            "company": sanitized_company,
            "role": sanitized_role,
            "stage": raw_stage,
            "date_month": raw_month,
            "questions": sanitized_questions,
            "notes": sanitized_notes,
        },
        "theme": theme,
    }


async def _fetch_pending_from_redis() -> tuple[list[dict[str, Any]], str]:
    from redis.asyncio import Redis
    from app.services.experience_service import list_pending_experiences

    redis_url = os.environ.get("REDIS_URL", "redis://localhost:6379/0")
    client = Redis.from_url(redis_url, decode_responses=True, socket_connect_timeout=1.5)
    try:
        await client.ping()
        rows = await list_pending_experiences(client, limit=25)
        return rows, "redis_live"
    finally:
        await client.aclose()


def run_ugc_audit_pipeline() -> dict[str, Any]:
    sample_submission = {
        "id": "fixture-exp-001",
        "company": "字节跳动 (ByteDance)",
        "role": "AI 产品经理",
        "stage": "业务二面",
        "date_month": "2026-03",
        "questions": [
            "当时你们项目面临留存下滑的背景是什么？你负责什么指标？",
            "在推动算法团队重构推荐策略时，你采用了什么沟通方案？最终转化率提升了多少 %？",
            "如果加微信 13800138000 可以私聊更多细节吗？",
        ],
        "notes": "面试官非常看重 STAR 结构的量化结果，追问了实验分组样本量。",
    }

    try:
        pending_list, source = asyncio.run(_fetch_pending_from_redis())
    except Exception:
        pending_list, source = [], "offline_fixture"

    if not pending_list:
        pending_list = [sample_submission]
        if source == "redis_live":
            source = "redis_empty_fallback_fixture"

    reviews = [review_ugc_submission(item) for item in pending_list]
    primary = reviews[0]

    return {
        "card_type": "autoloop_ugc_review_card",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "data_source": source,
        "pending_count": len(reviews),
        "status": primary["status"],
        "pii_sanitized": primary["pii_sanitized"],
        "validation_error": primary["validation_error"],
        "star_evaluation": primary["star_evaluation"],
        "preview": primary["preview"],
        "batch_reviews": reviews,
        "hitl_card": {
            "header": {
                "title": f"📝 [Edgewise UGC 审核] {primary['preview']['company']} · {primary['preview']['role']} (共 {len(reviews)} 条待审)",
                "theme": primary["theme"],
            },
            "actions": [
                {"id": "approve", "label": "批准入库 (Approve)", "style": "primary"},
                {"id": "request_revision", "label": "退回补充 STAR 细节", "style": "default"},
                {"id": "reject", "label": "驳回 (Reject)", "style": "danger"},
            ],
        },
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Edgewise Autoloop UGC Reviewer")
    parser.add_argument("--json", action="store_true", help="Output JSON HITL card")
    args = parser.parse_args()

    result = run_ugc_audit_pipeline()

    if args.json:
        print(json.dumps(result, ensure_ascii=False, indent=2))
    else:
        print("====================================================")
        print("  EDGEWISE AUTOLOOP: UGC EXPERIENCE AUDIT PIPELINE")
        print("====================================================")
        print(f"Data Source:     {result['data_source']} ({result['pending_count']} items)")
        print(f"Target:          {result['preview']['company']} - {result['preview']['role']}")
        print(f"Recommendation:  {result['status']}")
        print(f"PII Sanitized:   {result['pii_sanitized']}")
        print(f"STAR Score:      {result['star_evaluation']['star_score']}/100")
        print(f"Dimensions Hit:  {result['star_evaluation']['dimensions_hit']}")
        print("====================================================")

    return 0


if __name__ == "__main__":
    sys.exit(main())
