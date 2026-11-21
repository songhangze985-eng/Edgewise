"""Single Interview (1v1) 60/40 Question Taxonomy & Cross-Stage Context Handoff Engine.

Implements:
1. Standard Questions (60% weight, mandatory baseline structured via STAR / 5W2H):
   - `opening_motivation` (① 破冰与动机类 — Opening & Motivation)
   - `project_deep_dive` (② 简历项目深挖类 — Project Deep-Dive, core battlefield)
   - `domain_knowledge` (③ 专业基础与工具认知类 — Domain Knowledge)
   - `behavioral` (④ 行为面试类 — Behavioral Questions)

2. Non-Standard Questions (40% weight, SP Offer / High-Rating differentiator):
   - `case_scenario` (① 开放式业务场景题 — Case Study / Scenario Simulation)
   - `stress_rebuttal` (② 压力追问与极限反驳题 — Stress Testing / Devil's Advocate)
   - `lgd_cross_stage` (③ 跨环节联动追问 — LGD 表现回溯, LGD-to-1v1 promotion exclusive)
   - `fermi_estimation` (④ 费米估算 / 脑筋急转弯 — Fermi Estimation)
   - `reverse_qa` (⑤ 反向提问环节 — Reverse Q&A, hidden bonus / penalty)

3. Agent State Transition & Context Handoff (`lgd_report.json` + `resume.json` -> Single Interview):
   - Evaluator Agent synthesizes `lgd_report.json` at the end of LGD (`five_dimensions` + 1~2 `behavior_slices`,
     e.g. `{"timestamp": "12:30", "event": "妥协了核心定价策略", "weakness": "数据支撑不足"}`).
   - Interviewer Agent ingests `resume.json` + `lgd_report.json` on entering Single Interview, and right after
     `project_deep_dive` ("标准深挖"), automatically triggers:
       (a) 1 Cross-Stage LGD Linkage Probe (`lgd_cross_stage`)
       (b) 1 Devil's Advocate Stress Rebuttal Probe (`stress_rebuttal`)
"""

from __future__ import annotations

import re
from datetime import datetime, timezone
from typing import Any

TAXONOMY_VERSION = "edgewise.single_interview_taxonomy.v1"
LGD_REPORT_SCHEMA_VERSION = "edgewise.lgd_report.v1"
RESUME_HANDOFF_SCHEMA_VERSION = "edgewise.resume_handoff.v1"

# ============================================================================
# 1. Canonical 60% Standard vs 40% Non-Standard Taxonomy Catalog
# ============================================================================

STANDARD_QUESTION_TYPES: list[dict[str, Any]] = [
    {
        "subtype": "opening_motivation",
        "code": "S1",
        "taxonomy_class": "standard",
        "weight_group": "60%_standard",
        "weight_pct": 15,
        "name": "① 破冰与动机类（Opening & Motivation）",
        "short_label": "破冰与动机",
        "framework": "STAR / 3-Point Pitch",
        "typical_questions": [
            "用 2 分钟介绍一下你自己，重点讲讲和这个岗位最相关的经历。",
            "为什么想来我们团队做 AI 应用/产品实习，而不是走传统算法研发？",
        ],
        "assessment_points": [
            "信息提炼能力（2分钟内高密度锚定岗位核心需求）",
            "求职动机是否纯粹（对业务落地与用户价值的真实认知）",
        ],
        "red_flags": ["流水账背诵简历", "动机仅停留在“想学东西/大厂光环”"],
    },
    {
        "subtype": "project_deep_dive",
        "code": "S2",
        "taxonomy_class": "standard",
        "weight_group": "60%_standard",
        "weight_pct": 20,
        "name": "② 简历项目深挖类（Project Deep-Dive —— 核心主战场）",
        "short_label": "简历项目深挖",
        "framework": "STAR + 剥洋葱归因",
        "triggers_post_deep_dive_handoff": True,
        "typical_questions": [
            "你简历里写了做过一个多 Agent 模拟面试网站，当时的业务背景是什么？你在里面具体负责哪一块？遇到最大的技术或交互卡点是什么，最后怎么解决的？",
        ],
        "assessment_points": [
            "剥洋葱式核查水分，严格区分“你独立做的”还是“团队做的”",
            "技术或交互卡点的真实排障路径与量化结果闭环",
        ],
        "red_flags": ["全程用“我们团队”掩盖个人边界", "无法说明指标基线与排障细节"],
    },
    {
        "subtype": "domain_knowledge",
        "code": "S3",
        "taxonomy_class": "standard",
        "weight_group": "60%_standard",
        "weight_pct": 15,
        "name": "③ 专业基础与工具认知类（Domain Knowledge）",
        "short_label": "专业与工具认知",
        "framework": "5W2H + 工程/产品权衡",
        "typical_questions": [
            "在搭建 Agent 工作流时，你是怎么控制上下文窗口（Context Window）和降低响应延迟的？怎么评估生成结果的好坏（Eval）？",
        ],
        "assessment_points": [
            "是否具备实战工程/产品落地经验，而非纸上谈兵背概念",
            "Context Window 裁剪策略、首字延迟（TTFT）优化与 Eval 评测指标设计",
        ],
        "red_flags": ["仅背诵概念定义却无延迟/成本数字", "缺乏可落地的 Eval 黄金集与Badcase回归机制"],
    },
    {
        "subtype": "behavioral",
        "code": "S4",
        "taxonomy_class": "standard",
        "weight_group": "60%_standard",
        "weight_pct": 10,
        "name": "④ 行为面试类（Behavioral Questions）",
        "short_label": "行为与复盘",
        "framework": "STAR + 根因复盘",
        "typical_questions": [
            "讲一次你和团队成员意见严重不一致的经历，最后怎么解决的？",
            "讲一个你做过的最失败的项目，复盘一下原因。",
        ],
        "assessment_points": [
            "深度复盘能力与自我迭代闭环",
            "跨职能协作性格、换位思考能力以及是否习惯甩锅他人",
        ],
        "red_flags": ["把失败归咎于外部或队友（甩锅）", "用“假装是缺点的优点”敷衍复盘"],
    },
]

