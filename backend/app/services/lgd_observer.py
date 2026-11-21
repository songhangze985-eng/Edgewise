"""Side-channel Three-Examiner Panel Observer & Milestone Ledger for LGD Group Discussions.

Implements authentic Assessment Center 3-Examiner Role Division:
1. Lead Examiner (`lead` · 主面试官 · 顾总监 [主持人/业务骨干]):
   - Announces rules, governs overall time, records discussion arc & breakthrough points,
     focusing on Logic Architecture & Argument Quality (30%).
2. Associate Examiner A (`observer_a` · 副面试官 A · 苏经理 [观察员/HRBP]):
   - Uses "Zone Watch" (`分区盯人`: focuses on the 4-seat half-sector containing the candidate),
     tracks emotional stability, listening attitude, conclusion-first expression, and enforces
     One-Vote Veto on monopolizing/interruption/personal-attack/slacking minefields (25%+15%+10%).
3. Associate Examiner B (`scribe_b` · 副面试官 B · 周PM [记录员/资深PM]):
   - Maintains the timestamped Milestone & Contribution Ledger (`[MM:SS]` who broke ice,
     who framed core structure, who redirected topic drift, and Timer/Reporter duty fulfillment) (20%).
"""

from __future__ import annotations

import re
from typing import Any

EXAMINER_PANEL_PROFILES: dict[str, dict[str, Any]] = {
    "lead": {
        "id": "lead",
        "title": "主面试官（主持人 / 业务骨干）",
        "name": "主面试官 · 顾总监",
        "short_name": "顾总监（主考）",
        "focus": "宣读规则 · 把控总时间 · 逻辑架构与观点质量 (30%)",
        "legacy_channel": "business",
    },
    "observer_a": {
        "id": "observer_a",
        "title": "副面试官 A（分区观察员 / HRBP）",
        "name": "副面试官A · 苏经理",
        "short_name": "苏经理（盯人观察）",
        "focus": "分区盯人 · 情绪稳定与倾听态度 · 霸麦/攻击红线否决 (50%)",
        "legacy_channel": "hr",
    },
    "scribe_b": {
        "id": "scribe_b",
        "title": "副面试官 B（里程碑记录员 / 资深PM）",
        "name": "副面试官B · 周PM",
        "short_name": "周PM（节点记录）",
        "focus": "时间戳贡献账本 · 破冰/立框/拉回主线 · Timer&Reporter履职 (20%)",
        "legacy_channel": "business",
    },
}


def compute_zone_watch_seats(user_seat: int = 4) -> list[int]:
    """Partition the 8-seat roundtable into two 4-seat observation sectors and return the sector containing `user_seat`."""
    safe_seat = max(1, min(8, int(user_seat or 4)))
    if safe_seat <= 4:
        return [1, 2, 3, 4]
    return [5, 6, 7, 8]

