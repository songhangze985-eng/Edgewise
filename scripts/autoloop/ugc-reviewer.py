#!/usr/bin/env python3
"""
Edgewise Autoloop UGC Reviewer
Automated Content Moderation & STAR Structural Auditing Pipeline

Capabilities:
1. Contact sanitization: checks and masks phone numbers, WeChat, emails, and ID cards.
2. STAR format evaluation: checks Situation, Task, Action, and Result completeness.
3. Generates 1-click Approval HITL Cards for administrators.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from datetime import datetime, timezone

try:
    from app.services.experience_sanitize import (
        contains_private_contact,
        strip_private_contact,
    )
except ImportError:
    # Graceful fallback regex if run standalone outside pythonpath
    PHONE_RE = re.compile(r"(?<!\d)(?:\+?86[-\s]?)?1[3-9]\d{9}(?!\d)")
    EMAIL_RE = re.compile(r"[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}")
    ID_RE = re.compile(r"(?<!\d)\d{17}[\dXx](?!\d)")

    def contains_private_contact(text: str) -> bool:
        s = str(text or "")
        return bool(PHONE_RE.search(s) or EMAIL_RE.search(s) or ID_RE.search(s))

    def strip_private_contact(text: str) -> str:
        s = str(text or "")
        s = PHONE_RE.sub("[已移除号码]", s)
        s = EMAIL_RE.sub("[已移除邮箱]", s)
        return ID_RE.sub("[已移除证件]", s)


STAR_KEYWORDS = {
    "situation": ["背景", "当时", "由于", "situation", "context"],
    "task": ["任务", "负责", "目标", "task", "objective", "role"],
    "action": ["行动", "采用", "优化", "实现", "开发", "action", "implemented", "drove"],
    "result": ["结果", "产出", "提升", "增长", "交付", "result", "achieved", "impact"],
}


def evaluate_star_structure(text: str) -> dict:
    content = (text or "").lower()
    scores = {}
    found_components = []

    for comp, words in STAR_KEYWORDS.items():
        found = any(w.lower() in content for w in words)
        scores[comp] = found
        if found:
            found_components.append(comp.upper())

    total_found = sum(1 for v in scores.values() if v)
    score_pct = int((total_found / 4.0) * 100)

    return {
        "score_pct": score_pct,
        "components_detected": found_components,
        "is_complete_star": total_found >= 3,
    }


def review_submission(submission: dict) -> dict:
    raw_content = submission.get("content", "")
    has_private = contains_private_contact(raw_content)
    clean_content = strip_private_contact(raw_content) if has_private else raw_content
    star_eval = evaluate_star_structure(clean_content)

    needs_review = has_private or (not star_eval["is_complete_star"])
    verdict = "AUTO_APPROVE" if not needs_review else "REQUIRES_ADMIN_APPROVAL"

    return {
        "id": submission.get("id", "ugc-demo-01"),
        "title": submission.get("title", "未命名面经"),
        "author": submission.get("author", "匿名用户"),
        "verdict": verdict,
        "has_sensitive_data": has_private,
        "cleaned_preview": clean_content[:200] + ("..." if len(clean_content) > 200 else ""),
        "star_structure": star_eval,
    }


def build_ugc_card(review_result: dict) -> dict:
    is_auto = review_result["verdict"] == "AUTO_APPROVE"
    timestamp = datetime.now(timezone.utc).isoformat()

    return {
        "schema": "https://open.feishu.cn/card_schema/v1",
        "header": {
            "title": f"📝 Edgewise UGC 审核卡片: {review_result['title']}",
            "theme": "green" if is_auto else "orange",
        },
        "meta": {
            "job_id": "edgewise-ugc-audit-pipeline",
            "timestamp": timestamp,
            "submission_id": review_result["id"],
            "verdict": review_result["verdict"],
        },
        "analysis": {
            "author": review_result["author"],
            "sensitive_info_detected": "已检出并自动脱敏" if review_result["has_sensitive_data"] else "未检出 (安全)",
            "star_completeness": f"{review_result['star_structure']['score_pct']}% ({', '.join(review_result['star_structure']['components_detected'])})",
            "preview": review_result["cleaned_preview"],
        },
        "actions": [
            {"label": "一键批准发布 (Approve & Publish)", "action": "publish", "type": "primary"},
            {"label": "打回补充 STAR (Request Revision)", "action": "request_revision", "type": "secondary"},
            {"label": "违规驳回 (Reject)", "action": "reject", "type": "danger"},
        ],
    }


def render_terminal(card: dict):
    border = "━" * 64
    print(f"\n{border}")
    print(f" 📑  {card['header']['title']}")
    print(f"    Verdict: {card['meta']['verdict']}  |  Timestamp: {card['meta']['timestamp']}")
    print(border)
    for k, v in card["analysis"].items():
        print(f"   • {k}: {v}")
    print("\n [ Available 1-Click HITL Actions: ]")
    for act in card["actions"]:
        print(f"   • [{act['label']}] -> action: {act['action']}")
    print(f"{border}\n")


def main():
    parser = argparse.ArgumentParser(description="Edgewise Autoloop UGC Reviewer")
    parser.add_argument("--json", action="store_true", help="Output JSON format")
    parser.add_argument("--sample", action="store_true", help="Run with built-in sample")
    args = parser.parse_args()

    # Sample submission for demonstration/automated test
    sample_submission = {
        "id": "exp-20261104-001",
        "title": "腾讯微信事业群后台开发一面面经",
        "author": "张同学 (微信: wx_edgewise_test123, 手机 13800138000)",
        "content": (
            "背景（Situation）：大三期间主导高并发商城系统的重构项目。"
            "任务（Task）：负责订单超时取消与库存回滚模块的零丢失保障。"
            "行动（Action）：采用 Redis Stream 与定时死信队列进行解耦，通过 Lua 脚本原子扣减库存。"
            "结果（Result）：QPS 提升 45%，压测 10 万订单无任何超卖现象。"
        ),
    }

    result = review_submission(sample_submission)
    card = build_ugc_card(result)

    if args.json:
        print(json.dumps(card, indent=2, ensure_ascii=False))
    else:
        render_terminal(card)

    sys.exit(0)


if __name__ == "__main__":
    main()
