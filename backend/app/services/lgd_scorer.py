"""Rule-based LGD (leaderless group discussion) scoring — no external API."""

from __future__ import annotations

import re
from typing import Any

LGD_RULE_VERSION = "lgd_v1"

BUILD_ON_PATTERNS = [
    re.compile(r"同意.{0,8}说"),
    re.compile(r"补充.{0,6}观点"),
    re.compile(r"接.{0,4}刚才"),
    re.compile(r"在.{0,8}基础上"),
    re.compile(r"刚才.{0,6}提到"),
    re.compile(r"我补充"),
]

PROGRESS_TIME = re.compile(r"时间|分钟|还剩|倒计时|进度|抓紧|剩余")
PROGRESS_DIVISION = re.compile(r"分工|你来|我来|谁负责|分配|认领")
PROGRESS_SUMMARY = re.compile(r"小结|归纳|共识|总结一下|阶段|框架")

REPORT_COVERAGE = [
    re.compile(r"结论|方案|决定"),
    re.compile(r"理由|原因|依据"),
    re.compile(r"分歧|争议|不同意见|未达成"),
]

INTERRUPT_MARKERS = re.compile(r"等一下|打断|先听我说|插一句|容我")


def _user_messages(transcript: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return [m for m in transcript if m.get("role") == "user" or m.get("isUser")]


def build_lgd_timeline(transcript: list[dict[str, Any]]) -> list[dict[str, Any]]:
    timeline: list[dict[str, Any]] = []
    for idx, msg in enumerate(transcript):
        text = _text(msg)
        if not text:
            continue
        role = msg.get("role") or ("user" if msg.get("isUser") else "agent" if not msg.get("isSystem") else "system")
        if role == "system":
            continue
        speaker = msg.get("speaker") or msg.get("senderName") or ("你" if role == "user" else "成员")
        timeline.append(
            {
                "index": idx,
                "speaker": speaker,
                "role": role,
                "phase": msg.get("phase"),
                "text": text,
                "preview": text[:120] + ("…" if len(text) > 120 else ""),
                "highlight": role == "user",
            }
        )
    return timeline


def _text(msg: dict[str, Any]) -> str:
    return str(msg.get("text") or msg.get("content") or "").strip()


def _metric(value: int | float | None, *, missing_label: str = "未发言") -> dict[str, Any]:
    if value is None:
        return {"value": None, "display": missing_label, "score": None}
    return {"value": value, "display": str(value), "score": value}


def score_lgd_discussion(
    transcript: list[dict[str, Any]],
    *,
    user_role: str | None = None,
    participant_count: int = 8,
    user_was_reporter: bool | None = None,
) -> dict[str, Any]:
    """Return lgd_metrics + dimension hints for session complete."""
    user_lines = [_text(m) for m in _user_messages(transcript)]
    user_lines = [t for t in user_lines if t]
    spoke = len(user_lines) > 0
    joined = " ".join(user_lines)

    all_lines = [_text(m) for m in transcript if _text(m) and (m.get("role") != "system")]
    total_chars = sum(len(t) for t in all_lines) or 1
    user_chars = sum(len(t) for t in user_lines)

    turns = len(user_lines)
    ideal_share = 1.0 / max(participant_count, 2)
    actual_share = user_chars / total_chars if spoke else None

    talk_share_score: int | None = None
    talk_share_comment = "全程未发言，无法评估发言占比。"
    if actual_share is not None:
        ratio = actual_share / ideal_share if ideal_share else 0
        if 0.5 <= ratio <= 1.5:
            talk_share_score = 88
            talk_share_comment = "发言占比适中，既未垄断也未长期缺席。"
        elif ratio < 0.5:
            talk_share_score = max(45, int(60 * ratio / 0.5))
            talk_share_comment = "发言偏少，建议在自由讨论中主动接话或做阶段小结。"
        else:
            talk_share_score = max(50, 90 - int((ratio - 1.5) * 30))
            talk_share_comment = "发言占比偏高，注意留出他人表达空间并邀请沉默成员。"

    built_hits = sum(1 for p in BUILD_ON_PATTERNS if p.search(joined))
    built_score: int | None = None
    built_comment = "未发言，无法评估是否承接他人观点。"
    if spoke:
        built_score = min(95, 55 + built_hits * 15)
        built_comment = (
            "有引用或补充他人观点，协作感较好。"
            if built_hits
            else "较少承接他人观点，可尝试「同意/补充/举例」式接话。"
        )

    time_mentions = len(PROGRESS_TIME.findall(joined))
    division_mentions = len(PROGRESS_DIVISION.findall(joined))
    summary_mentions = len(PROGRESS_SUMMARY.findall(joined))
    progress_signals = time_mentions + division_mentions + summary_mentions

    progress_score: int | None = None
    progress_comment = "未发言，无法评估是否推进讨论进度。"
    if spoke:
        progress_score = min(92, 50 + progress_signals * 12)
        if user_role == "timekeeper" and time_mentions == 0:
            progress_score = max(40, progress_score - 25)
            progress_comment = "你选择了计时员角色，但发言中较少提到时间安排，建议主动报时与阶段提醒。"
        elif progress_signals:
            progress_comment = "有提到时间、分工或阶段小结，有助于推动讨论收敛。"
        else:
            progress_comment = "可适时提醒剩余时间、建议分工或做 30 秒阶段归纳。"

    interruptions_received = 0
    interruptions_caused = 0
    for msg in transcript:
        t = _text(msg)
        meta = msg.get("meta") or {}
        if meta.get("interruption"):
            if msg.get("role") == "user" or msg.get("isUser"):
                interruptions_caused += 1
            else:
                interruptions_received += 1
        elif INTERRUPT_MARKERS.search(t) and msg.get("role") == "agent":
            interruptions_received += 1

    interrupt_score: int | None = None
    interrupt_comment = "未发言，无法评估打断应对。"
    if spoke:
        interrupt_score = max(55, 90 - interruptions_received * 8 + min(10, interruptions_caused * 2))
        interrupt_comment = (
            f"讨论中约 {interruptions_received} 次被抢话/打断；"
            + ("能继续表达要点。" if interruptions_received <= 2 else "建议用「先让我说完一点」争取完整表达。")
        )

    reporter_score: int | None = None
    reporter_comment = "本次你不是汇报人或未进行总结发言。"
    summary_given = False
    summary_msgs = [m for m in transcript if (m.get("phase") == "summary_report" or m.get("meta", {}).get("summary"))]
    user_summary = [
        _text(m)
        for m in summary_msgs
        if m.get("role") == "user" or m.get("isUser")
    ]
    if not user_summary and spoke:
        user_summary = user_lines[-1:] if user_role == "reporter" or user_was_reporter else []

    is_reporter = user_role == "reporter" or user_was_reporter
    if is_reporter and user_summary:
        summary_given = True
        body = " ".join(user_summary)
        coverage = sum(1 for p in REPORT_COVERAGE if p.search(body))
        reporter_score = min(94, 48 + coverage * 16 + min(12, len(body) // 80))
        reporter_comment = (
            "总结覆盖了结论、理由或分歧中的多项，结构较完整。"
            if coverage >= 2
            else "汇报建议明确：小组结论、主要理由、仍存分歧与下一步。"
        )
    elif is_reporter and not user_summary:
        reporter_comment = "你是汇报人但未完成总结发言，报告无法评估汇报质量。"
        reporter_score = None

    dimension_expression = talk_share_score if talk_share_score is not None else None
    dimension_teamwork = built_score if built_score is not None else None
    dimension_leadership = progress_score if progress_score is not None else None
    dimension_logic = reporter_score if reporter_score is not None else (built_score if built_score else None)

    scored = [s for s in (talk_share_score, built_score, progress_score, reporter_score, interrupt_score) if s is not None]
    overall = round(sum(scored) / len(scored), 1) if scored else None
    if not spoke:
        overall = None

    feedback_parts = [talk_share_comment, built_comment, progress_comment, interrupt_comment, reporter_comment]
    feedback = " ".join(p for p in feedback_parts if p)

    return {
        "rule_version": LGD_RULE_VERSION,
        "timeline": build_lgd_timeline(transcript),
        "turns": turns if spoke else None,
        "talk_share": _metric(
            round(actual_share * 100, 1) if actual_share is not None else None,
            missing_label="未发言",
        ),
        "talk_share_score": talk_share_score,
        "built_on_others": _metric(built_hits if spoke else None, missing_label="未发言"),
        "built_on_others_score": built_score,
        "progress": {
            "time_mentions": time_mentions if spoke else None,
            "division_mentions": division_mentions if spoke else None,
            "summary_mentions": summary_mentions if spoke else None,
            "score": progress_score,
            "display": "未发言" if not spoke else str(progress_signals),
        },
        "progress_score": progress_score,
        "reporter_quality": _metric(reporter_score, missing_label="未汇报" if is_reporter else "—"),
        "reporter_quality_score": reporter_score,
        "interruptions": {
            "received": interruptions_received if spoke else None,
            "caused": interruptions_caused if spoke else None,
            "score": interrupt_score,
            "display": "未发言" if not spoke else str(interruptions_received),
        },
        "interruptions_score": interrupt_score,
        "summary_given": summary_given,
        "time_mentions": time_mentions if spoke else None,
        "comments": {
            "talk_share": talk_share_comment,
            "built_on_others": built_comment,
            "progress": progress_comment,
            "interruptions": interrupt_comment,
            "reporter": reporter_comment,
        },
        "overall_score": overall,
        "dimensions_suggested": {
            "expression": dimension_expression,
            "teamwork": dimension_teamwork,
            "leadership": dimension_leadership,
            "logic": dimension_logic,
        },
        "feedback": feedback,
        "spoke": spoke,
    }