NON_STANDARD_QUESTION_TYPES: list[dict[str, Any]] = [
    {
        "subtype": "case_scenario",
        "code": "N1",
        "taxonomy_class": "non_standard",
        "weight_group": "40%_non_standard",
        "weight_pct": 10,
        "name": "① 开放式业务场景题（Case Study / Scenario Simulation）",
        "short_label": "开放业务场景",
        "framework": "MVP 闭环 + Trade-off + 冷启动漏斗",
        "typical_questions": [
            "假设现在老板让你在 2 周内上线一个面向应届生的 AI 简历修改助手，没有额外预算，你怎么设计 MVP（最小可行性产品）？核心指标看什么？怎么冷启动前 1000 个种子用户？",
        ],
        "assessment_points": [
            "从 0 到 1 的最小可行性架构能力（砍掉伪需求保核心闭环）",
            "极限资源取舍（Trade-off）思维与核心指标（North Star Metric）数据敏感度",
            "零预算冷启动前 1000 个种子用户的渠道抓手与裂变设计",
        ],
        "red_flags": ["一上来堆砌大而全功能导致2周无法上线", "无明确北极星指标与冷启动获客路径"],
    },
    {
        "subtype": "stress_rebuttal",
        "code": "N2",
        "taxonomy_class": "non_standard",
        "weight_group": "40%_non_standard",
        "weight_pct": 10,
        "name": "② 压力追问与极限反驳题（Stress Testing / Devil's Advocate）",
        "short_label": "压力反驳追问",
        "framework": "情绪锚定 + 承认合理边界 + 差异化壁垒反击",
        "typical_questions": [
            "（在听完你的项目介绍后突然打断）我觉得你这个功能完全是个伪需求，大厂随便一个通用大模型加个 Prompt 就能替代，你做的这些多 Agent 编排壁垒在哪里？有什么商业价值？",
        ],
        "assessment_points": [
            "情绪稳定性（被突然打断和全盘否定后是否慌乱、迎合讨好或防卫愤怒）",
            "能否在被否定后依然保持逻辑自洽，给出场景护城河、数据飞轮与工作流深度耦合的有力防守反击",
        ],
        "red_flags": ["瞬间慌乱全盘自我否定", "情绪激动与面试官硬顶却无数据/架构论据"],
    },
    {
        "subtype": "lgd_cross_stage",
        "code": "N3",
        "taxonomy_class": "non_standard",
        "weight_group": "40%_non_standard",
        "weight_pct": 10,
        "name": "③ 跨环节联动追问（LGD 表现回溯 —— 群面晋级专属）",
        "short_label": "LGD跨环节追问",
        "framework": "还原当时局势 + 承认短板 + 策略性取舍复盘",
        "typical_questions": [
            "刚才在无领导小组讨论里，我注意到第 15 分钟时你们组在商业模式上卡住了，你当时提出了一个方案但被 3 号同学否决了，你当时为什么没有坚持？你觉得他那个方案真的比你好吗？",
        ],
        "assessment_points": [
            "自我觉察力与跨环节诚实度",
            "对群面局势的真实判断（考察当时是“顾全大局推进共识的策略性妥协”还是“缺乏数据底气的退缩”）",
        ],
        "red_flags": ["甩锅给3号/5号队友", "前后说法自相矛盾或回避当时妥协的真实原因"],
    },
    {
        "subtype": "fermi_estimation",
        "code": "N4",
        "taxonomy_class": "non_standard",
        "weight_group": "40%_non_standard",
        "weight_pct": 5,
        "name": "④ 费米估算 / 脑筋急转弯（Fermi Estimation —— 偶发）",
        "short_label": "费米估算",
        "framework": "自顶向下漏斗拆解（总人口 → 白领比例 → 周报比例 → AI渗透率 → 日活频次）",
        "typical_questions": [
            "估算一下北京市每天有多少人在用 AI 工具写周报？",
        ],
        "assessment_points": [
            "不看最终数字绝对准度，核心考察结构化拆解逻辑（总人口 → 职场白领比例 → 需写周报比例 → AI 渗透率 → 日活折算频次）",
            "假设参数的常识合理性与边界交叉校验（Sanity Check）",
        ],
        "red_flags": ["直接拍脑袋报一个数字无拆解公式", "遗漏周报频次向日均（除以5个工作日）折算"],
    },
    {
        "subtype": "reverse_qa",
        "code": "N5",
        "taxonomy_class": "non_standard",
        "weight_group": "40%_non_standard",
        "weight_pct": 5,
        "name": "⑤ 反向提问环节（Reverse Q&A —— 隐藏加分项）",
        "short_label": "反向提问",
        "framework": "业务痛点探询 + 团队技术/产品演进路线对齐",
        "typical_questions": [
            "我这边的问题问完了，你有什么想问我的吗？",
        ],
        "assessment_points": [
            "好奇心与业务思考深度（问“团队目前在 AI 落地中遇到的最大业务痛点是什么”属强加分项；问“公司几点下班”属减分项）",
        ],
        "red_flags": ["初面/业务面只问“几点下班/食堂伙食”", "回答“我没有任何问题”错失双向交流窗口"],
    },
]

