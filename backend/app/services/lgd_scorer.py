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

from app.services.lgd_observer import (
    DEFAULT_SEAT_NUMBERS,
    EXAMINER_PANEL_PROFILES,
    build_competency_radar,
    build_milestone_ledger,
    compute_zone_watch_seats,
    evaluate_transcript_annotations,
)

LGD_RULE_VERSION = "lgd_v2"

BUILD_ON_PATTERNS = [
    re.compile(r"同意.{0,8}说"),
    re.compile(r"补充.{0,6}观点"),
    re.compile(r"接.{0,4}刚才"),
    re.compile(r"在.{0,8}基础上"),
    re.compile(r"刚才.{0,6}提到"),
    re.compile(r"我补充"),
    re.compile(r"赞同.{0,8}同学"),
    re.compile(r"[1-8]号|小林|陈思|李理|韩抢|孙偏|王和|刘时"),
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
HARSH_ATTACK_RE = re.compile(r"完全不对|毫无意义|别说了|纯属浪费时间|根本不懂")
MECHANICAL_TIME_RE = re.compile(r"还剩\s*\d+\s*(?:分钟|秒)|注意时间|时间不多|看下时间|倒计时")
ACTIONABLE_CONV_RE = re.compile(r"收敛|表决|排序|优先级|分工|汇报人|提纲|小结|总结一下|先定|敲定|框架|维度")
CRITERIA_WORDS_RE = re.compile(r"评判标准|筛选标准|排序标准|权重|先定标准|先对齐标准|按.*标准|三个标准|维度")
OPTION_JUMP_RE = re.compile(r"我直接选|直接排|必须选[①②③④⑤⑥⑦⑧1234]|答案就是[①②③ABC]", re.IGNORECASE)
SUMMARY_HIJACK_RE = re.compile(
    r"推翻刚才|推翻重来|推翻团队|个人认为应该推翻|不按刚才|我个人坚持改成|改成我自己|否定大家的共识|抛开刚才"
)
DIGRESS_ECHO_RE = re.compile(r"纪录片|南极|元宇宙|VR虚拟工位|游戏化公会")
REDIRECT_OR_PARK_RE = re.compile(r"拉回|主线|正题|暂存|Parking\s*Lot|长期展望|备选池", re.IGNORECASE)
TEAMMATE_ANCHOR_RE = re.compile(r"[1-8]号|小林|陈思|李理|韩抢|孙偏|王和|刘时")
CLICHE_RE = re.compile(r"赋能|抓手|闭环|组合拳|底层逻辑|顶层设计|生态化反|全链路拉通|对齐颗粒度")
EVIDENCE_RE = re.compile(r"\d+(?:\.\d+)?(?:\s*%|\s*倍|\s*万|\s*人|\s*天|\s*周|\s*分钟|\s*项)|指标|ROI|成本|转化率")
STUBBORN_RE = re.compile(
    r"我坚持必须|必须按我的|只能选我|绝不退让|别的方案都不行|不用听别人|只有我的方案|没得商量|我绝不同意妥协"
)
TIME_DRAG_RE = re.compile(
    r"先别急着收敛|再多聊一会儿|不用管时间|慢慢讨论不急|先重新讨论审题|推倒重来再聊"
)

# Differentiated role-specific scoring weights & leadership leverage multipliers
# Leader holds the highest strategic leverage (`leverage = 1.08`, `+4.0` verified leadership impact bonus)
ROLE_SCORING_PROFILES: dict[str, dict[str, Any]] = {
    "leader": {
        "label": "隐形领导者 / 控场者 (Leader)",
        "leverage": 1.08,
        "leader_bonus_cap": 4.5,
        "weights": {
            "progress": 0.28,
            "role_fit": 0.28,
            "built": 0.18,
            "talk_share": 0.14,
            "interrupt": 0.12,
        },
        "rule_desc": "高杠杆核心位（权重系数 1.08x）：重点考核破冰立框、分歧整合与议程推进；控场达标享最高领导力溢价，挂名零推进则反噬扣分。",
    },
    "timekeeper": {
        "label": "控时推进者 (Timekeeper)",
        "leverage": 1.02,
        "leader_bonus_cap": 1.5,
        "weights": {
            "progress": 0.32,
            "role_fit": 0.26,
            "talk_share": 0.14,
            "built": 0.14,
            "interrupt": 0.14,
        },
        "rule_desc": "节拍控制位（权重系数 1.02x）：重点考核 2:6:2 黄金时间切分与报时后阶段收敛建议，严惩纯机械报时。",
    },
    "reporter": {
        "label": "总结汇报人 (Reporter)",
        "leverage": 1.05,
        "leader_bonus_cap": 2.5,
        "weights": {
            "reporter": 0.34,
            "role_fit": 0.24,
            "built": 0.16,
            "talk_share": 0.14,
            "progress": 0.12,
        },
        "rule_desc": "终局交付位（权重系数 1.05x）：重点考核金字塔陈词完整度与忠实汇总团队共识，严禁夹带私货推翻共识。",
    },
    "member": {
        "label": "核心建言者 / 逻辑与协调专家 (Member)",
        "leverage": 1.00,
        "leader_bonus_cap": 1.0,
        "weights": {
            "built": 0.26,
            "role_fit": 0.26,
            "talk_share": 0.20,
            "progress": 0.16,
            "interrupt": 0.12,
        },
        "rule_desc": "专业贡献位（基准系数 1.00x）：重点考核点名承接深化、量化论据支撑与二阶折中破局贡献。",
    },
}

ROLE_LABELS = {
    "leader": "隐形领导者 (Leader)",
    "timekeeper": "控时推进者 (Timekeeper)",
    "reporter": "总结汇报人 (Reporter)",
    "member": "核心建言者 (Member)",
}

CLAIMABLE_TO_SCORER_ROLE = {
    "leader": "leader",
    "framework": "leader",
    "timekeeper": "timekeeper",
    "reporter": "reporter",
    "analyst": "member",
    "logician": "member",
    "coordinator": "member",
    "mediator": "member",
    "challenger": "member",
    "member": "member",
}


def _resolve_effective_scorer_role(
    raw_role: str | None,
    transcript: list[dict[str, Any]],
    *,
    user_was_reporter: bool | None = None,
    time_mentions: int = 0,
    division_mentions: int = 0,
    summary_mentions: int = 0,
) -> str:
    norm = (raw_role or "").strip().lower()
    if norm in CLAIMABLE_TO_SCORER_ROLE:
        return CLAIMABLE_TO_SCORER_ROLE[norm]
    # Check if user claimed a role dynamically during speaking (`meta.claimed_role`)
    for msg in reversed(_user_messages(transcript)):
        claimed = str((msg.get("meta") or {}).get("claimed_role") or msg.get("claimedRole") or "").strip().lower()
        if claimed in CLAIMABLE_TO_SCORER_ROLE:
            return CLAIMABLE_TO_SCORER_ROLE[claimed]
    if user_was_reporter:
        return "reporter"
    if norm == "undetermined":
        if summary_mentions > 0 and division_mentions > 0:
            return "leader"
        if time_mentions >= 2:
            return "timekeeper"
    return "member"


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


def _extract_board_phrases(board: dict[str, Any] | None) -> list[str]:
    if not isinstance(board, dict):
        return []
    phrases: list[str] = []
    for c in board.get("criteria") or []:
        if isinstance(c, dict) and c.get("label"):
            phrases.append(str(c["label"]).strip())
    model_type = board.get("modelType") or ""
    if model_type == "scoring_matrix":
        for r in (board.get("matrix") or {}).get("rows") or []:
            if isinstance(r, dict) and r.get("label"):
                phrases.append(str(r["label"]).strip())
    elif model_type == "roi_quadrant":
        quad = board.get("quadrant") or {}
        for k in ("p0", "p1", "p2", "p3"):
            for item in quad.get(k) or []:
                if item:
                    phrases.append(str(item).strip())
    elif model_type == "swimlane_funnel":
        for lane in board.get("swimlane") or []:
            if isinstance(lane, dict) and lane.get("action"):
                phrases.append(str(lane["action"]).strip())
    else:
        for br in board.get("tree") or []:
            if isinstance(br, dict):
                if br.get("branch"):
                    phrases.append(str(br["branch"]).strip())
                for item in br.get("items") or []:
                    if item:
                        phrases.append(str(item).strip())
    for p in board.get("parkingLot") or []:
        if isinstance(p, dict) and p.get("text"):
            phrases.append(str(p["text"]).strip())
    return [x for x in phrases if x]


def _evaluate_criteria_first(
    transcript: list[dict[str, Any]],
    topic_type: str | None,
    visual_board: dict[str, Any] | None,
) -> dict[str, Any]:
    non_sys = [m for m in transcript if m.get("role") != "system" and not m.get("isSystem") and _text(m)]
    early_slice = non_sys[: max(3, len(non_sys) // 2)]
    user_early = [
        _text(m)
        for m in early_slice
        if m.get("role") == "user" or m.get("isUser") or m.get("senderId") == "user"
    ]
    board_criteria = [
        str(c.get("label") or "").strip()
        for c in ((visual_board or {}).get("criteria") or [])
        if isinstance(c, dict) and str(c.get("label") or "").strip()
    ]
    spoken_criteria = any(CRITERIA_WORDS_RE.search(t) for t in user_early)
    option_jump = False
    seen_any_crit = False
    for m in non_sys:
        t = _text(m)
        if CRITERIA_WORDS_RE.search(t):
            seen_any_crit = True
        elif (m.get("role") == "user" or m.get("isUser")) and OPTION_JUMP_RE.search(t) and not seen_any_crit:
            option_jump = True

    established = bool(spoken_criteria or (visual_board and visual_board.get("authorized") and len(board_criteria) >= 2))
    delta = 3 if spoken_criteria else (2 if established else (-3 if option_jump else 0))
    if spoken_criteria:
        comment = "遵循「先立标准，再谈选项」：在前段主动确立评判标准/维度，有效避免感性拉扯。"
    elif option_jump:
        comment = "失分预警：在未确立全组评判标准前直接跳选具体方案，易引发主观争执。"
    elif topic_type in ("ranking", "dilemma", "case_debate"):
        comment = "面对排序/取舍题，建议在自由讨论前 20% 明确提出 2–3 条量化筛选标准。"
    else:
        comment = "讨论推进平稳，可进一步前置明确评判权重。"
    return {
        "established": established,
        "option_jump_warning": option_jump,
        "score_delta": delta,
        "comment": comment,
    }


def _evaluate_team_consensus(
    transcript: list[dict[str, Any]],
    summary_msgs: list[dict[str, Any]],
    visual_board: dict[str, Any] | None,
) -> dict[str, Any]:
    non_sys = [m for m in transcript if m.get("role") != "system" and not m.get("isSystem") and _text(m)]
    has_summary = len(summary_msgs) > 0
    board_locked = bool((visual_board or {}).get("consensusLocked"))
    agreed_hits = sum(1 for m in non_sys if PROGRESS_SUMMARY.search(_text(m)))
    late_clash = False
    if len(non_sys) >= 4:
        tail_txt = " ".join(_text(m) for m in non_sys[-2:])
        if ("不同意" in tail_txt or "完全反对" in tail_txt) and not has_summary:
            late_clash = True

    if has_summary or board_locked:
        status = "converged"
        closure_score = 90 if (has_summary and board_locked) else 84
        delta = 2
        comment = "团队共识闭环（绑定加分）：全组按期收敛唯一结论并完成结构化汇报。"
    elif agreed_hits >= 1 and not late_clash:
        status = "partial"
        closure_score = 72
        delta = 0
        comment = "团队达成初步阶段共识，若补全正式总结陈词可进一步稳固团队绑定分。"
    else:
        status = "unconverged"
        closure_score = 52
        delta = -4 if len(non_sys) >= 4 else 0
        comment = "团队共识未完全闭环：尾段仍存分歧或缺少统一结论汇报，触发群面团队绑定扣分风险。"
    return {
        "status": status,
        "closure_score": closure_score,
        "team_binding_delta": delta,
        "comment": comment,
    }


def _evaluate_redlines(
    transcript: list[dict[str, Any]],
    *,
    spoke: bool,
    summary_msgs: list[dict[str, Any]],
    visual_board: dict[str, Any] | None,
) -> dict[str, Any]:
    user_msgs = _user_messages(transcript)
    redlines: list[dict[str, Any]] = []

    # Redline 1: Blunt interruption or attacking teammates
    harsh_hits = sum(
        1
        for m in user_msgs
        if HARSH_ATTACK_RE.search(_text(m))
        or (((m.get("meta") or {}).get("interruption")) and len(_text(m)) < 22)
    )
    redlines.append(
        {
            "key": "blunt_attack",
            "label": "强势打断或攻击队友",
            "triggered": harsh_hits > 0,
            "penalty": -4 if harsh_hits > 0 else 0,
            "detail": f"检测到 {harsh_hits} 次生硬打断或否定式表达" if harsh_hits > 0 else "未触发，倾听礼仪良好",
        }
    )

    # Redline 2: Total silence OR pure mechanical timekeeping without agenda push
    mech_time_hits = sum(
        1
        for m in user_msgs
        if MECHANICAL_TIME_RE.search(_text(m)) and not ACTIONABLE_CONV_RE.search(_text(m))
    )
    r2_trig = (not spoke) or mech_time_hits > 0
    redlines.append(
        {
            "key": "silent_or_mech_time",
            "label": "全程沉默或机械报时无推进",
            "triggered": r2_trig,
            "penalty": -3 if mech_time_hits > 0 else 0,
            "detail": (
                "全程沉默未发言"
                if not spoke
                else f"检测到 {mech_time_hits} 次仅机械报时却未给收敛建议"
                if mech_time_hits > 0
                else "未触发，报时均伴随阶段收敛建议"
            ),
        }
    )

    # Redline 3: Tangential digression without redirecting/parking
    digress_hits = sum(
        1
        for m in user_msgs
        if DIGRESS_ECHO_RE.search(_text(m)) and not REDIRECT_OR_PARK_RE.search(_text(m))
    )
    redlines.append(
        {
            "key": "topic_drift",
            "label": "纠结细枝末节严重跑题",
            "triggered": digress_hits > 0,
            "penalty": -3 if digress_hits > 0 else 0,
            "detail": "顺着边缘案例继续发散而未拉回主线或收入暂存区" if digress_hits > 0 else "未触发，主线边界清晰",
        }
    )

    # Redline 4: Overturning consensus / smuggling private agenda in Summary Report
    user_sum_texts = " ".join(
        _text(m) for m in summary_msgs if m.get("role") == "user" or m.get("isUser")
    )
    hijack = bool(user_sum_texts and SUMMARY_HIJACK_RE.search(user_sum_texts))
    if not hijack and user_sum_texts and isinstance(visual_board, dict) and visual_board.get("consensusLocked"):
        phrases = _extract_board_phrases(visual_board)[:4]
        if phrases and not any(p[:2] in user_sum_texts for p in phrases if len(p) >= 2) and "个人认为应该换成" in user_sum_texts:
            hijack = True
    redlines.append(
        {
            "key": "summary_hijack",
            "label": "汇报推翻共识夹带私货",
            "triggered": hijack,
            "penalty": -6 if hijack else 0,
            "detail": "总结陈词出现推翻团队既定共识或私塞个人方案倾向" if hijack else "未触发，汇报忠实呈现团队产出",
        }
    )

    # Redline 5: Time-dragging / verbose zero-substance filibuster
    drag_hits = sum(
        1
        for m in user_msgs
        if TIME_DRAG_RE.search(_text(m))
        or (
            len(_text(m)) >= 165
            and not EVIDENCE_RE.search(_text(m))
            and not TEAMMATE_ANCHOR_RE.search(_text(m))
            and not ACTIONABLE_CONV_RE.search(_text(m))
        )
    )
    redlines.append(
        {
            "key": "time_dragging",
            "label": "拖延时间冗长空转",
            "triggered": drag_hits > 0,
            "penalty": -4 * min(2, drag_hits) if drag_hits > 0 else 0,
            "detail": (
                f"检测到 {drag_hits} 次阻挠收敛或超长无实质空转拉扯，消耗公共时间窗口"
                if drag_hits > 0
                else "未触发，发言紧凑高效"
            ),
        }
    )

    # Redline 6: Stubbornness / refusal to compromise
    explicit_stubborn = sum(1 for m in user_msgs if STUBBORN_RE.search(_text(m)))
    all_user_joined = " ".join(_text(m) for m in user_msgs)
    repeated_reject = (
        len(user_msgs) >= 2
        and not any(p.search(all_user_joined) for p in BUILD_ON_PATTERNS)
        and sum(1 for m in user_msgs if re.search(r"不同意|反对|不行|绝对不", _text(m))) >= 2
        and not re.search(r"折中|兼顾|分两步|融合|互补", all_user_joined)
    )
    stubborn_trig = explicit_stubborn > 0 or repeated_reject
    redlines.append(
        {
            "key": "stubborn_rigidity",
            "label": "固执己见拒不折中",
            "triggered": stubborn_trig,
            "penalty": -6 if stubborn_trig else 0,
            "detail": (
                "出现排他性固执己见或连续否定队友拒绝折中，属群面超时崩盘首要担责项"
                if stubborn_trig
                else "未触发，具备开放折中意识"
            ),
        }
    )

    triggered_count = sum(1 for r in redlines if r["triggered"])
    penalty_total = sum(r["penalty"] for r in redlines)
    comment = (
        "零红线触发：考场礼仪、议程推进与共识维护均符合高阶标准。"
        if triggered_count == 0
        else f"触发 {triggered_count} 项考场失分红线预警（合计调整 {penalty_total} 分），请重点复盘。"
    )
    return {
        "triggered_count": triggered_count,
        "penalty_total": penalty_total,
        "items": redlines,
        "comment": comment,
    }


def _evaluate_visual_board(visual_board: dict[str, Any] | None, *, spoke: bool) -> dict[str, Any]:
    if not isinstance(visual_board, dict):
        return {
            "submitted": False,
            "score": None,
            "authorized": False,
            "concise_ratio": 1.0,
            "parking_lot_count": 0,
            "assist_count": 0,
            "scribe_warning": False,
            "comment": "本次未提交结构化可视化看板草稿。",
        }

    authorized = bool(visual_board.get("authorized"))
    alignment_count = int(visual_board.get("alignmentCount") or 0)
    assist_count = int(visual_board.get("reporterAssistCount") or 0)
    unspeaking_edits = int(visual_board.get("unspeakingEdits") or 0)
    parking_count = len(visual_board.get("parkingLot") or [])
    phrases = _extract_board_phrases(visual_board)
    concise_hits = sum(1 for p in phrases if len(p) <= 8)
    concise_ratio = round(concise_hits / len(phrases), 2) if phrases else 1.0
    scribe_warning = unspeaking_edits >= 4 and not spoke

    base = 68
    if authorized:
        base += 10
    if alignment_count > 0:
        base += min(8, alignment_count * 4)
    if parking_count > 0:
        base += 6
    if assist_count > 0:
        base += min(6, assist_count * 3)
    if concise_ratio >= 0.8:
        base += 5
    else:
        base -= 6
    if scribe_warning:
        base -= 12

    final_score = max(45, min(98, base))
    notes: list[str] = []
    if authorized:
        notes.append("先拿团队授权再共享看板（铁律1✓）")
    if concise_ratio >= 0.8:
        notes.append(f"短词精炼度 {int(concise_ratio * 100)}%（铁律2✓）")
    else:
        notes.append("部分看板词条过长，建议浓缩为2–6字短词")
    if parking_count > 0:
        notes.append(f"运用 Parking Lot 收纳 {parking_count} 项分歧/展望")
    if assist_count > 0:
        notes.append(f"总结阶段领航补位助攻 {assist_count} 次（铁律3✓）")
    if scribe_warning:
        notes.append("存在长时间埋头填表零口头同步风险")

    return {
        "submitted": True,
        "model_type": visual_board.get("modelType") or "mece_tree",
        "score": final_score,
        "authorized": authorized,
        "alignment_count": alignment_count,
        "concise_ratio": concise_ratio,
        "parking_lot_count": parking_count,
        "assist_count": assist_count,
        "scribe_warning": scribe_warning,
        "comment": f"结构化草稿核分 {final_score} 分：" + "；".join(notes) + "。",
    }


def _evaluate_followup_qa(
    transcript: list[dict[str, Any]],
    followup_qa: list[dict[str, Any]] | None,
) -> dict[str, Any]:
    followup_msgs = [
        _text(m)
        for m in _user_messages(transcript)
        if m.get("phase") == "examiner_followup" and _text(m)
    ]
    qa_answers = [
        str(item.get("answer") or "").strip()
        for item in (followup_qa or [])
        if isinstance(item, dict) and str(item.get("answer") or "").strip()
    ]
    combined = followup_msgs or qa_answers
    if not combined:
        return {
            "answered": False,
            "count": 0,
            "score": None,
            "comment": "考官追问环节已跳过或未作答。",
        }
    joined = " ".join(combined)
    has_std = bool(re.search(r"标准|P0|最小可行|MVP|优先|底线", joined))
    has_team = bool(re.search(r"团队|我们|共识|号|队友|暂存", joined))
    has_num = bool(EVIDENCE_RE.search(joined))
    score = min(96, 66 + (10 if has_std else 0) + (10 if has_team else 0) + (8 if has_num else 0))
    return {
        "answered": True,
        "count": len(combined),
        "score": score,
        "comment": f"考官压力追问应对 {score} 分：能维护团队共同标准并给出可量化的底线取舍方案。",
    }


def _evaluate_final_report_summary(
    summary_msgs: list[dict[str, Any]],
    *,
    is_reporter: bool,
    summary_given: bool,
    reporter_score: int | None,
    visual_board: dict[str, Any] | None,
) -> dict[str, Any]:
    assist_count = int((visual_board or {}).get("reporterAssistCount") or 0)
    if not summary_msgs:
        return {
            "delivered": False,
            "reporter_identity": "none",
            "user_mode": "primary_reporter" if is_reporter else "observer",
            "pyramid_coverage": {"criteria": False, "solution": False, "risk": False},
            "coverage_count": 0,
            "score": None,
            "comment": "全组未能在规定时间内完成正式总结陈词汇报，存在收尾缺口。",
        }

    combined = " ".join(_text(m) for m in summary_msgs)
    last_sum = summary_msgs[-1]
    reporter_name = (
        "你（候选人）"
        if summary_given
        else str(last_sum.get("speaker") or last_sum.get("senderName") or "AI队友代表")
    )
    has_crit = bool(re.search(r"标准|原则|维度|背景|目标|ROI", combined))
    has_sol = bool(re.search(r"第一|首先|一、|结论|方案|短期|P0|举措", combined))
    has_risk = bool(re.search(r"风险|预案|分歧|试点|复盘|备选|展望|兜底", combined))
    cov_count = int(has_crit) + int(has_sol) + int(has_risk)
    team_rep_score = (
        reporter_score
        if (summary_given and reporter_score is not None)
        else min(95, 58 + cov_count * 11 + (4 if assist_count > 0 else 0))
    )
    user_mode = (
        "primary_reporter"
        if summary_given
        else "copilot_assist"
        if assist_count > 0
        else "team_listener"
    )
    mode_note = (
        f"由你代表全组完成汇报（覆盖 {cov_count}/3 项金字塔要素）"
        if summary_given
        else f"由 {reporter_name} 代表汇报，你在场下完成 {assist_count} 次看板提词补位助攻"
        if assist_count > 0
        else f"由 {reporter_name} 代表全组完成总结陈词（覆盖 {cov_count}/3 项金字塔要素）"
    )
    return {
        "delivered": True,
        "reporter_identity": reporter_name,
        "user_mode": user_mode,
        "assist_count": assist_count,
        "pyramid_coverage": {
            "criteria": has_crit,
            "solution": has_sol,
            "risk": has_risk,
        },
        "coverage_count": cov_count,
        "score": team_rep_score,
        "comment": f"最终汇报闭环（{team_rep_score}分）：{mode_note}。",
    }


def _evaluate_listening_notes(
    listener_notes: str | None,
    visual_board: dict[str, Any] | None,
    *,
    spoke: bool,
) -> dict[str, Any]:
    raw_notes = str(listener_notes or "").strip()
    board_phrases = _extract_board_phrases(visual_board)
    seat_captures = len(set(TEAMMATE_ANCHOR_RE.findall(raw_notes)))
    structured_hits = len(re.findall(r"(?:共识|分歧|标准|结论|\d+号|[•\-123])", raw_notes))
    active = len(raw_notes) >= 10 or (isinstance(visual_board, dict) and len(board_phrases) > 0)
    if not active:
        return {
            "active": False,
            "char_count": len(raw_notes),
            "captured_teammates": 0,
            "note_score": None,
            "comment": "未记录边听边记速记草稿；建议倾听他人发言时随手摘录队友座号与关键词以备破局。",
        }
    score = min(
        95,
        62
        + min(15, len(raw_notes) // 18)
        + min(10, seat_captures * 4)
        + min(8, structured_hits * 2),
    )
    mode_prefix = "未发言倾听速记评估" if not spoke else "边听边记结构化速记"
    return {
        "active": True,
        "char_count": len(raw_notes),
        "captured_teammates": seat_captures,
        "note_score": score,
        "comment": f"{mode_prefix} {score} 分：共记录 {len(raw_notes)} 字、锚定 {seat_captures} 位队友观点，有效支撑共识收敛。",
    }


def _compute_role_weighted_overall(
    effective_role: str,
    *,
    talk_share_score: int | None,
    built_score: int | None,
    progress_score: int | None,
    reporter_score: int | None,
    interrupt_score: int | None,
    role_fit_score: int | None,
    visual_board_score: int | None,
    followup_score: int | None,
    progress_signals: int,
) -> tuple[float | None, dict[str, Any]]:
    profile = ROLE_SCORING_PROFILES.get(effective_role, ROLE_SCORING_PROFILES["member"])
    weights = dict(profile["weights"])
    dim_map: dict[str, int | float | None] = {
        "talk_share": talk_share_score,
        "built": built_score,
        "progress": progress_score,
        "reporter": reporter_score,
        "interrupt": interrupt_score,
        "role_fit": role_fit_score,
    }
    if visual_board_score is not None:
        dim_map["visual_board"] = visual_board_score
        weights["visual_board"] = 0.10
    if followup_score is not None:
        dim_map["followup"] = followup_score
        weights["followup"] = 0.10

    weighted_sum = 0.0
    total_w = 0.0
    applied_weights: dict[str, float] = {}
    for k, w in weights.items():
        val = dim_map.get(k)
        if val is not None:
            weighted_sum += float(val) * w
            total_w += w
            applied_weights[k] = w

    if total_w <= 0:
        return None, {
            "role": effective_role,
            "role_label": profile["label"],
            "leverage_multiplier": profile["leverage"],
            "leader_premium": 0.0,
            "applied_weights": {},
            "rule_desc": profile["rule_desc"],
        }

    normalized_weights = {k: round(w / total_w, 3) for k, w in applied_weights.items()}
    weighted_base = weighted_sum / total_w

    # Role leverage & Leader high-stakes bonus/liability
    leverage = float(profile["leverage"])
    role_premium = 0.0
    if effective_role == "leader":
        if (role_fit_score or 0) >= 75 and progress_signals >= 1:
            role_premium = round((leverage - 1.0) * 50.0, 1)  # +4.0 pts verified Leader ceiling advantage
        elif (role_fit_score or 0) < 60 and progress_signals == 0:
            role_premium = -4.0  # Pseudo-leader liability penalty
    elif effective_role == "reporter" and (reporter_score or 0) >= 78:
        role_premium = 2.0
    elif effective_role == "timekeeper" and (role_fit_score or 0) >= 75:
        role_premium = 1.2

    final_base = round(weighted_base + role_premium, 1)
    return final_base, {
        "role": effective_role,
        "role_label": profile["label"],
        "weighted_base": round(weighted_base, 1),
        "leverage_multiplier": leverage,
        "role_premium": role_premium,
        "applied_weights": normalized_weights,
        "rule_desc": profile["rule_desc"],
    }


def _evaluate_five_dim_rubric_matrix(
    transcript: list[dict[str, Any]],
    *,
    spoke: bool,
    joined: str,
    user_lines: list[str],
    effective_role: str,
    talk_share_status: str,
    built_hits: int,
    time_mentions: int,
    division_mentions: int,
    summary_mentions: int,
    summary_given: bool,
    reporter_score: int | None,
    interruptions_received: int,
    interruptions_caused: int,
    redline_audit: dict[str, Any],
    criteria_first: dict[str, Any],
    visual_board_eval: dict[str, Any],
    followup_eval: dict[str, Any],
    participant_roles: dict[str, str] | None = None,
) -> dict[str, Any]:
    """Authentic 5-Dimension Weighted Rubric Matrix (30% + 25% + 20% + 15% + 10% = 100%)."""
    redline_by_key = {item["key"]: item for item in (redline_audit.get("items") or [])}
    veto_reasons: list[str] = []

    if not spoke:
        veto_reasons.append("团队协作雷区：全程沉默（划水怪），触发一票否决")
        empty_dims = [
            {
                "key": "logic_analysis",
                "label": "逻辑与分析能力",
                "weight": 0.30,
                "owner_examiner": "主面试官 · 顾总监",
                "score": 0,
                "weighted_points": 0.0,
                "hit_anchors": [],
                "triggered_minefields": ["全程未发言，无逻辑拆解产出"],
            },
            {
                "key": "team_progression",
                "label": "团队协作与推进",
                "weight": 0.25,
                "owner_examiner": "副面试官A · 苏经理",
                "score": 0,
                "weighted_points": 0.0,
                "hit_anchors": [],
                "triggered_minefields": ["全程沉默（划水怪 · 一票否决雷区）"],
            },
            {
                "key": "role_contribution",
                "label": "角色定位与贡献",
                "weight": 0.20,
                "owner_examiner": "副面试官B · 周PM",
                "score": 0,
                "weighted_points": 0.0,
                "hit_anchors": [],
                "triggered_minefields": ["未履行任何角色增量贡献"],
            },
            {
                "key": "expression_persuasion",
                "label": "表达与说服力",
                "weight": 0.15,
                "owner_examiner": "副面试官A · 苏经理",
                "score": 0,
                "weighted_points": 0.0,
                "hit_anchors": [],
                "triggered_minefields": ["零口头输出"],
            },
            {
                "key": "stress_adaptability",
                "label": "抗压与应变能力",
                "weight": 0.10,
                "owner_examiner": "副面试官A · 苏经理",
                "score": 0,
                "weighted_points": 0.0,
                "hit_anchors": [],
                "triggered_minefields": ["高压博弈下放弃话语权"],
            },
        ]
        return {
            "weights_sum": 1.0,
            "weighted_total": None,
            "vetoed": True,
            "veto_reasons": veto_reasons,
            "dimensions": empty_dims,
            "score_map": {d["key"]: 0 for d in empty_dims},
        }

    # --- Dimension 1: 逻辑与分析能力 (30%) ---
    d1_anchors: list[str] = []
    d1_mines: list[str] = []
    d1 = 68
    if re.search(r"MECE|三层|三个维度|三维|拆解|第一.*第二|短期.*中期|内部.*外部", joined, re.IGNORECASE) or criteria_first.get("established"):
        d1 += 12
        d1_anchors.append("提出 MECE/结构化拆解框架或前置评判标准")
    if EVIDENCE_RE.search(joined):
        d1 += 10
        d1_anchors.append("引用量化数据或第一性原理推导支撑")
    if summary_mentions > 0 or visual_board_eval.get("submitted"):
        d1 += 6
        d1_anchors.append("将零散观点收拢为结构化结论")
    cliche_cnt = len(CLICHE_RE.findall(joined))
    if cliche_cnt >= 2 and not EVIDENCE_RE.search(joined):
        d1 -= 16
        d1_mines.append("只喊黑话口号缺乏落地路径")
    if redline_by_key.get("topic_drift", {}).get("triggered") or criteria_first.get("option_jump_warning"):
        d1 -= 12
        d1_mines.append("说话偏离重点或未立标准跳跃结论")
    d1 = max(38, min(97, d1))

    # --- Dimension 2: 团队协作与推进 (25%) ---
    d2_anchors: list[str] = []
    d2_mines: list[str] = []
    d2 = 66
    if built_hits > 0:
        d2 += min(14, built_hits * 7)
        d2_anchors.append("主动倾听并点名肯定/补充队友观点")
    if re.search(r"折中|桥接|兼顾|分两步|融合|暂存区|Parking\s*Lot", joined, re.IGNORECASE):
        d2 += 12
        d2_anchors.append("僵持时提出折中方案推动共识")
    if talk_share_status == "high" and interruptions_caused >= 2:
        d2 -= 20
        d2_mines.append("强势霸麦（抢话王）压制队友空间")
        veto_reasons.append("团队协作雷区：强势霸麦且多次打断队友")
    if redline_by_key.get("blunt_attack", {}).get("triggered"):
        d2 -= 22
        d2_mines.append("生硬打断或攻击否定队友观点")
        veto_reasons.append("团队协作雷区：生硬打断或言语攻击队友")
    if redline_by_key.get("stubborn_rigidity", {}).get("triggered"):
        d2 -= 22
        d2_mines.append("固执己见拒不妥协")
        veto_reasons.append("团队协作雷区：固执己见拒不折中，阻碍全组共识")
    d2 = max(35, min(97, d2))

    # --- Dimension 3: 角色定位与贡献 (20%) ---
    d3_anchors: list[str] = []
    d3_mines: list[str] = []
    d3 = 66
    claimed_r = ((participant_roles or {}).get("user") or effective_role or "member").lower()
    if effective_role == "leader" and (summary_mentions > 0 or division_mentions > 0):
        d3 += 20
        d3_anchors.append("承担隐形 Leader 破冰定框与分工推进（享核心位溢价）")
    elif (claimed_r == "timekeeper" or effective_role == "timekeeper") and time_mentions > 0 and not redline_by_key.get("silent_or_mech_time", {}).get("triggered"):
        d3 += 18
        d3_anchors.append("主动承担 Timer 控时且结合节点有效推进")
    elif summary_given and (reporter_score or 0) >= 75:
        d3 += 18
        d3_anchors.append("承担 Reporter 总结陈词且完整呈现团队共识")
    elif built_hits > 0 or EVIDENCE_RE.search(joined):
        d3 += 13
        d3_anchors.append("作为核心建言/点子/逻辑位输出关键增量")

    if (claimed_r == "timekeeper" or effective_role == "timekeeper") and time_mentions == 0:
        d3 -= 20
        d3_mines.append("抢了 Timer 角色却不看表报时（履职失职）")
    elif redline_by_key.get("silent_or_mech_time", {}).get("triggered"):
        d3 -= 12
        d3_mines.append("仅机械报时却无阶段切分推进")
    if redline_by_key.get("summary_hijack", {}).get("triggered"):
        d3 -= 24
        d3_mines.append("总结时推翻共识、夹带个人私货")
        veto_reasons.append("角色履职雷区：总结汇报推翻团队共识夹带私货")
    d3 = max(36, min(98, d3))

    # --- Dimension 4: 表达与说服力 (15%) ---
    d4_anchors: list[str] = []
    d4_mines: list[str] = []
    d4 = 72
    if re.search(r"结论先行|我的核心结论|首先.*其次|第一.*第二|一、|1\.", joined):
        d4 += 13
        d4_anchors.append("采用‘结论先行（总-分）’句式清晰有说服力")
    avg_len = sum(len(x) for x in user_lines) / max(1, len(user_lines))
    if 28 <= avg_len <= 135:
        d4 += 7
        d4_anchors.append("表达简洁干脆、信息密度高")
    elif avg_len < 16:
        d4 -= 14
        d4_mines.append("表达过于简略单薄、存在感与音量势能弱")
    if redline_by_key.get("time_dragging", {}).get("triggered"):
        d4 -= 16
        d4_mines.append("啰嗦重复或冗长拖延公共时间")
    if re.search(r"你懂不懂|别乱扣帽子|凭什么否定|有完没完|莫名其妙", joined):
        d4 -= 18
        d4_mines.append("情绪激动或防御反呛过强")
    d4 = max(38, min(97, d4))

    # --- Dimension 5: 抗压与应变能力 (10%) ---
    d5_anchors: list[str] = []
    d5_mines: list[str] = []
    d5 = 72
    if re.search(r"回应[1-8]号|回应韩抢|吸收|修正|补充边界|最小可行|MVP|底线", joined) or followup_eval.get("answered"):
        d5 += 14
        d5_anchors.append("面对质询反驳情绪稳定，快速吸收合理部分修正方案")
    if time_mentions > 0 and division_mentions + summary_mentions > 0:
        d5 += 8
        d5_anchors.append("在倒计时高压窗口推动极限收敛")

    # Detect "shutting down / slacking" after being challenged by Interrupter
    non_sys = [m for m in transcript if m.get("role") != "system" and not m.get("isSystem")]
    last_interrupter_idx = -1
    last_user_idx = -1
    for i, m in enumerate(non_sys):
        if m.get("senderId") == "interrupter":
            last_interrupter_idx = i
        if m.get("isUser") or m.get("role") == "user" or m.get("senderId") == "user":
            last_user_idx = i
    if last_interrupter_idx > last_user_idx and len(non_sys) - last_interrupter_idx >= 3 and len(user_lines) <= 1:
        d5 -= 16
        d5_mines.append("被高压质疑否定后直接沉默退缩，缺乏抗压韧性")
    if re.search(r"完全不对|别说了|你懂不懂|凭什么否定", joined):
        d5 -= 20
        d5_mines.append("被否定后情绪失控与队友发生正面言语冲突")
        veto_reasons.append("抗压雷区：与队友发生正面情绪冲突")
    d5 = max(38, min(97, d5))

    dims = [
        {
            "key": "logic_analysis",
            "label": "逻辑与分析能力",
            "weight": 0.30,
            "owner_examiner": "主面试官 · 顾总监",
            "score": d1,
            "weighted_points": round(d1 * 0.30, 2),
            "hit_anchors": d1_anchors,
            "triggered_minefields": d1_mines,
        },
        {
            "key": "team_progression",
            "label": "团队协作与推进",
            "weight": 0.25,
            "owner_examiner": "副面试官A · 苏经理",
            "score": d2,
            "weighted_points": round(d2 * 0.25, 2),
            "hit_anchors": d2_anchors,
            "triggered_minefields": d2_mines,
        },
        {
            "key": "role_contribution",
            "label": "角色定位与贡献",
            "weight": 0.20,
            "owner_examiner": "副面试官B · 周PM",
            "score": d3,
            "weighted_points": round(d3 * 0.20, 2),
            "hit_anchors": d3_anchors,
            "triggered_minefields": d3_mines,
        },
        {
            "key": "expression_persuasion",
            "label": "表达与说服力",
            "weight": 0.15,
            "owner_examiner": "副面试官A · 苏经理",
            "score": d4,
            "weighted_points": round(d4 * 0.15, 2),
            "hit_anchors": d4_anchors,
            "triggered_minefields": d4_mines,
        },
        {
            "key": "stress_adaptability",
            "label": "抗压与应变能力",
            "weight": 0.10,
            "owner_examiner": "副面试官A · 苏经理",
            "score": d5,
            "weighted_points": round(d5 * 0.10, 2),
            "hit_anchors": d5_anchors,
            "triggered_minefields": d5_mines,
        },
    ]
    weighted_total = round(sum(item["weighted_points"] for item in dims), 1)
    return {
        "weights_sum": round(sum(item["weight"] for item in dims), 2),
        "weighted_total": weighted_total,
        "vetoed": len(veto_reasons) > 0,
        "veto_reasons": veto_reasons,
        "dimensions": dims,
        "score_map": {d["key"]: d["score"] for d in dims},
    }


AI_BENCHMARK_PROFILES: dict[str, dict[str, Any]] = {
    "logician": {
        "name": "李理",
        "role_tag": "逻辑控",
        "lead": 84.0,
        "obs_a": 78.0,
        "scribe_b": 81.0,
        "vetoed": False,
        "veto_reason": None,
        "calib_note": "量化ROI与因果反驳扎实，逻辑维度全场靠前",
    },
    "ice_breaker": {
        "name": "小林",
        "role_tag": "破冰者",
        "lead": 80.0,
        "obs_a": 80.0,
        "scribe_b": 82.0,
        "vetoed": False,
        "veto_reason": None,
        "calib_note": "开场破冰立框及时，奠定早期讨论结构",
    },
    "mediator": {
        "name": "王和",
        "role_tag": "协调者",
        "lead": 74.0,
        "obs_a": 82.0,
        "scribe_b": 77.0,
        "vetoed": False,
        "veto_reason": None,
        "calib_note": "倾听态度极佳，多次缓和交锋但独立锐度稍弱",
    },
    "timekeeper": {
        "name": "刘时",
        "role_tag": "计时员",
        "lead": 73.0,
        "obs_a": 76.0,
        "scribe_b": 78.5,
        "vetoed": False,
        "veto_reason": None,
        "calib_note": "时间提醒尽责，但核心业务破题增量有限",
    },
    "idea_king": {
        "name": "陈思",
        "role_tag": "点子王",
        "lead": 74.5,
        "obs_a": 74.0,
        "scribe_b": 74.0,
        "vetoed": False,
        "veto_reason": None,
        "calib_note": "创意抓手丰富，部分点子落地路径需收敛",
    },
    "digresser": {
        "name": "孙偏",
        "role_tag": "发散者",
        "lead": 58.0,
        "obs_a": 65.0,
        "scribe_b": 60.0,
        "vetoed": False,
        "veto_reason": None,
        "calib_note": "跨界发散偏离核心议题，消耗团队讨论时间",
    },
    "interrupter": {
        "name": "韩抢",
        "role_tag": "质询者",
        "lead": 76.0,
        "obs_a": 52.0,
        "scribe_b": 66.0,
        "vetoed": True,
        "veto_reason": "副面试官A一票否决：强势霸麦抢话、多次生硬打断队友",
        "calib_note": "虽指出风险盲区，但触犯‘抢话王’协作雷区被一票否决出局",
    },
}


def _run_eight_seat_calibration(
    *,
    spoke: bool,
    user_overall: float | None,
    five_dim: dict[str, Any],
    milestone_ledger: list[dict[str, Any]],
    seat_map: dict[str, int] | None = None,
    advancement_quota: int = 3,
) -> tuple[dict[str, Any], dict[str, Any]]:
    """Simulate 3 Examiners' independent scoring + 5-min Calibration Meeting (`8进2` / `8进3`)."""
    smap = {**DEFAULT_SEAT_NUMBERS, **(seat_map or {})}
    user_seat = smap.get("user", 4)
    watched_seats = compute_zone_watch_seats(user_seat)
    quota = max(1, min(4, int(advancement_quota or 3)))
    ratio_label = f"8进{quota}"

    sm = five_dim["score_map"]
    user_vetoed = bool(five_dim["vetoed"])
    user_milestones = [m for m in milestone_ledger if m.get("participant_id") == "user"]
    milestone_delta = sum(int(m.get("impact") or 0) for m in user_milestones)

    if not spoke or user_overall is None:
        u_lead = 0.0
        u_obs_a = 0.0
        u_scribe_b = 0.0
        u_calibrated = 0.0
    else:
        u_lead = round(sm["logic_analysis"] * 0.55 + sm["role_contribution"] * 0.25 + sm["stress_adaptability"] * 0.20, 1)
        u_obs_a = round(
            sm["team_progression"] * 0.45 + sm["expression_persuasion"] * 0.35 + sm["stress_adaptability"] * 0.20
            - (12.0 if user_vetoed else 0.0),
            1,
        )
        u_scribe_b = round(
            min(98.0, max(35.0, sm["role_contribution"] * 0.50 + sm["team_progression"] * 0.30 + sm["logic_analysis"] * 0.20 + min(5, milestone_delta))),
            1,
        )
        u_calibrated = round(user_overall if not user_vetoed else min(59.5, user_overall - 14.0), 1)

    candidates: list[dict[str, Any]] = [
        {
            "participant_id": "user",
            "seat": user_seat,
            "name": f"{user_seat}号 · 你（候选人）",
            "is_user": True,
            "in_zone_a": user_seat in watched_seats,
            "lead_score": u_lead,
            "observer_a_score": u_obs_a,
            "scribe_b_score": u_scribe_b,
            "calibrated_score": u_calibrated,
            "vetoed": user_vetoed,
            "veto_reason": five_dim["veto_reasons"][0] if five_dim["veto_reasons"] else None,
            "calib_note": (
                five_dim["veto_reasons"][0]
                if user_vetoed
                else f"五维加权 {five_dim['weighted_total']} 分，关键里程碑 {len(user_milestones)} 项"
            ),
        }
    ]

    for aid, prof in AI_BENCHMARK_PROFILES.items():
        aseat = smap.get(aid, 1)
        raw_cal = round(prof["lead"] * 0.38 + prof["obs_a"] * 0.34 + prof["scribe_b"] * 0.28, 1)
        cal_val = min(58.5, raw_cal - 10.0) if prof["vetoed"] else raw_cal
        candidates.append(
            {
                "participant_id": aid,
                "seat": aseat,
                "name": f"{aseat}号 · {prof['name']}（{prof['role_tag']}）",
                "is_user": False,
                "in_zone_a": aseat in watched_seats,
                "lead_score": prof["lead"],
                "observer_a_score": prof["obs_a"],
                "scribe_b_score": prof["scribe_b"],
                "calibrated_score": round(cal_val, 1),
                "vetoed": prof["vetoed"],
                "veto_reason": prof["veto_reason"],
                "calib_note": prof["calib_note"],
            }
        )

    # Sort non-vetoed ahead of vetoed, then by calibrated_score descending
    candidates.sort(key=lambda c: (0 if not c["vetoed"] else 1, -c["calibrated_score"], c["seat"]))
    for idx, c in enumerate(candidates):
        c["rank"] = idx + 1
        c["promoted"] = bool((idx < quota) and (not c["vetoed"]) and (c["calibrated_score"] >= 60.0))

    user_row = next(c for c in candidates if c["is_user"])
    promoted_names = [c["name"] for c in candidates if c["promoted"]]
    interrupter_seat = smap.get("interrupter", 5)

    dialogue = [
        {
            "speaker": "主面试官 · 顾总监（主持/业务骨干）",
            "role": "lead",
            "text": (
                f"时间到，进入5分钟闭门 Calibration 校准碰头会（本场晋级配额：{ratio_label}）。"
                f"从逻辑架构与破局质量（30%）看，李理与小林的框架较稳；"
                f"{user_seat}号候选人我独立给到 {u_lead} 分，请两位副考官核对盯人红线与里程碑账本。"
            ),
        },
        {
            "speaker": f"副面试官A · 苏经理（盯人分区：{watched_seats[0]}~{watched_seats[-1]}号）",
            "role": "observer_a",
            "text": (
                f"我重点盯梢 {watched_seats} 号半区：{interrupter_seat}号韩抢多次强势霸麦打断队友，我动用雷区一票否决将其移出晋级池；"
                + (
                    f"至于 {user_seat}号候选人，因「{user_row['veto_reason']}」同样触发红线否决，不予晋级。"
                    if user_vetoed
                    else f"{user_seat}号候选人在被质询时的情绪稳定性与倾听承接表现我给 {u_obs_a} 分，无红线违规。"
                )
            ),
        },
        {
            "speaker": "副面试官B · 周PM（时间节点与贡献记录员）",
            "role": "scribe_b",
            "text": (
                f"翻看时间戳贡献账本，全场共记录 {len(milestone_ledger)} 个关键推进节点，其中 {user_seat}号命中 {len(user_milestones)} 项里程碑"
                f"（角色贡献独立分 {u_scribe_b} 分）。校准五维加权后，{user_seat}号最终得分 {u_calibrated} 分，位列全场第 {user_row['rank']}/8 名。"
            ),
        },
        {
            "speaker": "主面试官 · 顾总监（终审拍板）",
            "role": "lead",
            "text": (
                f"好，三方校准达成一致！本场 {ratio_label} 正式晋级名单锁定为：{'、'.join(promoted_names) if promoted_names else '无'}。"
                + (
                    f"恭喜 {user_seat}号候选人成功突围晋级下一轮单人面试！"
                    if user_row["promoted"]
                    else f"很遗憾 {user_seat}号候选人（第 {user_row['rank']} 名）未能进入前 {quota} 晋级线，止步群面。"
                )
            ),
        },
    ]

    examiner_panel = {
        "lead_examiner": {
            **EXAMINER_PANEL_PROFILES["lead"],
            "score": u_lead if spoke else None,
            "verdict": "推荐晋级" if u_lead >= 78 and not user_vetoed else "待定校准" if spoke else "未发言",
            "comment": f"逻辑与架构独立评分 {u_lead} 分（权重主审 30%）：重点审视 MECE 框架、数据支撑与主线收拢能力。" if spoke else "全程未发言。",
        },
        "zone_observer_a": {
            **EXAMINER_PANEL_PROFILES["observer_a"],
            "watched_seats": watched_seats,
            "score": u_obs_a if spoke else None,
            "veto_triggered": user_vetoed,
            "verdict": "一票否决" if user_vetoed else ("推荐晋级" if u_obs_a >= 78 else "无红线待观察"),
            "comment": (
                f"分区盯梢（{watched_seats[0]}~{watched_seats[-1]}号席）独立评分 {u_obs_a} 分："
                + (user_row["veto_reason"] if user_vetoed else "倾听态度、结论先行表达与高压情绪稳定性核验通过。")
            ),
        },
        "milestone_scribe_b": {
            **EXAMINER_PANEL_PROFILES["scribe_b"],
            "milestone_hits": len(user_milestones),
            "score": u_scribe_b if spoke else None,
            "verdict": "高贡献加分" if len(user_milestones) >= 2 else ("履职合格" if spoke else "零记录"),
            "comment": f"时间戳贡献账本独立评分 {u_scribe_b} 分：全场捕获你 {len(user_milestones)} 次破冰/立标/纠偏/控时关键节点。",
        },
    }

    calibration = {
        "advancement_quota": quota,
        "ratio_label": ratio_label,
        "watched_seats": watched_seats,
        "user_seat": user_seat,
        "user_rank": user_row["rank"],
        "user_promoted": user_row["promoted"],
        "user_vetoed": user_vetoed,
        "veto_reason": user_row["veto_reason"],
        "promoted_roster": promoted_names,
        "summary_verdict": (
            f"🏆 Calibration 校准通过（第 {user_row['rank']}/8 名 · {ratio_label} 成功晋级）"
            if user_row["promoted"]
            else f"⛔ Calibration 未通过（第 {user_row['rank']}/8 名 · {'触发一票否决雷区' if user_vetoed else f'未入围 {ratio_label} 晋级线'}）"
        ),
        "dialogue": dialogue,
        "leaderboard": candidates,
    }
    return examiner_panel, calibration


def score_lgd_discussion(
    transcript: list[dict[str, Any]],
    *,
    user_role: str | None = None,
    participant_count: int = 8,
    user_was_reporter: bool | None = None,
    topic_type: str | None = None,
    visual_board: dict[str, Any] | None = None,
    followup_qa: list[dict[str, Any]] | None = None,
    listener_notes: str | None = None,
    advancement_quota: int = 3,
    seat_map: dict[str, int] | None = None,
    participant_roles: dict[str, str] | None = None,
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

    effective_role = _resolve_effective_scorer_role(
        user_role,
        transcript,
        user_was_reporter=user_was_reporter,
        time_mentions=time_mentions,
        division_mentions=division_mentions,
        summary_mentions=summary_mentions,
    )

    progress_score: int | None = None
    progress_comment = "未发言，无法评估是否推进讨论进度。"
    if spoke:
        progress_score = min(92, 50 + progress_signals * 12)
        if effective_role == "timekeeper" and time_mentions == 0:
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
        user_summary = user_lines[-1:] if effective_role == "reporter" or user_was_reporter else []

    is_reporter = effective_role == "reporter" or user_was_reporter
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
        effective_role,
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

    criteria_first = _evaluate_criteria_first(transcript, topic_type, visual_board)
    team_consensus = _evaluate_team_consensus(transcript, summary_msgs, visual_board)
    redline_audit = _evaluate_redlines(
        transcript,
        spoke=spoke,
        summary_msgs=summary_msgs,
        visual_board=visual_board,
    )
    visual_board_eval = _evaluate_visual_board(visual_board, spoke=spoke)
    followup_eval = _evaluate_followup_qa(transcript, followup_qa)
    final_report_summary = _evaluate_final_report_summary(
        summary_msgs,
        is_reporter=is_reporter,
        summary_given=summary_given,
        reporter_score=reporter_score,
        visual_board=visual_board,
    )
    listening_notes_eval = _evaluate_listening_notes(
        listener_notes,
        visual_board,
        spoke=spoke,
    )

    dimension_expression = talk_share_score if talk_share_score is not None else None
    dimension_teamwork = built_score if built_score is not None else None
    dimension_leadership = progress_score if progress_score is not None else None
    dimension_logic = reporter_score if reporter_score is not None else (role_fit["score"] if role_fit["score"] else built_score)

    base_overall, role_rubric_breakdown = _compute_role_weighted_overall(
        effective_role,
        talk_share_score=talk_share_score,
        built_score=built_score,
        progress_score=progress_score,
        reporter_score=reporter_score,
        interrupt_score=interrupt_score,
        role_fit_score=role_fit["score"],
        visual_board_score=visual_board_eval["score"],
        followup_score=followup_eval["score"],
        progress_signals=progress_signals,
    )
    five_dim_rubric = _evaluate_five_dim_rubric_matrix(
        transcript,
        spoke=spoke,
        joined=joined,
        user_lines=user_lines,
        effective_role=effective_role,
        talk_share_status=talk_share_status,
        built_hits=built_hits,
        time_mentions=time_mentions,
        division_mentions=division_mentions,
        summary_mentions=summary_mentions,
        summary_given=summary_given,
        reporter_score=reporter_score,
        interruptions_received=interruptions_received,
        interruptions_caused=interruptions_caused,
        redline_audit=redline_audit,
        criteria_first=criteria_first,
        visual_board_eval=visual_board_eval,
        followup_eval=followup_eval,
        participant_roles=participant_roles,
    )

    if not spoke or base_overall is None:
        overall = None
    else:
        adj = (
            team_consensus["team_binding_delta"]
            + criteria_first["score_delta"]
            + redline_audit["penalty_total"]
        )
        legacy_overall = base_overall + adj
        matrix_overall = (five_dim_rubric["weighted_total"] or legacy_overall) + role_rubric_breakdown.get("role_premium", 0.0)
        blended_overall = legacy_overall * 0.40 + matrix_overall * 0.60
        overall = round(max(35.0, min(99.0, blended_overall)), 1)

    milestone_ledger = build_milestone_ledger(
        transcript,
        seat_map=seat_map,
        participant_roles=participant_roles,
    )
    examiner_panel, calibration = _run_eight_seat_calibration(
        spoke=spoke,
        user_overall=overall,
        five_dim=five_dim_rubric,
        milestone_ledger=milestone_ledger,
        seat_map=seat_map,
        advancement_quota=advancement_quota,
    )

    # Side-channel invisible examiner annotations & 5-axis competency radar
    observer_annotations = evaluate_transcript_annotations(
        transcript,
        user_role=effective_role,
    )
    competency_radar = build_competency_radar(
        spoke=spoke,
        logic_score=dimension_logic,
        progress_score=progress_score,
        built_score=built_score,
        interrupt_score=interrupt_score,
        authenticity_score=anti_scripted["authenticity_score"],
        annotations=observer_annotations,
        five_dim_scores=five_dim_rubric["score_map"] if spoke else None,
    )
    biz_highlights = [
        f"[{a['ts_label']} {a['tag']} +{a['delta']}] 「{a['quote']}」"
        for a in observer_annotations
        if a.get("examiner") == "business" and a.get("polarity") == "positive"
    ]
    biz_warnings = [
        f"[{a['ts_label']} {a['tag']} {a['delta']}] 「{a['quote']}」"
        for a in observer_annotations
        if a.get("examiner") == "business" and a.get("polarity") == "warning"
    ]
    hr_highlights = [
        f"[{a['ts_label']} {a['tag']} +{a['delta']}] 「{a['quote']}」"
        for a in observer_annotations
        if a.get("examiner") == "hr" and a.get("polarity") == "positive"
    ]
    hr_warnings = [
        f"[{a['ts_label']} {a['tag']} {a['delta']}] 「{a['quote']}」"
        for a in observer_annotations
        if a.get("examiner") == "hr" and a.get("polarity") == "warning"
    ]

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
            "highlights": biz_highlights[:3],
            "warnings": biz_warnings[:2],
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
            "highlights": hr_highlights[:3],
            "warnings": hr_warnings[:2],
        },
    }

    feedback_parts = [
        team_consensus["comment"] if spoke else "",
        criteria_first["comment"] if spoke else "",
        talk_share_comment,
        built_comment,
        progress_comment,
        role_fit["comment"],
        anti_scripted["comment"],
        visual_board_eval["comment"] if visual_board_eval["submitted"] else "",
        followup_eval["comment"] if followup_eval["answered"] else "",
        final_report_summary["comment"] if final_report_summary["delivered"] else "",
        listening_notes_eval["comment"] if listening_notes_eval["active"] else "",
        redline_audit["comment"] if redline_audit["triggered_count"] > 0 else "",
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

    from app.services.single_interview_taxonomy import build_lgd_report_json

    result_payload = {
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
        "role_rubric_breakdown": role_rubric_breakdown,
        "anti_scripted": anti_scripted,
        "criteria_first": criteria_first,
        "team_consensus": team_consensus,
        "redline_audit": redline_audit,
        "visual_board_eval": visual_board_eval,
        "followup_eval": followup_eval,
        "final_report_summary": final_report_summary,
        "listening_notes_eval": listening_notes_eval,
        "five_dim_rubric": five_dim_rubric,
        "examiner_panel": examiner_panel,
        "milestone_ledger": milestone_ledger,
        "calibration": calibration,
        "dual_evaluators": dual_evaluators,
        "observer_annotations": observer_annotations,
        "competency_radar": competency_radar,
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
    result_payload["lgd_report"] = build_lgd_report_json(
        transcript,
        result_payload,
        user_role=effective_role,
    )
    return result_payload
