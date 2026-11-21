"""AI Resume Screener (Fixed Prompt & Execution Architecture) & Cross-Stage HR Memory Engine.

Implements two tightly coupled mechanisms for the Permadeath Recruiting Funnel (`一血通关`):
1. Fixed-Prompt AI Resume Screener (`RESUME_SCREENER_FIXED_PROMPT` + 3-Stage Pipeline):
   - Stage A (`1_tag_extraction`): Extracts structured `core_project_tags` & `quantified_claims`.
   - Stage B (`2_vulnerability_audit`): Identifies `suspicion_gaps` (metric baseline ambiguity,
     individual ownership boundary, edge-case resilience, or career-track jump).
   - Stage C (`3_deep_dive_dispatch`): Generates a tailored `deep_dive_checklist` dispatched
     specifically to `biz_1` (Execution/Project Deep-Dive), `biz_2` (Leader Stress Simulation),
     and `hr_final` (Cross-Stage Consistency & Motivation).
2. HR Final Cross-Stage Inheritance & Pressure Follow-up Mode:
   - Inherits Stage-1 Resume Vulnerabilities + Stage-2 LGD Behavioral Footprint (explicitly
     detecting compromise/concession, assertive dominance, passive following, or rigid clashing,
     e.g., probing "刚才群面时你为什么妥协了那个方案？").
   - Supports `pressure_mode=True` for multi-turn adversarial stress cross-examination auditing
     self-consistency across Resume claims, LGD behavior, and HR commitments.
"""

from __future__ import annotations

import json
import re
import urllib.request
from typing import Any

from app.config import settings
from app.services.lgd_multi_agent import _normalize_openai_completions_url

SCREENER_ARCHITECTURE_ID = "edgewise.screener.fixed_pipeline.v1"

RESUME_SCREENER_FIXED_PROMPT = (
    "【系统角色：首席 AI 简历筛选官（Fixed Screener Architecture v1）】\n"
    "你必须严格按照以下固定三步架构审阅候选人释放的简历，不得跳步或输出无关寒暄：\n"
    "Step 1 [核心项目标签提取 core_project_tags]：提取项目名称、技术/方法论标签（3-6个）与声称的量化结果；\n"
    "Step 2 [简历水分与盲区审计 suspicion_gaps]：识别未交代样本基线、个人贡献与团队边界模糊、或极端异常兜底缺失的疑点；\n"
    "Step 3 [跨关卡深挖问题清单派发 deep_dive_checklist]：生成 3-4 道尖锐深挖题，分别派发至 "
    "`biz_1`（一面执行真伪核验）、`biz_2`（二面Leader极端场景反例）与 `hr_final`（终面动机与前后一致性复核）。\n"
    "必须返回严格 JSON：{\"core_project_tags\": [...], \"quantified_claims\": [...], "
    "\"suspicion_gaps\": [...], \"deep_dive_checklist\": [{\"id\": ..., \"target_stage\": ..., \"tag\": ..., \"question\": ...}]}。"
)

SCREENER_EXECUTION_STEPS = [
    {"step": 1, "code": "tag_extraction", "label": "提取核心项目与技术标签"},
    {"step": 2, "code": "vulnerability_audit", "label": "审计量化口径与贡献边界疑点"},
    {"step": 3, "code": "dossier_dispatch", "label": "生成专属深挖问题清单并派发后续关卡"},
]

_METRIC_CLAIM_RE = re.compile(
    r"(?:提升|降低|压降|增长|缩短|优化|节省|达到|突破)[^，。；\n]{0,10}?\d+(?:\.\d+)?\s*(?:%|倍|万|ms|秒|s|人|天)"
    r"|\d+(?:\.\d+)?\s*(?:%|倍|万)\s*(?:提升|增长|下降|留存|转化)"
)
_COMPROMISE_RE = re.compile(
    r"折中|妥协|退一步|让步|兼顾|中和|平衡|分两步|先不砍|保留.*同时|桥接|融合|各退一步"
)
_ASSERTIVE_RE = re.compile(
    r"先确立|评判标准|我建议按|我来汇总|分工|锁定|必须明确|第一.*第二|主导|收敛"
)
_RIGID_RE = re.compile(
    r"我坚持必须|绝不退让|别的方案都不行|完全不同意|没得商量|只能选我"
)