ALL_TAXONOMY_SUBTYPES: dict[str, dict[str, Any]] = {
    item["subtype"]: item
    for item in (*STANDARD_QUESTION_TYPES, *NON_STANDARD_QUESTION_TYPES)
}


def get_single_interview_taxonomy_catalog() -> dict[str, Any]:
    return {
        "version": TAXONOMY_VERSION,
        "weights": {
            "standard_pct": 60,
            "non_standard_pct": 40,
        },
        "standard_types": STANDARD_QUESTION_TYPES,
        "non_standard_types": NON_STANDARD_QUESTION_TYPES,
    }


# ============================================================================
# 2. Question Classification & Annotation (60% Standard vs 40% Non-Standard)
# ============================================================================


def classify_single_interview_question(
    title: str,
    *,
    qtype: str | None = None,
    category: str | None = None,
    explicit_subtype: str | None = None,
) -> dict[str, Any]:
    """Classify any 1v1 question into the 9 canonical Standard/Non-Standard subtypes."""
    if explicit_subtype and explicit_subtype in ALL_TAXONOMY_SUBTYPES:
        spec = ALL_TAXONOMY_SUBTYPES[explicit_subtype]
        return _build_annotation_from_spec(spec)

    t = (title or "").strip()
    cat = (category or "").strip()
    qt = (qtype or "").strip()

    # Non-standard detection first
    if re.search(r"无领导小组|群面|3\s*号|5\s*号|刚才在.*讨论里|为什么没有坚持|妥协了", t):
        return _build_annotation_from_spec(ALL_TAXONOMY_SUBTYPES["lgd_cross_stage"])
    if re.search(r"估算一下|费米|每天有多少人|多少家|市场规模估算|Fermi", t, re.IGNORECASE):
        return _build_annotation_from_spec(ALL_TAXONOMY_SUBTYPES["fermi_estimation"])
    if re.search(r"伪需求|通用大模型加个\s*Prompt|壁垒在哪里|有什么商业价值|突然打断|完全不同意你", t, re.IGNORECASE) or cat == "压力题":
        return _build_annotation_from_spec(ALL_TAXONOMY_SUBTYPES["stress_rebuttal"])
    if re.search(r"假设现在老板让你|2\s*周内上线|MVP|最小可行性产品|冷启动前\s*1000", t, re.IGNORECASE) or cat == "案例分析":
        return _build_annotation_from_spec(ALL_TAXONOMY_SUBTYPES["case_scenario"])
    if re.search(r"有什么想问我的|反问环节|你有什么问题问我", t):
        return _build_annotation_from_spec(ALL_TAXONOMY_SUBTYPES["reverse_qa"])

    # Standard detection (60%)
    if re.search(r"介绍一下你自己|自我介绍|为什么想来我们团队|为什么选择应聘|求职动机", t):
        return _build_annotation_from_spec(ALL_TAXONOMY_SUBTYPES["opening_motivation"])
    if (
        qt == "resume_specific"
        or re.search(r"简历里写|做过一个|具体负责哪一块|最大的技术或交互卡点|你在里面具体负责|主导的项目", t)
    ):
        return _build_annotation_from_spec(ALL_TAXONOMY_SUBTYPES["project_deep_dive"])
    if (
        re.search(r"意见严重不一致|最失败的项目|解决冲突|复盘一下原因|跨部门推动", t)
        or cat == "行为题"
    ):
        return _build_annotation_from_spec(ALL_TAXONOMY_SUBTYPES["behavioral"])

    return _build_annotation_from_spec(ALL_TAXONOMY_SUBTYPES["domain_knowledge"])