FRAMEWORK_RE = re.compile(r"维度|框架|三层|三点|分两步|分阶段|第一.*第二|边界|拆解|痛点.*方案")
CRITERIA_RE = re.compile(r"评判标准|筛选标准|排序标准|权重|先定标准|先对齐标准|按.*标准|三个标准")
DIRECT_OPTION_JUMP_RE = re.compile(r"我直接选|直接排|必须选[①②③④⑤⑥⑦⑧1234]|答案就是[①②③ABC]", re.IGNORECASE)
BOARD_AUTH_RE = re.compile(r"共享看板|结构记录|投屏|实时整理|大家看可以吗|对齐进度.*看板")
PARKING_LOT_RE = re.compile(r"暂存区|Parking\s*Lot|长期展望|备选池|二期展望", re.IGNORECASE)
METRIC_RE = re.compile(r"\d+(?:\.\d+)?(?:\s*%|\s*倍|\s*万|\s*人|\s*天|\s*周|\s*分钟|\s*小时|\s*项)|指标|ROI|成本|准时率|转化率|时延")
TEAMMATE_RE = re.compile(r"([1-8]号|小林|陈思|李理|韩抢|孙偏|王和|刘时)")
BUILD_VERB_RE = re.compile(r"同意|赞同|认同|承接|补充|顺着|结合|串联|融合|桥接|折中")
SYNTHESIS_RE = re.compile(r"折中|桥接|融合|并行|分两步|短期.*长期|短期.*中期|兼顾|不矛盾|互补")
TIME_CALL_RE = re.compile(r"还剩\s*\d+\s*(?:分钟|秒)|注意时间|时间不多|看下时间|倒计时")
ACTIONABLE_PUSH_RE = re.compile(r"收敛|表决|排序|优先级|分工|汇报人|提纲|小结|总结一下|先定|敲定")
PROGRESS_RE = re.compile(r"时间|分钟|倒计时|还剩|进度|收敛|表决|排序|优先级|分工|汇报人|提纲|小结|总结一下")
REDIRECT_RE = re.compile(r"拉回|回到主线|回到正题|备选池|集中火力|先定主方案|核心矛盾|不发散")
CLICHE_RE = re.compile(r"赋能|抓手|闭环|组合拳|底层逻辑|顶层设计|生态化反|全链路拉通|对齐颗粒度")
RAW_INTERRUPT_RE = re.compile(r"^(?:打断一下|别说了|停一下|你错了|完全不对|纯属浪费时间)")
RESILIENCE_RE = re.compile(r"先让我说完|补充完核心|回应5号|回应韩抢|接住.*质疑|刚性约束|淘汰红线|责任人|Owner")
FOLLOWUP_DEFENSE_RE = re.compile(r"标准|P0|最小可行|MVP|暂存|团队|共识|底线|指标|止损")
STUBBORN_RIGID_RE = re.compile(r"我坚持必须|必须按我的|只能选我|绝不退让|别的方案都不行|不用听别人|只有我的方案|没得商量|我绝不同意妥协")
TIME_DRAG_STALL_RE = re.compile(r"先别急着收敛|再多聊一会儿|不用管时间|慢慢讨论不急|先重新讨论审题|推倒重来再聊")
CONCLUSION_FIRST_RE = re.compile(r"^(?:我的核心结论是|结论先行|我先亮结论|总的来说|一句话总结|核心观点就三点|直接给结论|我主张优先)")
DEFENSIVE_AGITATED_RE = re.compile(r"你懂不懂|别乱扣帽子|根本不是你说的那样|凭什么否定我|有完没完|莫名其妙")


def _format_mmss(seconds: int | float | None, fallback_index: int = 0) -> str:
    if seconds is None or seconds < 0:
        est = max(5, fallback_index * 18)
    else:
        est = int(seconds)
    m = est // 60
    s = est % 60
    return f"{m:02d}:{s:02d}"


def _clean_quote(text: str, limit: int = 46) -> str:
    compact = re.sub(r"\s+", " ", (text or "").strip())
    return compact[:limit] + ("…" if len(compact) > limit else "")