def _extract_tags_deterministic(
    *,
    position: str,
    education: str,
    core_project: str,
    skills_text: str,
) -> dict[str, Any]:
    proj_clean = (core_project or "").strip()
    skills_raw = [
        s.strip()
        for s in re.split(r"[,，、/|\s]+", skills_text or "")
        if s.strip()
    ]

    # Derive concise project title + domain tags
    proj_title_match = re.match(r"^(?:主导|负责|参与)?([^：:，。；]{4,22})", proj_clean)
    proj_title = (
        proj_title_match.group(1).strip()
        if proj_title_match
        else (proj_clean[:18] if proj_clean else f"{position}核心业务项目")
    )

    domain_tokens = re.findall(
        r"(漏斗转化|A/B实验|规则引擎|高并发|微服务|推荐算法|大模型|RAG|多Agent|缓存降级|埋点诊断|留存增长|数据驱动|性能优化)",
        proj_clean,
    )
    merged_tags: list[str] = []
    for item in [proj_title, *domain_tokens, *skills_raw]:
        clean_t = item.strip()[:16]
        if clean_t and clean_t not in merged_tags:
            merged_tags.append(clean_t)
        if len(merged_tags) >= 6:
            break
    if not merged_tags:
        merged_tags = [f"{position}基础能力", "项目执行待核验"]

    claims = [m.group(0).strip() for m in _METRIC_CLAIM_RE.finditer(proj_clean)][:3]

    # Identify realistic resume vulnerabilities / gaps for downstream interviewers
    suspicion_gaps: list[str] = []
    if claims:
        suspicion_gaps.append(
            f"声称达成「{claims[0]}」，但未说明对照组基线、流量样本规模与排除季节性干扰的归因口径"
        )
    else:
        suspicion_gaps.append("项目描述缺少硬核量化结果指标（如转化率/延迟/ROI变化幅度），疑似参与度偏浅")

    if not re.search(r"独立|亲自|从0到1|唯一负责人", proj_clean):
        suspicion_gaps.append("团队协作功劳与个人独立攻坚边界未严格切分，需核实核心模块是否本人亲手落地")
    else:
        suspicion_gaps.append("宣称高比例个人主导推进，需核验跨团队资源博弈与故障兜底细节是否真实")

    if not re.search(r"回滚|熔断|失败|异常|瓶颈|坑|trade-off|取舍", proj_clean, re.IGNORECASE):
        suspicion_gaps.append("仅展示顺风局正向产出，未披露方案副作用、极端异常或关键技术/业务妥协点")

    primary_tag = merged_tags[0]
    tech_tag = skills_raw[0] if skills_raw else (merged_tags[1] if len(merged_tags) > 1 else position)
    claim_anchor = claims[0] if claims else "你声称的项目核心产出"

    checklist = [
        {
            "id": "dd_biz_1_ownership",
            "target_stage": "biz_1",
            "stage_label": "业务一面 · 项目真伪深挖",
            "tag": primary_tag,
            "question": (
                f"【AI简历筛选官派发深挖 #1 · 贡献与口径核验】你在简历「{proj_title}」中提到「{claim_anchor}」"
                f"并使用了 {tech_tag}：请剥离团队功劳，只讲你本人独立编写/设计的最核心一环是什么？"
                f"这个量化指标的分母基线与 A/B 置信度是怎么算出来的？"
            ),
        },
        {
            "id": "dd_biz_2_edgecase",
            "target_stage": "biz_2",
            "stage_label": "业务二面 · Leader反例压测",
            "tag": tech_tag,
            "question": (
                f"【AI简历筛选官派发深挖 #2 · 极端失效压测】沿用你简历「{proj_title}」的架构思路："
                f"如果线上峰值流量瞬间暴涨 3 倍、预算与算力砍半，且「{tech_tag}」链路出现严重延迟退化，"
                f"你原方案哪个环节会最先崩盘？请给出毫秒/分钟级止损取舍边界！"
            ),
        },
        {
            "id": "dd_hr_resume_gap",
            "target_stage": "hr_final",
            "stage_label": "HR终面 · 简历疑点与动机交叉复核",
            "tag": "简历盲区复核",
            "question": (
                f"你在第一关释放的简历里重点包装了「{proj_title}」的正向成果（{suspicion_gaps[-1]}）——"
                f"如果让你坦诚复盘该项目里你个人犯过最大的一个判断失误或被迫做出的妥协，那是什么？"
            ),
        },
    ]

    # Resume screening score
    score = 62
    if len(proj_clean) >= 18:
        score += 14
    elif len(proj_clean) >= 6:
        score += 7
    if claims:
        score += 10
    if len(skills_raw) >= 3:
        score += 7
    elif len(skills_raw) >= 1:
        score += 4
    if len((education or "").strip()) >= 4:
        score += 4
    if not proj_clean and not skills_raw:
        score = 42

    return {
        "architecture_id": SCREENER_ARCHITECTURE_ID,
        "fixed_prompt_digest": "Principal Resume Screener v1 (3-Step Tag -> Vulnerability -> Checklist Dispatch)",
        "execution_steps": SCREENER_EXECUTION_STEPS,
        "project_title": proj_title,
        "core_project_tags": merged_tags,
        "quantified_claims": claims,
        "suspicion_gaps": suspicion_gaps,
        "deep_dive_checklist": checklist,
        "resume_score": max(40, min(96, score)),
    }