def _build_annotation_from_spec(spec: dict[str, Any]) -> dict[str, Any]:
    is_std = spec["taxonomy_class"] == "standard"
    prefix = "60% 标准题" if is_std else "40% 非标准题"
    return {
        "taxonomy_version": TAXONOMY_VERSION,
        "taxonomy_class": spec["taxonomy_class"],
        "taxonomy_subtype": spec["subtype"],
        "taxonomy_code": spec["code"],
        "taxonomy_name": spec["name"],
        "taxonomy_badge": f"{prefix} · {spec['short_label']}",
        "weight_group": spec["weight_group"],
        "framework": spec["framework"],
        "assessment_points": list(spec["assessment_points"]),
        "triggers_post_deep_dive_handoff": bool(spec.get("triggers_post_deep_dive_handoff")),
    }


# ============================================================================
# 3. Context Handoff Builder: `lgd_report.json` + `resume.json`
# ============================================================================

_COMPROMISE_SLICE_RE = re.compile(
    r"折中|妥协|退一步|让步|兼顾|分两步|先按|同意.*[1-8]号|都保留|先放一放"
)
_PRICING_BIZ_RE = re.compile(r"商业模式|定价|ROI|变现|收费|客单价|预算|成本|补贴")
_DATA_EVIDENCE_RE = re.compile(r"\d+(?:\.\d+)?\s*(?:%|万|倍|ms|秒|天|人|元)")


def build_lgd_report_json(
    transcript: list[dict[str, Any]] | None,
    lgd_metrics: dict[str, Any] | None = None,
    *,
    topic: str | None = None,
    room_id: str | None = None,
    user_role: str | None = None,
    user_seat: int = 4,
) -> dict[str, Any]:
    """Evaluator Agent generator for `lgd_report.json` (Context Handoff object after LGD ends).

    Produces:
      - `five_dimensions`: 5-axis scores (`expression`, `logic`, `teamwork`, `leadership`, `authenticity`)
      - `behavior_slices`: 1~2 concrete timestamped behavioral slices for Single Interview cross-stage probing,
        e.g. `{"timestamp": "12:30", "event": "妥协了核心定价策略", "weakness": "数据支撑不足"}`
    """
    metrics = lgd_metrics or {}
    dims = metrics.get("dimensions_suggested") or {}
    radar = metrics.get("competency_radar") or []
    radar_map = {str(r.get("key") or ""): r.get("score") for r in radar if isinstance(r, dict)}
    anti = metrics.get("anti_scripted") or {}

    five_dimensions = {
        "expression": dims.get("expression") or metrics.get("talk_share_score") or 76,
        "logic": dims.get("logic") or radar_map.get("logic") or 78,
        "teamwork": dims.get("teamwork") or metrics.get("built_on_others_score") or 80,
        "leadership": dims.get("leadership") or metrics.get("progress_score") or 75,
        "authenticity": anti.get("authenticity_score") or radar_map.get("authenticity") or 82,
    }

    non_sys = [
        m
        for m in (transcript or [])
        if m.get("role") != "system"
        and not m.get("isSystem")
        and str(m.get("text") or m.get("content") or "").strip()
    ]
    user_msgs = [
        m
        for m in non_sys
        if m.get("role") == "user" or m.get("isUser") or m.get("senderId") == "user"
    ]

    behavior_slices: list[dict[str, Any]] = []

    if user_msgs:
        for idx, u_msg in enumerate(user_msgs):
            txt = str(u_msg.get("text") or u_msg.get("content") or "").strip()
            has_data = bool(_DATA_EVIDENCE_RE.search(txt))
            has_compromise = bool(_COMPROMISE_SLICE_RE.search(txt))
            has_biz = bool(_PRICING_BIZ_RE.search(txt))

            # Estimate realistic discussion timestamp (e.g. 12:30 or 15:00)
            mm = 11 + min(6, idx * 3 + (1 if len(txt) > 30 else 0))
            ss = 30 if idx % 2 == 0 else 0
            ts_str = f"{mm:02d}:{ss:02d}"

            if has_compromise or not has_data:
                event_desc = (
                    "在商业模式与优先级争论中妥协了核心定价策略"
                    if has_biz or has_compromise
                    else "在观点交锋中放弃了独立备选方案、顺从3号同学框架"
                )
                weakness_desc = (
                    "数据支撑不足，面对3号逻辑王质询未给出量化ROI算账闭环"
                    if not has_data
                    else "破局坚持度不足，在时间压力下过早让渡核心判准"
                )
                behavior_slices.append(
                    {
                        "timestamp": ts_str,
                        "seat_clash": "3号同学（逻辑王·李理）",
                        "event": event_desc,
                        "weakness": weakness_desc,
                        "quote": txt[:64] + ("…" if len(txt) > 64 else ""),
                    }
                )
            if len(behavior_slices) >= 2:
                break

    if not behavior_slices:
        # Always guarantee 1~2 actionable behavioral slices for Context Handoff
        first_quote = (
            str(user_msgs[0].get("text") or user_msgs[0].get("content") or "").strip()[:60]
            if user_msgs
            else "未在关键分歧窗口抢麦亮出独立数据论据"
        )
        behavior_slices = [
            {
                "timestamp": "12:30",
                "seat_clash": "3号同学（逻辑王·李理）",
                "event": "妥协了核心定价策略",
                "weakness": "数据支撑不足",
                "quote": first_quote,
            },
            {
                "timestamp": "15:00",
                "seat_clash": "5号同学（抢话者·韩抢）",
                "event": "商业模式卡住时未坚持原方案，被3号同学否决后退让",
                "weakness": "抗压反驳与二阶证据链偏弱",
                "quote": first_quote,
            },
        ]

    return {
        "schema_version": LGD_REPORT_SCHEMA_VERSION,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "room_id": room_id,
        "topic": topic or "远程团队协作与AI商业化方案",
        "user_role": user_role or "member",
        "user_seat": user_seat,
        "overall_score": metrics.get("overall_score"),
        "five_dimensions": five_dimensions,
        "behavior_slices": behavior_slices[:2],
    }


