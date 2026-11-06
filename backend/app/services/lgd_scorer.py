"""Rule-based LGD (leaderless group discussion) scoring — no external API.

Upgraded with:
  1. Role-Fit Rubric (`role_fit`) for Leader / Timekeeper / Reporter / Member
  2. Dual-Evaluator Architecture (`dual_evaluators`: Business Examiner + HR OB Examiner)
  3. Anti-Scripted / Anti-Teleprompter Authenticity Check (`anti_scripted`)
  4. Progressive Consensus Summary (`progressive_summary`)
"""

from __future__ import annotations

import re
from typing import Any

LGD_RULE_VERSION = "lgd_v2"

BUILD_ON_PATTERNS = [
    re.compile(r"同意.{0,8}说"),
    re.compile(r"补充.{0,6}观点"),
    re.compile(r"接.{0,4}刚才"),
    re.compile(r"在.{0,8}基础上"),
    re.compile(r"刚才.{0,6}提到"),
    re.compile(r"我补充"),
    re.compile(r"赞同.{0,8}同学"),
    re.compile(r"[1235678]号|小林|陈思|李理|韩抢|孙偏|王和|刘时"),
]

PROGRESS_TIME = re.compile(r"时间|分钟|还剩|倒计时|进度|抓紧|剩余|半场|限时")
PROGRESS_DIVISION = re.compile(r"分工|你来|我来|谁负责|分配|认领|推进|表决|排序")
PROGRESS_SUMMARY = re.compile(r"小结|归纳|共识|总结一下|阶段|框架|维度|三点|先定")

REPORT_COVERAGE = [
    re.compile(r"结论|方案|决定|优先级"),
    re.compile(r"理由|原因|依据|指标"),
    re.compile(r"分歧|争议|不同意见|未达成|风险|折中"),
]

INTERRUPT_MARKERS = re.compile(r"等一下|打断|先听我说|插一句|容我")
TEAMMATE_ANCHOR_RE = re.compile(r"[1235678]号|小林|陈思|李理|韩抢|孙偏|王和|刘时")
CLICHE_RE = re.compile(r"赋能|抓手|闭环|组合拳|底层逻辑|顶层设计|生态化反|全链路拉通|对齐颗粒度")
EVIDENCE_RE = re.compile(r"\d+(?:\.\d+)?(?:\s*%|\s*倍|\s*万|\s*人|\s*天|\s*周|\s*分钟|\s*项)|指标|ROI|成本|转化率")

ROLE_LABELS = {
    "leader": "隐形领导者 (Leader)",
    "timekeeper": "控时推进者 (Timekeeper)",
    "reporter": "总结汇报人 (Reporter)",
    "member": "核心建言者 (Member)",
}


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


def _evaluate_role_fit(
    role: str,
    *,
    spoke: bool,
    joined: str,
    built_hits: int,
    time_mentions: int,
    division_mentions: int,
    summary_mentions: int,
    summary_given: bool,
    reporter_score: int | None,
) -> dict[str, Any]:
    role_key = (role or "member").lower()
    if role_key not in ROLE_LABELS:
        role_key = "member"
    label = ROLE_LABELS[role_key]

    if not spoke:
        return {
            "role": role_key,
            "role_label": label,
            "score": None,
            "display": "未发言",
            "hit_signals": [],
            "missing_signals": ["全程未发言"],
            "comment": f"你选择了「{label}」，但全程未发言，无法评估角色契合度。",
        }

    hit_signals: list[str] = []
    missing_signals: list[str] = []

    if role_key == "leader":
        if summary_mentions > 0:
            hit_signals.append("破冰定框/阶段归纳")
        else:
            missing_signals.append("缺少明确的三段式定框或阶段归纳话术")
        if division_mentions > 0:
            hit_signals.append("协调分工/推进表决")
        else:
            missing_signals.append("缺少主动分配任务或推动表决")
        if built_hits > 0:
            hit_signals.append("整合队友观点")
        else:
            missing_signals.append("较少点名整合队友分歧")
        score = min(96, 52 + len(hit_signals) * 14 + min(6, summary_mentions * 3))
    elif role_key == "timekeeper":
        if time_mentions > 0:
            hit_signals.append("明确报时与剩余窗口提醒")
        else:
            missing_signals.append("未出现明确的时间/倒计时提醒")
        if summary_mentions > 0 or division_mentions > 0:
            hit_signals.append("结合时间切分讨论阶段")
        else:
            missing_signals.append("报时后未给出阶段收敛建议")
        score = min(95, 45 + (25 if time_mentions > 0 else 0) + min(22, (summary_mentions + division_mentions) * 10))
    elif role_key == "reporter":
        if summary_given and reporter_score is not None:
            hit_signals.append("完成结构化总结陈词")
            score = reporter_score
        else:
            missing_signals.append("未在总结汇报阶段完成代表性陈词")
            score = max(48, 50 + summary_mentions * 10)
        if built_hits > 0:
            hit_signals.append("汇总多方队友观点")
    else:
        if built_hits > 0:
            hit_signals.append("有效承接并深化队友观点")
        else:
            missing_signals.append("可增加对前序号位观点的点名承接")
        if EVIDENCE_RE.search(joined):
            hit_signals.append("提供量化论据或具体指标")
        else:
            missing_signals.append("建议补充量化数据或业务落地细节")
        score = min(94, 58 + len(hit_signals) * 16 + min(6, built_hits * 3))

    comment = (
        f"角色定位「{label}」契合度 {score} 分：已展现 {', '.join(hit_signals)}。"
        if hit_signals
        else f"角色定位「{label}」契合度 {score} 分：{'; '.join(missing_signals)}。"
    )
    return {
        "role": role_key,
        "role_label": label,
        "score": score,
        "display": f"{score}分",
        "hit_signals": hit_signals,
        "missing_signals": missing_signals,
        "comment": comment,
    }