def evaluate_utterance_side_channel(
    utterance: dict[str, Any],
    transcript_prior: list[dict[str, Any]] | None = None,
    *,
    user_role: str = "member",
    phase: str | None = None,
    elapsed_seconds: int | float | None = None,
    turn_index: int = 0,
) -> list[dict[str, Any]]:
    """Evaluate a single utterance as an isolated side-channel observer.

    Only human candidate (`user` / `isUser`) turns emit scored examiner tags,
    ensuring candidate sandboxes never see examiner feedback during discussion.
    """
    is_user = bool(
        utterance.get("isUser")
        or utterance.get("role") == "user"
        or utterance.get("senderId") == "user"
    )
    text = str(utterance.get("text") or utterance.get("content") or "").strip()
    if not is_user or not text:
        return []

    prior = [
        m
        for m in (transcript_prior or [])
        if m.get("role") != "system" and not m.get("isSystem") and (m.get("text") or m.get("content"))
    ]
    prev_msg = prior[-1] if prior else None
    prev_sender_id = (prev_msg or {}).get("senderId") or ""
    prev_speaker = (prev_msg or {}).get("speaker") or (prev_msg or {}).get("senderName") or ""

    eff_phase = phase or utterance.get("phase") or "free_discussion"
    ts_label = _format_mmss(elapsed_seconds, fallback_index=turn_index or len(prior) + 1)
    quote = _clean_quote(text)
    tags: list[dict[str, Any]] = []

    teammate_mentions = set(TEAMMATE_RE.findall(text))
    has_metric = bool(METRIC_RE.search(text))
    has_framework = bool(FRAMEWORK_RE.search(text))
    has_criteria = bool(CRITERIA_RE.search(text))
    has_direct_jump = bool(DIRECT_OPTION_JUMP_RE.search(text))
    prior_had_criteria = any(
        re.search(r"标准|权重|维度|原则", str(m.get("text") or m.get("content") or ""))
        for m in prior
    )
    has_board_auth = bool(BOARD_AUTH_RE.search(text))
    has_parking = bool(PARKING_LOT_RE.search(text))
    has_synthesis = bool(SYNTHESIS_RE.search(text)) or (len(teammate_mentions) >= 2 and BUILD_VERB_RE.search(text))
    has_time_call = bool(TIME_CALL_RE.search(text))
    has_actionable_push = bool(ACTIONABLE_PUSH_RE.search(text))
    is_mechanical_time_only = has_time_call and not has_actionable_push and not has_framework and not has_synthesis
    has_progress = bool(PROGRESS_RE.search(text)) and not is_mechanical_time_only
    cliche_count = len(CLICHE_RE.findall(text))

    # 0A. Iron Law 1: Team Authorization for Shared Visual Board
    if has_board_auth:
        tags.append(
            {
                "id": f"obs-auth-{turn_index}",
                "ts_label": ts_label,
                "phase": eff_phase,
                "examiner": "hr",
                "examiner_name": "组织行为 HRBP · 苏经理",
                "tag": "团队授权控屏",
                "delta": 2,
                "polarity": "positive",
                "quote": quote,
                "reason": "遵循可视化铁律1：先用服务型话术征得队友授权再开启共享看板，掌握柔性主导权。",
            }
        )

    # 0B. Criteria-Before-Options vs Direct Option Jump
    if has_criteria and len(prior) <= 6:
        tags.append(
            {
                "id": f"obs-crit-{turn_index}",
                "ts_label": ts_label,
                "phase": eff_phase,
                "examiner": "business",
                "examiner_name": "业务终面官 · 林总监",
                "tag": "先立评判标准",
                "delta": 2,
                "polarity": "positive",
                "quote": quote,
                "reason": "在争论具体选项前先行确立评判标准与权重，从根源避免主观喜好拉扯。",
            }
        )
    elif has_direct_jump and not has_criteria and not prior_had_criteria and eff_phase == "free_discussion":
        tags.append(
            {
                "id": f"obs-optjump-{turn_index}",
                "ts_label": ts_label,
                "phase": eff_phase,
                "examiner": "business",
                "examiner_name": "业务终面官 · 林总监",
                "tag": "未立标准直跳选项",
                "delta": -1,
                "polarity": "warning",
                "quote": quote,
                "reason": "尚未对齐评判标准便直接争执具体选项结论，易陷入低效主观拉锯。",
            }
        )

    # 0C. Parking Lot Gentle Shelving
    if has_parking:
        tags.append(
            {
                "id": f"obs-park-{turn_index}",
                "ts_label": ts_label,
                "phase": eff_phase,
                "examiner": "hr",
                "examiner_name": "组织行为 HRBP · 苏经理",
                "tag": "Parking Lot收纳",
                "delta": 2,
                "polarity": "positive",
                "quote": quote,
                "reason": "将偏离主线或超期亮点温和收入暂存区作为长期展望，既尊重队友又保住主线节奏。",
            }
        )

    # 1. Opening / Early Framework Definition
    if has_framework and (eff_phase == "personal_statement" or len(prior) <= 4):
        tags.append(
            {
                "id": f"obs-fw-{turn_index}",
                "ts_label": ts_label,
                "phase": eff_phase,
                "examiner": "business",
                "examiner_name": "业务终面官 · 林总监",
                "tag": "破冰立框",
                "delta": 2,
                "polarity": "positive",
                "quote": quote,
                "reason": "在开局/陈述期主动界定讨论维度与结构化拆解框架，建立隐形控场锚点。",
            }
        )

    # 2. Second-order Conflict Synthesis (Bridging >=2 teammates or explicit synthesis)
    if has_synthesis:
        tags.append(
            {
                "id": f"obs-syn-{turn_index}",
                "ts_label": ts_label,
                "phase": eff_phase,
                "examiner": "hr",
                "examiner_name": "组织行为 HRBP · 苏经理",
                "tag": "二阶折中破局",
                "delta": 2,
                "polarity": "positive",
                "quote": quote,
                "reason": "将场上对立诉求按时间轴或底线/赋能双层融合，体现高阶团队整合力。",
            }
        )
    elif teammate_mentions and BUILD_VERB_RE.search(text):
        tags.append(
            {
                "id": f"obs-build-{turn_index}",
                "ts_label": ts_label,
                "phase": eff_phase,
                "examiner": "hr",
                "examiner_name": "组织行为 HRBP · 苏经理",
                "tag": "点名有效承接",
                "delta": 1,
                "polarity": "positive",
                "quote": quote,
                "reason": f"明确锚定队友（{'/'.join(sorted(teammate_mentions))}）观点并做增量延伸，倾听协作感强。",
            }
        )

    # 3. Topic-Drift Correction right after Digresser (6号·孙偏)
    if (prev_sender_id == "digresser" or "孙偏" in prev_speaker) and (REDIRECT_RE.search(text) or has_progress):
        tags.append(
            {
                "id": f"obs-redir-{turn_index}",
                "ts_label": ts_label,
                "phase": eff_phase,
                "examiner": "business",
                "examiner_name": "业务终面官 · 林总监",
                "tag": "温和纠偏控场",
                "delta": 2,
                "polarity": "positive",
                "quote": quote,
                "reason": "在6号跑题发散后第一时间温和收束并拉回核心议程，避免全组时间空耗。",
            }
        )

    # 4. Anti-Interruption Resilience right after Interrupter (5号·韩抢)
    if (prev_sender_id == "interrupter" or "韩抢" in prev_speaker) and (RESILIENCE_RE.search(text) or has_metric or has_synthesis):
        tags.append(
            {
                "id": f"obs-resil-{turn_index}",
                "ts_label": ts_label,
                "phase": eff_phase,
                "examiner": "hr",
                "examiner_name": "组织行为 HRBP · 苏经理",
                "tag": "高压接招稳场",
                "delta": 1,
                "polarity": "positive",
                "quote": quote,
                "reason": "面对5号高压质询未情绪化对抗，用执行边界或量化指标正面接住挑战。",
            }
        )

    # 5. Quantitative Business Evidence (exclude pure mechanical countdown mentions)
    if has_metric and not is_mechanical_time_only:
        tags.append(
            {
                "id": f"obs-metric-{turn_index}",
                "ts_label": ts_label,
                "phase": eff_phase,
                "examiner": "business",
                "examiner_name": "业务终面官 · 林总监",
                "tag": "量化指标支撑",
                "delta": 1,
                "polarity": "positive",
                "quote": quote,
                "reason": "发言包含具体量化数字、时间窗口或ROI验收口径，方案可落地性强。",
            }
        )

    # 6. Agenda / Timekeeper Propulsion vs Mechanical Timekeeping Redline
    if is_mechanical_time_only and eff_phase == "free_discussion":
        tags.append(
            {
                "id": f"obs-mechtime-{turn_index}",
                "ts_label": ts_label,
                "phase": eff_phase,
                "examiner": "hr",
                "examiner_name": "组织行为 HRBP · 苏经理",
                "tag": "机械报时预警",
                "delta": -1,
                "polarity": "warning",
                "quote": quote,
                "reason": "失分红线：仅机械播报剩余时间（如‘还剩X分钟’）却未给出收敛、分工或优先级建议。",
            }
        )
    elif has_progress and eff_phase == "free_discussion":
        tags.append(
            {
                "id": f"obs-prog-{turn_index}",
                "ts_label": ts_label,
                "phase": eff_phase,
                "examiner": "business",
                "examiner_name": "业务终面官 · 林总监",
                "tag": "议程推进收敛",
                "delta": 2 if user_role in ("leader", "timekeeper") else 1,
                "polarity": "positive",
                "quote": quote,
                "reason": "主动结合剩余时间推动优先级排序、分工或汇报提纲敲定。",
            }
        )

    # 6B. Stage-5 Examiner Follow-up Stress Defense
    if eff_phase == "examiner_followup" and FOLLOWUP_DEFENSE_RE.search(text):
        tags.append(
            {
                "id": f"obs-followup-{turn_index}",
                "ts_label": ts_label,
                "phase": eff_phase,
                "examiner": "business",
                "examiner_name": "业务终面官 · 林总监",
                "tag": "追问稳健兜底",
                "delta": 2,
                "polarity": "positive",
                "quote": quote,
                "reason": "面对考官压力追问未推翻团队共识，能锚定共同标准与最小可行闭环稳健应对。",
            }
        )

    # 7. Deductions / Warnings: Teleprompter Cliches or Blunt Interruption
    if cliche_count >= 2 and not teammate_mentions and not has_metric:
        tags.append(
            {
                "id": f"obs-cliche-{turn_index}",
                "ts_label": ts_label,
                "phase": eff_phase,
                "examiner": "hr",
                "examiner_name": "组织行为 HRBP · 苏经理",
                "tag": "套话背稿预警",
                "delta": -1,
                "polarity": "warning",
                "quote": quote,
                "reason": "密集堆砌互联网黑话且未与场上队友观点咬合，易被考官判定为模板背诵。",
            }
        )

    meta = utterance.get("meta") or {}
    if (meta.get("interruption") or meta.get("barge_in") or RAW_INTERRUPT_RE.search(text)) and not BUILD_VERB_RE.search(text) and len(text) < 28:
        tags.append(
            {
                "id": f"obs-blunt-{turn_index}",
                "ts_label": ts_label,
                "phase": eff_phase,
                "examiner": "hr",
                "examiner_name": "组织行为 HRBP · 苏经理",
                "tag": "生硬抢话扣分",
                "delta": -1,
                "polarity": "warning",
                "quote": quote,
                "reason": "插话打断队友后未给出承接缓冲或高信息量推进，存在压制他人表达风险。",
            }
        )

    # 7B. Stubbornness / Refusal to Compromise & Time-Dragging Filibuster Warnings
    if STUBBORN_RIGID_RE.search(text) and not has_synthesis:
        tags.append(
            {
                "id": f"obs-stubborn-{turn_index}",
                "ts_label": ts_label,
                "phase": eff_phase,
                "examiner": "hr",
                "examiner_name": "组织行为 HRBP · 苏经理",
                "tag": "固执己见拉扯",
                "delta": -2,
                "polarity": "warning",
                "quote": quote,
                "reason": "群面高危失分项：排他性固执己见、拒绝折中与吸收队友视角，若导致超时未共识将承担首要扣分责任。",
            }
        )
    if TIME_DRAG_STALL_RE.search(text) or (
        len(text) >= 165 and not has_metric and not teammate_mentions and not has_actionable_push
    ):
        tags.append(
            {
                "id": f"obs-drag-{turn_index}",
                "ts_label": ts_label,
                "phase": eff_phase,
                "examiner": "business",
                "examiner_name": "业务终面官 · 林总监",
                "tag": "拖延空转预警",
                "delta": -2,
                "polarity": "warning",
                "quote": quote,
                "reason": "冗长空转或阻挠议程收敛，挤占公共时间窗口却未产出增量结构或量化结论。",
            }
        )

    # 1B. Conclusion-First Crisp Persuasion (`表达与说服力 15%`)
    if CONCLUSION_FIRST_RE.search(text) and len(text) <= 135:
        tags.append(
            {
                "id": f"obs-concfirst-{turn_index}",
                "ts_label": ts_label,
                "phase": eff_phase,
                "panel_id": "observer_a",
                "examiner": "hr",
                "examiner_name": "副面试官A · 苏经理",
                "tag": "结论先行表达",
                "delta": 2,
                "polarity": "positive",
                "quote": quote,
                "reason": "采用‘结论先行（总-分）’句式干脆输出，说服力与听感极佳。",
            }
        )

    # 7C. Defensive / Agitated Tone Warning (`副面试官A 分区盯人情绪监测`)
    if DEFENSIVE_AGITATED_RE.search(text):
        tags.append(
            {
                "id": f"obs-agitated-{turn_index}",
                "ts_label": ts_label,
                "phase": eff_phase,
                "panel_id": "observer_a",
                "examiner": "hr",
                "examiner_name": "副面试官A · 苏经理",
                "tag": "防御激动预警",
                "delta": -2,
                "polarity": "warning",
                "quote": quote,
                "reason": "分区盯人记录：被反驳后出现情绪激动或强防御性反呛，触发表达与抗压雷区。",
            }
        )

    # Fallback constructive note if a user spoke very briefly with no distinct signal
    if not tags and len(text) < 15:
        tags.append(
            {
                "id": f"obs-thin-{turn_index}",
                "ts_label": ts_label,
                "phase": eff_phase,
                "examiner": "business",
                "examiner_name": "业务终面官 · 林总监",
                "tag": "信息密度偏低",
                "delta": -1,
                "polarity": "warning",
                "quote": quote,
                "reason": "单次抢麦发言过短，缺少独立论据或推进动作，有效贡献度不足。",
            }
        )

    # Attribute each annotation cleanly to the 3-Examiner Panel (`lead` / `observer_a` / `scribe_b`)
    scribe_tags = {"先立评判标准", "Parking Lot收纳", "温和纠偏控场", "议程推进收敛", "机械报时预警"}
    lead_tags = {"破冰立框", "量化指标支撑", "追问稳健兜底", "未立标准直跳选项", "拖延空转预警", "信息密度偏低"}
    for t_obj in tags:
        if "panel_id" not in t_obj:
            t_name = t_obj.get("tag") or ""
            if t_name in scribe_tags:
                t_obj["panel_id"] = "scribe_b"
                t_obj["examiner_name"] = "副面试官B · 周PM"
            elif t_name in lead_tags:
                t_obj["panel_id"] = "lead"
                t_obj["examiner_name"] = "主面试官 · 顾总监"
            else:
                t_obj["panel_id"] = "observer_a"
                t_obj["examiner_name"] = "副面试官A · 苏经理"

    return tags[:3]