def build_resume_handoff_json(
    resume_record: dict[str, Any] | None = None,
    *,
    position: str = "AI 产品经理 / Agent 应用工程师",
    dossier: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Normalize candidate's `resume.json` for Single Interview Context Handoff."""
    parsed = (resume_record or {}).get("parsed_data") or {}
    projects = parsed.get("projects") or []
    skills = parsed.get("skills") or []

    proj_name = (dossier or {}).get("project_title") or ""
    proj_desc = ""
    if projects and isinstance(projects[0], dict):
        proj_name = proj_name or str(projects[0].get("name") or projects[0].get("title") or "").strip()
        proj_desc = str(projects[0].get("description") or projects[0].get("summary") or "").strip()

    if not proj_name:
        preview = str((resume_record or {}).get("preview_text") or "").strip()
        if preview:
            proj_name = preview[:24]
            proj_desc = preview[:160]
        else:
            proj_name = "多 Agent 模拟面试网站（谈锋 Edgewise）"
            proj_desc = (
                "主导设计 8 人无领导小组群面多 Agent 沙箱协同与 1v1 动态追问工作流，"
                "通过滑动上下文窗口（Context Window）与 SSE 流式增量调度降低首字响应延迟。"
            )

    tags = (dossier or {}).get("core_project_tags") or (
        [str(s) for s in skills[:5]] if skills else ["多Agent编排", "Context Window裁剪", "SSE流式降延迟", "Eval评测闭环"]
    )
    suspicion_gaps = (dossier or {}).get("suspicion_gaps") or [
        "需剥洋葱核查多 Agent 状态流转与延迟压降是本人独立设计还是调用现成模板",
        "需验证通用大模型加单 Prompt 能否直接替代该多 Agent 编排壁垒",
    ]

    return {
        "schema_version": RESUME_HANDOFF_SCHEMA_VERSION,
        "resume_id": (resume_record or {}).get("id"),
        "position": position or "AI 产品经理 / Agent 应用工程师",
        "project_title": proj_name,
        "project_summary": proj_desc,
        "core_tags": tags[:6],
        "suspicion_gaps": suspicion_gaps[:3],
    }


# ============================================================================
# 4. Dynamic Post-Deep-Dive Probes (`lgd_cross_stage` + `stress_rebuttal`)
# ============================================================================


def generate_post_deep_dive_handoff_probes(
    *,
    candidate_answer: str = "",
    resume_json: dict[str, Any] | None = None,
    lgd_report_json: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Generate the two linked probes automatically triggered right after Standard Project Deep-Dive:
    1. `lgd_cross_stage_probe`: Cross-stage LGD behavioral slice callback
    2. `stress_rebuttal_probe`: Devil's advocate "pseudo-demand / big-tech single prompt" stress test
    """
    res_obj = resume_json or build_resume_handoff_json()
    lgd_obj = lgd_report_json or build_lgd_report_json([])

    slices = lgd_obj.get("behavior_slices") or []
    primary_slice = slices[0] if slices else {
        "timestamp": "12:30",
        "seat_clash": "3号同学（逻辑王·李理）",
        "event": "妥协了核心定价策略",
        "weakness": "数据支撑不足",
    }

    ts = primary_slice.get("timestamp") or "12:30"
    event = primary_slice.get("event") or "妥协了核心定价策略"
    weakness = primary_slice.get("weakness") or "数据支撑不足"
    clash_peer = primary_slice.get("seat_clash") or "3号同学"
    lgd_topic = lgd_obj.get("topic") or "商业模式与资源分配"

    lgd_cross_stage_probe = {
        "id": "handoff_lgd_cross_stage",
        "taxonomy_class": "non_standard",
        "taxonomy_subtype": "lgd_cross_stage",
        "taxonomy_badge": "40% 非标准题 · ③ 跨环节联动追问（LGD回溯）",
        "source_slice": primary_slice,
        "text": (
            f"【跨环节联动追问 · LGD 表现回溯】刚才在无领导小组讨论「{lgd_topic}」里，"
            f"我注意到第 {ts} 时你们组在商业模式上卡住了（行为切片：{event}，短板信号：{weakness}），"
            f"你当时提出了一个方案但被 {clash_peer} 否决了，你当时为什么没有坚持？"
            f"你觉得他那个方案真的比你好吗？这是顾全大局的策略性妥协，还是当时缺乏数据底气的退缩？"
        ),
        "assessment_points": ALL_TAXONOMY_SUBTYPES["lgd_cross_stage"]["assessment_points"],
    }

    proj_title = res_obj.get("project_title") or "多 Agent 模拟面试网站"
    ans_snippet = (candidate_answer or "").strip()[:36]
    anchor_phrase = f"（结合你刚才提到的「{ans_snippet}…」）" if ans_snippet else "（在听完你的项目介绍后突然打断）"

    stress_rebuttal_probe = {
        "id": "handoff_stress_rebuttal",
        "taxonomy_class": "non_standard",
        "taxonomy_subtype": "stress_rebuttal",
        "taxonomy_badge": "40% 非标准题 · ② 压力追问与极限反驳（Devil's Advocate）",
        "source_project": proj_title,
        "text": (
            f"【压力追问与极限反驳 · Devil's Advocate】{anchor_phrase}"
            f"我觉得你简历里做的「{proj_title}」完全是个伪需求！现在大厂随便一个通用大模型加个长 Prompt "
            f"就能直接替代，你折腾的这些多 Agent 编排和上下文传递壁垒到底在哪里？有什么真实的商业价值？"
        ),
        "assessment_points": ALL_TAXONOMY_SUBTYPES["stress_rebuttal"]["assessment_points"],
    }

    return {
        "handoff_version": TAXONOMY_VERSION,
        "resume_json": res_obj,
        "lgd_report_json": lgd_obj,
        "lgd_cross_stage_probe": lgd_cross_stage_probe,
        "stress_rebuttal_probe": stress_rebuttal_probe,
        "sequence": [lgd_cross_stage_probe, stress_rebuttal_probe],
    }


def build_60_40_curated_question_plan(
    *,
    position: str = "AI 产品经理 / Agent 应用工程师",
    resume_json: dict[str, Any] | None = None,
    lgd_report_json: dict[str, Any] | None = None,
) -> list[dict[str, Any]]:
    """Build a complete 1v1 Single Interview question list adhering to the 60% Standard + 40% Non-Standard blueprint."""
    res_obj = resume_json or build_resume_handoff_json(position=position)
    lgd_obj = lgd_report_json or build_lgd_report_json([])
    handoff = generate_post_deep_dive_handoff_probes(
        resume_json=res_obj,
        lgd_report_json=lgd_obj,
    )
    proj_title = res_obj.get("project_title") or "多 Agent 模拟面试网站"

    raw_items = [
        # --- 60% Standard Questions (4 items) ---
        {
            "id": "std_s1_opening",
            "type": "general",
            "subtype": "opening_motivation",
            "title": f"【① 破冰与动机】请用 2 分钟介绍一下你自己，重点讲讲和「{position}」最相关的经历；以及为什么想来我们团队做 AI 应用/产品，而不是走传统算法或纯后端研发？",
            "category": "行为题",
            "keywords": ["自我介绍", "相关经历", "求职动机", "AI应用", "业务落地"],
        },
        {
            "id": "std_s2_deep_dive",
            "type": "resume_specific",
            "subtype": "project_deep_dive",
            "title": f"【② 简历项目深挖 · 核心主战场】你简历里写了做过「{proj_title}」，当时的业务背景是什么？你在里面具体独立负责哪一块？遇到最大的技术或交互卡点是什么，最后怎么解决的？",
            "category": "行为题",
            "source_project": proj_title,
            "keywords": ["业务背景", "独立负责", "技术卡点", "解决方案", "量化结果"],
        },
        # --- Automatic Context Handoff Non-Standard Probes right after Project Deep-Dive ---
        {
            "id": "nonstd_n3_lgd_callback",
            "type": "general",
            "subtype": "lgd_cross_stage",
            "title": handoff["lgd_cross_stage_probe"]["text"],
            "category": "压力题",
            "keywords": ["群面复盘", "策略性妥协", "数据支撑", "方案对比", "全局推进"],
        },
        {
            "id": "nonstd_n2_stress_rebuttal",
            "type": "general",
            "subtype": "stress_rebuttal",
            "title": handoff["stress_rebuttal_probe"]["text"],
            "category": "压力题",
            "keywords": ["伪需求反驳", "多Agent壁垒", "上下文隔离", "商业价值", "护城河"],
        },
        # --- Remaining Standard Questions ---
        {
            "id": "std_s3_domain",
            "type": "professional",
            "subtype": "domain_knowledge",
            "title": "【③ 专业基础与工具认知】在搭建 Agent 工作流时，你是怎么控制上下文窗口（Context Window）和降低响应延迟的？怎么系统性评估生成结果的好坏（Eval）？",
            "category": "专业知识",
            "keywords": ["Context Window", "响应延迟", "流式输出", "Eval评测", "黄金测试集"],
        },
        {
            "id": "std_s4_behavioral",
            "type": "general",
            "subtype": "behavioral",
            "title": "【④ 行为面试与复盘】讲一次你和团队成员意见严重不一致的经历，最后怎么解决的？或者讲一个你做过的最失败/留有遗憾的项目，复盘一下核心原因。",
            "category": "行为题",
            "keywords": ["意见分歧", "冲突解决", "失败复盘", "个人归因", "迭代改进"],
        },
        # --- Remaining 40% Non-Standard Questions (Case Scenario + Fermi Estimation) ---
        {
            "id": "nonstd_n1_case_mvp",
            "type": "general",
            "subtype": "case_scenario",
            "title": "【① 开放式业务场景题】假设现在老板让你在 2 周内上线一个面向应届生的 AI 简历修改助手，没有额外预算，你怎么设计 MVP（最小可行性产品）？核心北极星指标看什么？怎么冷启动前 1000 个种子用户？",
            "category": "案例分析",
            "keywords": ["MVP设计", "资源取舍", "北极星指标", "冷启动", "种子用户"],
        },
        {
            "id": "nonstd_n4_fermi",
            "type": "general",
            "subtype": "fermi_estimation",
            "title": "【④ 费米估算】估算一下北京市每天有多少人在用 AI 工具写周报？请重点展示你的漏斗拆解逻辑（总人口 → 职场白领比例 → 需写周报比例 → AI 渗透率 → 日活频次）。",
            "category": "逻辑题",
            "keywords": ["常住人口", "白领比例", "周报渗透率", "日均折算", "交叉校验"],
        },
    ]

    enriched: list[dict[str, Any]] = []
    for item in raw_items:
        tax = classify_single_interview_question(
            item["title"],
            qtype=item["type"],
            category=item["category"],
            explicit_subtype=item["subtype"],
        )
        enriched.append(
            {
                **item,
                **tax,
                "lang": "zh-CN",
                "answer": None,
                "score": None,
                "logic_score": None,
                "logic_rule_version": None,
                "answer_valid": None,
                "invalid_reason": None,
            }
        )
    return enriched


# ============================================================================
# 5. Subtype-Specific Answer Diagnostics (Fermi, Stress Rebuttal, LGD Callback, Deep-Dive)
# ============================================================================


def evaluate_subtype_answer_signals(
    answer_text: str,
    *,
    subtype: str | None = None,
    question_title: str = "",
) -> dict[str, Any]:
    """Compute subtype-specific rubric bonus/diagnostics for Single Interview questions."""
    txt = (answer_text or "").strip()
    resolved_subtype = subtype
    if not resolved_subtype:
        resolved_subtype = classify_single_interview_question(question_title)["taxonomy_subtype"]

    spec = ALL_TAXONOMY_SUBTYPES.get(resolved_subtype, ALL_TAXONOMY_SUBTYPES["domain_knowledge"])
    hits: list[str] = []
    gaps: list[str] = []
    bonus = 0.0

    if resolved_subtype == "project_deep_dive":
        if re.search(r"我独立|我负责|我主导|我编写|我设计|本人", txt):
            hits.append("明确界定个人独立贡献边界（“我负责”而非笼统“我们”）")
            bonus += 5.0
        else:
            gaps.append("需进一步剥离团队功劳，明确说明哪些模块由你本人亲手完成")
        if re.search(r"卡点|瓶颈|难题|排障|解决|重构|降级", txt):
            hits.append("交代了具体技术/交互卡点与解决闭环")
            bonus += 4.0
        else:
            gaps.append("未充分展开项目最大的技术或交互卡点及排障过程")

    elif resolved_subtype == "domain_knowledge":
        if re.search(r"窗口|Context|摘要|滑动|裁剪|压缩|检索|Token", txt, re.IGNORECASE):
            hits.append("阐述了 Context Window 裁剪或状态隔离策略")
            bonus += 4.5
        else:
            gaps.append("建议补充 Context Window 控制的具体 Token 预算或滑动窗口机制")
        if re.search(r"Eval|评测|准确率|延迟|TTFT|流式|基线|Badcase", txt, re.IGNORECASE):
            hits.append("覆盖了延迟优化与 Eval 评测体系")
            bonus += 4.5
        else:
            gaps.append("缺乏生成结果好坏的量化 Eval 评估框架")

    elif resolved_subtype == "case_scenario":
        if re.search(r"MVP|最小|核心闭环|砍掉|取舍|优先级", txt, re.IGNORECASE):
            hits.append("具备清晰的 2 周 MVP 极简取舍（Trade-off）意识")
            bonus += 4.0
        else:
            gaps.append("未明确界定 2 周零预算下的最小可行产品（MVP）取舍边界")
        if re.search(r"指标|留存|转化率|采纳率|1000|种子|社群|校园|裂变|冷启动", txt):
            hits.append("给出核心监控指标与前 1000 种子用户冷启动抓手")
            bonus += 5.0
        else:
            gaps.append("需补充核心北极星指标与零预算获取前 1000 种子用户的具体渠道")

    elif resolved_subtype == "stress_rebuttal":
        if not re.search(r"你不懂|胡说|怎么可能没用", txt) and len(txt) >= 25:
            hits.append("面对尖锐否定保持情绪稳定与职业克制")
            bonus += 4.0
        if re.search(r"壁垒|状态机|沙箱|上下文隔离|多角色|评分校准|单\s*Prompt|闭环|数据飞轮", txt, re.IGNORECASE):
            hits.append("有理有据阐明多 Agent 编排相较单 Prompt 的工程与商业壁垒")
            bonus += 6.0
        else:
            gaps.append("防守反击时建议正面对比“单 Prompt 易串戏/幻觉”与“多 Agent 独立沙箱+状态流转”的本质差异")

    elif resolved_subtype == "lgd_cross_stage":
        if re.search(r"当时|时间|共识|全局|推进|妥协|3号|数据|复盘|如果重来", txt):
            hits.append("正面回应群面行为切片，展现高自我觉察力与全局判断复盘")
            bonus += 6.5
        else:
            gaps.append("切忌回避刚才群面的妥协细节，需坦诚区分“顾全大局的策略让步”与“数据准备不足”")

    elif resolved_subtype == "fermi_estimation":
        funnel_steps = sum(
            1
            for pat in (
                r"人口|2000万|2100万|2200万",
                r"白领|就业|职场|互联网|办公",
                r"周报",
                r"渗透率|AI|使用率",
                r"每天|日均|除以\s*5|工作日|周五",
            )
            if re.search(pat, txt, re.IGNORECASE)
        )
        if funnel_steps >= 3:
            hits.append(f"完整展现自顶向下费米拆解漏斗（命中 {funnel_steps}/5 层推导）")
            bonus += min(8.0, funnel_steps * 2.0)
        else:
            gaps.append("费米估算需显式拆解：北京市总人口 → 职场白领比例 → 需写周报比例 → AI 渗透率 → 日均频次折算")

    elif resolved_subtype == "behavioral":
        if re.search(r"复盘|我的问题|我当时|改进|反思|机制", txt) and not re.search(r"全怪他|都是别人的错", txt):
            hits.append("展现内归因复盘意识与具体改进动作，无甩锅倾向")
            bonus += 5.0
        else:
            gaps.append("行为复盘题建议聚焦个人可改进点与后续沉淀的防错机制")

    elif resolved_subtype == "opening_motivation":
        if re.search(r"相关|经历|项目|为什么|落地|用户价值", txt):
            hits.append("自我介绍紧扣岗位匹配度与真实业务动机")
            bonus += 4.5
        else:
            gaps.append("破冰介绍建议收敛在“与本岗最相关的核心经历 + 为什么选应用落地而非纯算法”")

    return {
        "taxonomy_class": spec["taxonomy_class"],
        "taxonomy_subtype": resolved_subtype,
        "taxonomy_badge": _build_annotation_from_spec(spec)["taxonomy_badge"],
        "framework": spec["framework"],
        "hit_signals": hits,
        "missing_signals": gaps,
        "rubric_bonus": round(bonus, 1),
    }