def run_resume_screener_agent(
    *,
    position: str = "AI 产品经理",
    education: str = "",
    core_project: str = "",
    skills_text: str = "",
    api_key_override: str | None = None,
    base_url_override: str | None = None,
    model_override: str | None = None,
) -> dict[str, Any]:
    """Execute the Fixed-Prompt Resume Screener Agent (LLM-enhanced when configured + deterministic guarantee)."""
    det = _extract_tags_deterministic(
        position=position,
        education=education,
        core_project=core_project,
        skills_text=skills_text,
    )
    api_key = (api_key_override or settings.LGD_LLM_API_KEY or "").strip()
    if not api_key or not (core_project or skills_text):
        det["engine_source"] = "deterministic_screener_v1"
        return det

    try:
        url = _normalize_openai_completions_url(
            base_url_override or settings.LGD_LLM_BASE_URL or "https://api.openai.com/v1"
        )
        model = (model_override or settings.LGD_LLM_MODEL or "gpt-4o-mini").strip()
        user_content = (
            f"应聘岗位：{position}\n教育背景：{education}\n技能栈：{skills_text}\n"
            f"核心项目经历：{core_project}\n请严格按固定三步架构输出 JSON。"
        )
        body = json.dumps(
            {
                "model": model,
                "temperature": 0.2,
                "messages": [
                    {"role": "system", "content": RESUME_SCREENER_FIXED_PROMPT},
                    {"role": "user", "content": user_content},
                ],
            }
        ).encode("utf-8")
        req = urllib.request.Request(
            url,
            data=body,
            headers={
                "Content-Type": "application/json",
                "Authorization": f"Bearer {api_key}",
            },
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=8) as resp:
            payload = json.loads(resp.read().decode("utf-8"))
        raw_txt = payload["choices"][0]["message"]["content"]
        cleaned_json = re.sub(r"^```(?:json)?\s*|\s*```$", "", raw_txt.strip())
        parsed = json.loads(cleaned_json)
        if isinstance(parsed.get("core_project_tags"), list) and parsed["core_project_tags"]:
            det["core_project_tags"] = [str(x)[:18] for x in parsed["core_project_tags"][:6]]
        if isinstance(parsed.get("suspicion_gaps"), list) and parsed["suspicion_gaps"]:
            det["suspicion_gaps"] = [str(x)[:90] for x in parsed["suspicion_gaps"][:3]]
        if isinstance(parsed.get("deep_dive_checklist"), list) and len(parsed["deep_dive_checklist"]) >= 2:
            det["deep_dive_checklist"] = parsed["deep_dive_checklist"][:4]
        det["engine_source"] = "llm_fixed_screener_v1"
    except Exception:
        det["engine_source"] = "deterministic_screener_v1"

    return det