DEFAULT_SEAT_NUMBERS: dict[str, int] = {
    "ice_breaker": 1,
    "idea_king": 2,
    "logician": 3,
    "user": 4,
    "interrupter": 5,
    "digresser": 6,
    "mediator": 7,
    "timekeeper": 8,
}


def build_milestone_ledger(
    transcript: list[dict[str, Any]],
    *,
    seat_map: dict[str, int] | None = None,
    participant_roles: dict[str, str] | None = None,
) -> list[dict[str, Any]]:
    """Associate Examiner B (`副面试官 B · 周PM`) timestamped milestone & contribution ledger."""
    smap = {**DEFAULT_SEAT_NUMBERS, **(seat_map or {})}
    ledger: list[dict[str, Any]] = []
    non_sys = [
        m
        for m in (transcript or [])
        if m.get("role") != "system" and not m.get("isSystem") and (m.get("text") or m.get("content"))
    ]
    broke_ice = False
    prev_was_digress = False

    for idx, msg in enumerate(non_sys):
        txt = str(msg.get("text") or msg.get("content") or "").strip()
        is_user = bool(msg.get("isUser") or msg.get("role") == "user" or msg.get("senderId") == "user")
        sid = "user" if is_user else str(msg.get("senderId") or "")
        seat_no = smap.get(sid, 4 if is_user else 1)
        speaker = "你" if is_user else str(msg.get("speaker") or msg.get("senderName") or "队友")
        ts_label = _format_mmss(msg.get("elapsed_seconds"), fallback_index=idx + 1)
        phase = msg.get("phase") or "free_discussion"

        if not broke_ice and phase in ("personal_statement", "free_discussion"):
            broke_ice = True
            ledger.append(
                {
                    "ts_label": ts_label,
                    "seat": seat_no,
                    "participant_id": sid or speaker,
                    "speaker": f"{seat_no}号·{speaker}",
                    "milestone": "首轮破冰开场",
                    "impact": +2,
                    "detail": _clean_quote(txt, 38),
                }
            )
        if FRAMEWORK_RE.search(txt) or CRITERIA_RE.search(txt):
            ledger.append(
                {
                    "ts_label": ts_label,
                    "seat": seat_no,
                    "participant_id": sid or speaker,
                    "speaker": f"{seat_no}号·{speaker}",
                    "milestone": "提出核心框架/评判标准",
                    "impact": +3,
                    "detail": _clean_quote(txt, 38),
                }
            )
        if prev_was_digress and (REDIRECT_RE.search(txt) or PARKING_LOT_RE.search(txt) or ACTIONABLE_PUSH_RE.search(txt)):
            ledger.append(
                {
                    "ts_label": ts_label,
                    "seat": seat_no,
                    "participant_id": sid or speaker,
                    "speaker": f"{seat_no}号·{speaker}",
                    "milestone": "偏题拉回主线",
                    "impact": +3,
                    "detail": _clean_quote(txt, 38),
                }
            )
        if TIME_CALL_RE.search(txt) and ACTIONABLE_PUSH_RE.search(txt):
            ledger.append(
                {
                    "ts_label": ts_label,
                    "seat": seat_no,
                    "participant_id": sid or speaker,
                    "speaker": f"{seat_no}号·{speaker}",
                    "milestone": "关键时间节点控场收敛",
                    "impact": +2,
                    "detail": _clean_quote(txt, 38),
                }
            )
        elif TIME_CALL_RE.search(txt) and not ACTIONABLE_PUSH_RE.search(txt):
            ledger.append(
                {
                    "ts_label": ts_label,
                    "seat": seat_no,
                    "participant_id": sid or speaker,
                    "speaker": f"{seat_no}号·{speaker}",
                    "milestone": "机械报时无收敛建议",
                    "impact": -2,
                    "detail": _clean_quote(txt, 38),
                }
            )
        if phase == "summary_report" or (msg.get("meta") or {}).get("summary"):
            ledger.append(
                {
                    "ts_label": ts_label,
                    "seat": seat_no,
                    "participant_id": sid or speaker,
                    "speaker": f"{seat_no}号·{speaker}",
                    "milestone": "代表全组总结陈词汇报",
                    "impact": +3,
                    "detail": _clean_quote(txt, 38),
                }
            )

        prev_was_digress = sid == "digresser" or bool( re.search(r"纪录片|南极|元宇宙|VR", txt) )

    # Check if user claimed Timer (`timekeeper`) yet never checked the clock
    roles = participant_roles or {}
    if roles.get("user") == "timekeeper":
        user_checked_clock = any(
            TIME_CALL_RE.search(str(m.get("text") or m.get("content") or ""))
            for m in non_sys
            if m.get("isUser") or m.get("role") == "user" or m.get("senderId") == "user"
        )
        if not user_checked_clock and any(
            m.get("isUser") or m.get("role") == "user" for m in non_sys
        ):
            u_seat = smap.get("user", 4)
            ledger.append(
                {
                    "ts_label": "终局核账",
                    "seat": u_seat,
                    "participant_id": "user",
                    "speaker": f"{u_seat}号·你",
                    "milestone": "抢占Timer却未报时失职",
                    "impact": -4,
                    "detail": "认领计时员身份但整场未输出时间节点提醒",
                }
            )

    return ledger[:12]