def _evaluate_anti_scripted(
    *,
    spoke: bool,
    joined: str,
    turns: int,
) -> dict[str, Any]:
    if not spoke:
        return {
            "authenticity_score": None,
            "scripted_risk": "none",
            "display": "未发言",
            "teammate_anchor_hits": 0,
            "cliche_hits": 0,
            "evidence_hits": 0,
            "comment": "未发言，无法评估脱稿互动真实度。",
        }

    teammate_hits = len(TEAMMATE_ANCHOR_RE.findall(joined))
    cliche_hits = len(CLICHE_RE.findall(joined))
    evidence_hits = len(EVIDENCE_RE.findall(joined))

    score = 78
    score += min(14, teammate_hits * 5)
    score += min(8, evidence_hits * 4)
    if cliche_hits >= 2 and teammate_hits == 0:
        score -= 22
    elif teammate_hits == 0 and turns >= 2:
        score -= 10

    score = max(40, min(98, score))
    risk = "high" if score < 62 else "medium" if score < 75 else "low"
    display = "真实互动" if risk == "low" else "略显背稿" if risk == "medium" else "疑似套模板"

    if risk == "low":
        comment = f"脱稿真实度高（{score}分）：发言中 {teammate_hits} 次锚定场上队友具体观点，无生硬提词器套话。"
    elif risk == "medium":
        comment = f"脱稿真实度中等（{score}分）：有一定独立观点，但对场上号位实时交锋的呼应偏少，建议多用「接X号同学」。"
    else:
        comment = f"检测到较高背稿/提词模板风险（{score}分）：空泛套话较多且未与场上队友产生真实上下文咬合。"

    return {
        "authenticity_score": score,
        "scripted_risk": risk,
        "display": display,
        "teammate_anchor_hits": teammate_hits,
        "cliche_hits": cliche_hits,
        "evidence_hits": evidence_hits,
        "comment": comment,
    }


def build_progressive_summary(transcript: list[dict[str, Any]]) -> dict[str, Any]:
    """Summarize agreed frameworks, active clashes, and 4号 user contributions."""
    agreed: list[str] = []
    clashes: list[str] = []
    user_points: list[str] = []

    for msg in transcript:
        text = _text(msg)
        if not text or msg.get("role") == "system" or msg.get("isSystem"):
            continue
        speaker = msg.get("speaker") or msg.get("senderName") or "候选人"
        is_user = msg.get("role") == "user" or msg.get("isUser") or msg.get("senderId") == "user"

        if is_user:
            user_points.append(text[:68] + ("…" if len(text) > 68 else ""))
        if PROGRESS_SUMMARY.search(text) and len(agreed) < 3:
            agreed.append(f"{speaker}：{text[:54]}{'…' if len(text) > 54 else ''}")
        if (INTERRUPT_MARKERS.search(text) or "分歧" in text or "不同意" in text or "但" in text) and len(clashes) < 3:
            clashes.append(f"{speaker}：{text[:54]}{'…' if len(text) > 54 else ''}")

    if not agreed:
        agreed.append("待确立：建议按「痛点界定 → 优先级方案 → 量化验收指标」三段式收敛。")
    if not clashes:
        clashes.append("短期执行成本 vs. 刚性 KPI 考核边界尚未完全对齐。")

    return {
        "agreed_points": agreed,
        "active_clashes": clashes,
        "user_contributions": user_points[-3:],
    }