def analyze_lgd_footprint_for_hr(
    lgd_transcript: list[dict[str, Any]],
    lgd_score: float | int | None = None,
) -> dict[str, Any]:
    """Analyze the candidate's Stage-2 LGD behavior so HR Final can probe exact choices/compromises."""
    user_turns = [
        str(m.get("text") or m.get("content") or "").strip()
        for m in (lgd_transcript or [])
        if (m.get("isUser") or m.get("role") == "user" or m.get("senderId") == "user")
        and str(m.get("text") or m.get("content") or "").strip()
    ]
    joined = " ".join(user_turns)
    snippet = joined[:38] + ("…" if len(joined) > 38 else "") if joined else "未充分发声"

    has_compromise = bool(_COMPROMISE_RE.search(joined))
    has_assertive = bool(_ASSERTIVE_RE.search(joined))
    has_rigid = bool(_RIGID_RE.search(joined))

    if has_rigid:
        style = "rigid_clashing"
        style_label = "强势死磕 · 抗拒折中"
        hr_lgd_question = (
            "刚才第二关群面时，面对队友的不同意见你表现得寸步不让——为什么当时拒绝做二阶折中？"
            "如果入职后跨部门平级同事直接否决你的方案，你也会这样硬顶吗？"
        )
    elif has_compromise:
        style = "compromised_bridge"
        style_label = "折中调和 · 方案妥协"
        hr_lgd_question = (
            f"刚才群面时你为什么妥协了那个方案（你当时提出「{snippet}」来调和3号与5号的分歧），"
            "而不是坚持更彻底的单点突破？这是出于时间压力的策略性让步，还是你在冲突下习惯和稀泥？"
        )
    elif has_assertive and len(joined) >= 45:
        style = "assertive_leader"
        style_label = "主动立标 · 强势控场"
        hr_lgd_question = (
            f"刚才第二关群面中你主动抢过话语权确立评判标准（「{snippet}」）——"
            "如果入职后你作为校招新人在项目组没有正式职权，资深老员工不买账你的框架，你怎么推得动？"
        )
    else:
        style = "cautious_follower"
        style_label = "谨慎跟随 · 破局偏弱"
        hr_lgd_question = (
            "复盘刚才第二关群面，你在多人高压争论中的控场存在感偏弱——"
            "如果甚至在群面时你都选择顺着别人的框架走、轻易妥协话语权，进入高强度业务线后你如何证明自己的独立破局力？"
        )

    return {
        "style": style,
        "style_label": style_label,
        "utterance_excerpt": snippet,
        "lgd_score_sealed": lgd_score,
        "hr_lgd_probe": hr_lgd_question,
    }


def build_hr_cross_stage_opening(
    *,
    position: str,
    init_offer_k: int,
    dossier: dict[str, Any] | None = None,
    lgd_footprint: dict[str, Any] | None = None,
    pressure_mode: bool = True,
) -> str:
    """Synthesize the HR Final Boss opening message inheriting Stage-1 Resume + Stage-2 LGD behavior."""
    checklist = (dossier or {}).get("deep_dive_checklist") or []
    hr_resume_item = next(
        (c for c in checklist if c.get("target_stage") == "hr_final"),
        checklist[-1] if checklist else None,
    )
    resume_probe = (
        hr_resume_item["question"]
        if isinstance(hr_resume_item, dict) and hr_resume_item.get("question")
        else f"结合你第一关释放的「{position}」简历经历，你认为自己过往项目中最大的短板或失误是什么？"
    )
    lgd_probe = (
        (lgd_footprint or {}).get("hr_lgd_probe")
        or "刚才第二关群面时你为什么妥协了那个方案？请复盘你当时的真实决策心理。"
    )
    tone_prefix = (
        "【🔥 终面压力追问模式已开启】我是终面委员会主席林总监，已调阅你第1关简历筛查底稿与第2关群面暗中观察记录。"
        if pressure_mode
        else "欢迎进入【HR / 终面】综合复核！我已汇总你第1关简历画像与第2关群面观察记录。"
    )
    return (
        f"{tone_prefix}\n"
        f"请勿套用模板，一次性正面回应以下跨轮核验与录用四要素：\n"
        f"①【继承第1关·简历追问】{resume_probe}\n"
        f"②【继承第2关·群面复盘】{lgd_probe}\n"
        f"③【终面四维底线】请同步明确你的长期留任稳定性、最快到岗与连续实习时长、团队文化契合点，"
        f"以及薪资预期依据（当前初始核定锚点为 {init_offer_k}k/月）。"
    )