def evaluate_transcript_annotations(
    transcript: list[dict[str, Any]],
    *,
    user_role: str = "member",
) -> list[dict[str, Any]]:
    """Replay full transcript to generate deterministic side-channel examiner annotations."""
    annotations: list[dict[str, Any]] = []
    seen_prior: list[dict[str, Any]] = []

    for idx, msg in enumerate(transcript or []):
        tags = evaluate_utterance_side_channel(
            msg,
            seen_prior,
            user_role=user_role,
            phase=msg.get("phase"),
            elapsed_seconds=msg.get("elapsed_seconds"),
            turn_index=idx + 1,
        )
        annotations.extend(tags)
        if msg.get("role") != "system" and not msg.get("isSystem"):
            seen_prior.append(msg)

    return annotations


def build_competency_radar(
    *,
    spoke: bool,
    logic_score: int | float | None,
    progress_score: int | float | None,
    built_score: int | float | None,
    interrupt_score: int | float | None,
    authenticity_score: int | float | None,
    annotations: list[dict[str, Any]] | None = None,
    five_dim_scores: dict[str, int] | None = None,
) -> list[dict[str, Any]]:
    """Build 5-axis LGD competency radar aligned with the 30/25/20/15/10 weighted rubric matrix."""
    if not spoke:
        return [
            {"key": "logic_analysis", "axis": "逻辑分析(30%)", "label": "逻辑与分析能力", "weight": 0.30, "score": 0},
            {"key": "team_progression", "axis": "团队推进(25%)", "label": "团队协作与推进", "weight": 0.25, "score": 0},
            {"key": "role_contribution", "axis": "角色贡献(20%)", "label": "角色定位与贡献", "weight": 0.20, "score": 0},
            {"key": "expression_persuasion", "axis": "表达说服(15%)", "label": "表达与说服力", "weight": 0.15, "score": 0},
            {"key": "stress_adaptability", "axis": "抗压应变(10%)", "label": "抗压与应变能力", "weight": 0.10, "score": 0},
        ]

    if five_dim_scores:
        return [
            {"key": "logic_analysis", "axis": "逻辑分析(30%)", "label": "逻辑与分析能力", "weight": 0.30, "score": five_dim_scores["logic_analysis"]},
            {"key": "team_progression", "axis": "团队推进(25%)", "label": "团队协作与推进", "weight": 0.25, "score": five_dim_scores["team_progression"]},
            {"key": "role_contribution", "axis": "角色贡献(20%)", "label": "角色定位与贡献", "weight": 0.20, "score": five_dim_scores["role_contribution"]},
            {"key": "expression_persuasion", "axis": "表达说服(15%)", "label": "表达与说服力", "weight": 0.15, "score": five_dim_scores["expression_persuasion"]},
            {"key": "stress_adaptability", "axis": "抗压应变(10%)", "label": "抗压与应变能力", "weight": 0.10, "score": five_dim_scores["stress_adaptability"]},
        ]

    anns = annotations or []
    syn_bonus = sum(4 for a in anns if a.get("tag") in ("二阶折中破局", "温和纠偏控场", "高压接招稳场"))
    fw_bonus = sum(3 for a in anns if a.get("tag") in ("破冰立框", "量化指标支撑"))
    warn_penalty = sum(3 for a in anns if a.get("polarity") == "warning")

    def _clamp(val: float) -> int:
        return int(max(35, min(98, round(val))))

    d1 = _clamp((logic_score or 65) + fw_bonus - warn_penalty * 0.5)
    d2 = _clamp(((built_score or 60) * 0.6 + (progress_score or 60) * 0.4) + syn_bonus * 0.5)
    d3 = _clamp((progress_score or 62) + 3)
    d4 = _clamp(authenticity_score or 75)
    d5 = _clamp((interrupt_score or 70) + syn_bonus * 0.5 - warn_penalty * 0.5)

    return [
        {"key": "logic_analysis", "axis": "逻辑分析(30%)", "label": "逻辑与分析能力", "weight": 0.30, "score": d1},
        {"key": "team_progression", "axis": "团队推进(25%)", "label": "团队协作与推进", "weight": 0.25, "score": d2},
        {"key": "role_contribution", "axis": "角色贡献(20%)", "label": "角色定位与贡献", "weight": 0.20, "score": d3},
        {"key": "expression_persuasion", "axis": "表达说服(15%)", "label": "表达与说服力", "weight": 0.15, "score": d4},
        {"key": "stress_adaptability", "axis": "抗压应变(10%)", "label": "抗压与应变能力", "weight": 0.10, "score": d5},
    ]