def score_lgd_discussion(
    transcript: list[dict[str, Any]],
    *,
    user_role: str | None = None,
    participant_count: int = 8,
    user_was_reporter: bool | None = None,
) -> dict[str, Any]:
    """Return lgd_metrics + dimension hints + dual-evaluator & anti-scripted diagnostics."""
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
    talk_share_status = "none"
    talk_share_comment = "全程未发言，无法评估发言占比。"
    if actual_share is not None:
        ratio = actual_share / ideal_share if ideal_share else 0
        if 0.5 <= ratio <= 1.5:
            talk_share_score = 88
            talk_share_status = "optimal"
            talk_share_comment = "发言占比适中，既未垄断也未长期缺席。"
        elif ratio < 0.5:
            talk_share_score = max(45, int(60 * ratio / 0.5))
            talk_share_status = "low"
            talk_share_comment = "发言偏少，建议在自由讨论中主动接话或做阶段小结。"
        else:
            talk_share_score = max(50, 90 - int((ratio - 1.5) * 30))
            talk_share_status = "high"
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
    summary_msgs = [m for m in transcript if (m.get("phase") == "summary_report" or (m.get("meta") or {}).get("summary"))]
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

    role_fit = _evaluate_role_fit(
        user_role or "member",
        spoke=spoke,
        joined=joined,
        built_hits=built_hits,
        time_mentions=time_mentions,
        division_mentions=division_mentions,
        summary_mentions=summary_mentions,
        summary_given=summary_given,
        reporter_score=reporter_score,
    )

    anti_scripted = _evaluate_anti_scripted(
        spoke=spoke,
        joined=joined,
        turns=turns,
    )

    dimension_expression = talk_share_score if talk_share_score is not None else None
    dimension_teamwork = built_score if built_score is not None else None
    dimension_leadership = progress_score if progress_score is not None else None
    dimension_logic = reporter_score if reporter_score is not None else (role_fit["score"] if role_fit["score"] else built_score)

    scored = [
        s
        for s in (
            talk_share_score,
            built_score,
            progress_score,
            reporter_score,
            interrupt_score,
            role_fit["score"],
        )
        if s is not None
    ]
    overall = round(sum(scored) / len(scored), 1) if scored else None
    if not spoke:
        overall = None

    # Dual-Evaluator Agent perspectives (Business Examiner + HR OB Examiner)
    biz_score = round(((dimension_logic or 60) * 0.55 + (progress_score or 60) * 0.45), 1) if spoke else None
    hr_score = round(((dimension_teamwork or 60) * 0.45 + (role_fit["score"] or 60) * 0.35 + (anti_scripted["authenticity_score"] or 70) * 0.20), 1) if spoke else None
    dual_evaluators = {
        "business_examiner": {
            "name": "业务终面官 · 林总监",
            "focus": "破题框架 · 量化指标 · 方案落地性",
            "score": biz_score,
            "verdict": "推荐通过" if (biz_score or 0) >= 78 else "待观察" if spoke else "未发言",
            "comment": (
                f"结构化与推进表现 {biz_score} 分：{progress_comment} {role_fit['comment']}"
                if spoke
                else "候选人未参与业务讨论，无法评估方案破题能力。"
            ),
        },
        "hr_examiner": {
            "name": "组织行为 HRBP · 苏经理",
            "focus": "协作承接 · 角色担当 · 反背稿真实度",
            "score": hr_score,
            "verdict": "推荐通过" if (hr_score or 0) >= 78 else "待观察" if spoke else "未发言",
            "comment": (
                f"团队互动与真实度 {hr_score} 分：{built_comment} {anti_scripted['comment']}"
                if spoke
                else "候选人全程沉默，建议在破冰或总结环节尽早建立存在感。"
            ),
        },
    }

    feedback_parts = [
        talk_share_comment,
        built_comment,
        progress_comment,
        role_fit["comment"],
        anti_scripted["comment"],
        interrupt_comment,
        reporter_comment,
    ]
    feedback = " ".join(p for p in feedback_parts if p)

    talk_share_dict = _metric(
        round(actual_share * 100, 1) if actual_share is not None else None,
        missing_label="未发言",
    )
    talk_share_dict["status"] = talk_share_status

    built_dict = _metric(built_hits if spoke else None, missing_label="未发言")
    built_dict["count"] = built_hits if spoke else 0

    return {
        "rule_version": LGD_RULE_VERSION,
        "timeline": build_lgd_timeline(transcript),
        "turns": turns if spoke else None,
        "talk_share": talk_share_dict,
        "talk_share_score": talk_share_score,
        "built_on_others": built_dict,
        "built_on_others_score": built_score,
        "progress": {
            "time_mentions": time_mentions if spoke else None,
            "division_mentions": division_mentions if spoke else None,
            "summary_mentions": summary_mentions if spoke else None,
            "count": progress_signals if spoke else 0,
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
        "role_fit": role_fit,
        "anti_scripted": anti_scripted,
        "dual_evaluators": dual_evaluators,
        "progressive_summary": build_progressive_summary(transcript),
        "summary_given": summary_given,
        "time_mentions": time_mentions if spoke else None,
        "comments": {
            "talk_share": talk_share_comment,
            "built_on_others": built_comment,
            "progress": progress_comment,
            "interruptions": interrupt_comment,
            "reporter": reporter_comment,
            "role_fit": role_fit["comment"],
            "anti_scripted": anti_scripted["comment"],
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