def generate_hr_pressure_followup_probe(
    *,
    candidate_answer: str,
    position: str = "AI 产品经理",
    dossier: dict[str, Any] | None = None,
    lgd_footprint: dict[str, Any] | None = None,
    expected_salary_k: int = 26,
    floor_k: int = 20,
    internship_commitment: str = "5days_6months",
) -> dict[str, Any]:
    """Generate an adversarial HR Pressure Follow-up Probe auditing cross-stage self-consistency."""
    txt = (candidate_answer or "").strip()
    proj_title = (dossier or {}).get("project_title") or "核心代表项目"
    lgd_style = (lgd_footprint or {}).get("style") or "compromised_bridge"

    addressed_lgd = bool(re.search(r"群面|折中|妥协|队友|共识|3号|5号|时间|让步|框架|主导", txt))
    addressed_resume = bool(re.search(r"项目|简历|复盘|失误|基线|指标|边界|改进|当时", txt))
    addressed_stability = bool(re.search(r"稳定|长期|深耕|留用|转正|实习|月|到岗", txt))

    consistency_score = (
        64
        + (11 if addressed_lgd else -6)
        + (11 if addressed_resume else -4)
        + (10 if addressed_stability else 0)
    )
    consistency_score = max(45, min(96, consistency_score))

    if not addressed_lgd:
        focus = "回避群面妥协动机"
        probe_text = (
            f"【🔥 HR 高压追击 · 严禁回避】你刚才避开了我对第二关群面的核心追问！"
            f"请直接回答：刚才群面时你为什么妥协了那个方案（风格判定：{(lgd_footprint or {}).get('style_label', '折中妥协')}）？"
            f"这与你第1关简历里宣称主导「{proj_title}」的强推进人设是否存在矛盾？"
            f"此外，若按你期望的 {expected_salary_k}k 定薪但试用期设置硬性淘汰线，你敢接受吗？"
        )
    elif lgd_style == "compromised_bridge":
        focus = "人设自洽度与底线抗压测试"
        probe_text = (
            f"【🔥 HR 高压追击 · 自洽性极限施压】你把刚才群面里的妥协解释为顾全团队节奏——"
            f"但结合你第1关简历「{proj_title}」里还未完全讲透的风险兜底盲区：如果入职后业务线上故障倒计时只剩 2 小时，"
            f"合作方强烈要求你再次妥协放行带病版本，你还会退让吗？另外如果最终核定总包锁在 {max(floor_k, expected_salary_k - 2)}k/月"
            f"（绑定转正考核），你的真实底线决定是什么？"
        )
    else:
        focus = "高压协作摩擦与期望薪资兑现度"
        probe_text = (
            f"【🔥 HR 高压追击 · 兑现度拷问】你在简历「{proj_title}」与刚才群面中的表现都很有锋芒，"
            f"但高薪意味着高淘汰预期：你报出的 {expectedSalaryK if False else expected_salary_k}k/月 已接近本岗 SP 带宽上限，"
            f"若入职首月不给你配齐额外资源、且要求独立跑通闭环验证，你凭什么保证不会在三个月内因落差离职？"
        )

    return {
        "focus": focus,
        "consistency_score": consistency_score,
        "addressed_lgd": addressed_lgd,
        "addressed_resume": addressed_resume,
        "probe_text": probe_text,
    }
