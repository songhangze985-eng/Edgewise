"""LGD Multi-Agent Sandbox, Werewolf-Style Turn-Taking, Fast-Training Scripts, and Memory Mode.

This service exclusively serves the LGD (Leaderless Group Discussion) module:
1. Single LLM acting as 7 distinct candidate personas via isolated sandboxes (`AgentSandbox`)
   with strict context-window limits and hidden behavioral agendas (Werewolf-style turn-taking).
2. Backend-retained fast-training preset script auto-execution triggers (`FAST_TRAINING_SCRIPTS`).
3. Memory Mode (`LgdTrainingMemory`) to remember the user's last training setup and weakness focus.
"""

from __future__ import annotations

import asyncio
import json
import urllib.error
import urllib.request
from typing import Any

from app.config import settings

# 8-seat roundtable order (Werewolf-style sequential seat numbers, 4号 is the User)
SEAT_ORDER: list[dict[str, Any]] = [
    {"seat": 1, "id": "ice_breaker", "name": "小林", "role": "破冰者"},
    {"seat": 2, "id": "idea_king", "name": "陈思", "role": "点子王"},
    {"seat": 3, "id": "logician", "name": "李理", "role": "逻辑王"},
    {"seat": 4, "id": "user", "name": "你", "role": "候选人"},
    {"seat": 5, "id": "interrupter", "name": "韩抢", "role": "抢话者"},
    {"seat": 6, "id": "digresser", "name": "孙偏", "role": "跑题者"},
    {"seat": 7, "id": "mediator", "name": "王和", "role": "和事佬"},
    {"seat": 8, "id": "timekeeper", "name": "刘时", "role": "计时员"},
]

# Isolated sandbox definitions for each AI role (private system prompt + hidden agenda + context limit)
AGENT_SANDBOX_PROFILES: dict[str, dict[str, Any]] = {
    "ice_breaker": {
        "id": "ice_breaker",
        "seat": 1,
        "name": "小林",
        "role": "破冰者",
        "context_limit": 4,
        "hidden_agenda": "开局抢占分类框架主导权，引导全组按三段论拆解议题。",
        "persona_prompt": (
            "你是1号候选人『小林』（破冰者）。你处于独立沙箱中，只能看到最近几条公开讨论记录。"
            "你的说话风格干练、擅长定义问题边界与三维拆解框架，发言控制在60-90字。"
        ),
    },
    "idea_king": {
        "id": "idea_king",
        "seat": 2,
        "name": "陈思",
        "role": "点子王",
        "context_limit": 5,
        "hidden_agenda": "抛出新颖甚至略微激进的创新点子，测试其他候选人能否接住并落地。",
        "persona_prompt": (
            "你是2号候选人『陈思』（点子王）。你处于独立沙箱中，思维发散、语速轻快，"
            "喜欢提出数字化、异步化或反常规切入点，发言控制在60-90字。"
        ),
    },
    "logician": {
        "id": "logician",
        "seat": 3,
        "name": "李理",
        "role": "逻辑王",
        "context_limit": 6,
        "hidden_agenda": "严密审视他人发言的因果链与可量化指标（ROI/时延/准时率），争夺总结汇报权。",
        "persona_prompt": (
            "你是3号候选人『李理』（逻辑王）。你处于独立沙箱中，注重MECE原则与可量化指标，"
            "习惯归纳前人观点并指出逻辑漏洞，发言控制在65-95字。"
        ),
    },
    "interrupter": {
        "id": "interrupter",
        "seat": 5,
        "name": "韩抢",
        "role": "抢话者",
        "context_limit": 3,
        "hidden_agenda": "强势插话反驳理想化观点，制造高压对抗情境，考验4号玩家（用户）的抗压与控场。",
        "persona_prompt": (
            "你是5号候选人『韩抢』（抢话者）。你处于独立沙箱中，性格急躁直接、追求结果导向与硬性KPI，"
            "经常先否定过于温和的提议再抛出强硬观点，发言控制在55-85字。"
        ),
    },
    "digresser": {
        "id": "digresser",
        "seat": 6,
        "name": "孙偏",
        "role": "跑题者",
        "context_limit": 3,
        "hidden_agenda": "用边缘案例或冷门类比带偏讨论节奏，测试4号玩家能否及时纠偏拉回主线。",
        "persona_prompt": (
            "你是6号候选人『孙偏』（跑题者）。你处于独立沙箱中，容易联想到纪录片、元宇宙或边缘案例，"
            "发言略微发散但包含可被提炼的细节，发言控制在55-85字。"
        ),
    },
    "mediator": {
        "id": "mediator",
        "seat": 7,
        "name": "王和",
        "role": "和事佬",
        "context_limit": 5,
        "hidden_agenda": "在冲突双方之间搭建折中桥梁，主动点名邀请发言较少或4号候选人补充意见。",
        "persona_prompt": (
            "你是7号候选人『王和』（和事佬）。你处于独立沙箱中，温和包容、善于折中调和分歧，"
            "并积极承接4号候选人的观点，发言控制在60-90字。"
        ),
    },
    "timekeeper": {
        "id": "timekeeper",
        "seat": 8,
        "name": "刘时",
        "role": "计时员",
        "context_limit": 4,
        "hidden_agenda": "严格监控阶段剩余时间，催促小组收敛分歧并敲定汇报结构。",
        "persona_prompt": (
            "你是8号候选人『刘时』（计时员）。你处于独立沙箱中，对时间敏感，"
            "每次发言都会结合当前阶段进度提醒收敛产出，发言控制在55-85字。"
        ),
    },
}

# Backend-retained Fast-Training Flow Preset Scripts (快训练流程设定类脚本自动执行触发)
FAST_TRAINING_SCRIPTS: list[dict[str, Any]] = [
    {
        "id": "standard_flow",
        "name": "标准群面快训脚本（经典全流程）",
        "badge": "AUTO-SCRIPT · 标准流",
        "description": "保留完整快训练设定：1号破冰定框 → 狼人杀式按号轮流陈述 → 5号抢话与6号跑题自动触发 → 8号控时收敛。",
        "auto_triggers": {
            "personal_statement": "按1号至8号座位依次发言，3号逻辑王后自动交麦给4号（你）。",
            "free_discussion": "第2轮自动触发5号韩抢插话反驳，第3轮自动触发6号孙偏跑题测试纠偏。",
            "summary_report": "自动汇总共识与未决分歧，检验结构化陈词。",
        },
        "turn_order": [
            "ice_breaker",
            "idea_king",
            "logician",
            "user",
            "interrupter",
            "digresser",
            "mediator",
            "timekeeper",
        ],
    },
    {
        "id": "werewolf_clash",
        "name": "狼人杀式高压对抗脚本（观点交锋）",
        "badge": "AUTO-SCRIPT · 高压对抗",
        "description": "单模型多Agent沙箱隔离隐藏任务卡：3号逻辑王与5号抢话者形成对立阵营，轮番向4号（你）施压质询。",
        "auto_triggers": {
            "personal_statement": "各号位携带隐藏立场卡依次发言，迅速暴露分歧焦点。",
            "free_discussion": "5号抢话者与3号逻辑王高频交叉质询，7号和事佬点名4号表态破局。",
            "summary_report": "高压限时收敛，要求兼顾效率指标与落地可行性。",
        },
        "turn_order": [
            "ice_breaker",
            "interrupter",
            "logician",
            "user",
            "idea_king",
            "mediator",
            "digresser",
            "timekeeper",
        ],
    },
    {
        "id": "convergence_sprint",
        "name": "极限控时收敛脚本（防跑题急救）",
        "badge": "AUTO-SCRIPT · 极限收敛",
        "description": "6号跑题者与2号点子王连续发散议题，8号计时员高频倒计时预警，专练你在混乱中快速拉回主线与定稿。",
        "auto_triggers": {
            "personal_statement": "发散型角色优先抛出多维分支，制造信息过载。",
            "free_discussion": "6号连续跑题触发控场警报，8号催促4号给出取舍标准。",
            "summary_report": "3分钟倒计时极限提炼核心三要素。",
        },
        "turn_order": [
            "idea_king",
            "digresser",
            "ice_breaker",
            "user",
            "timekeeper",
            "logician",
            "interrupter",
            "mediator",
        ],
    },
    {
        "id": "memory_adaptive",
        "name": "记忆模式弱项强化脚本（自适应追击）",
        "badge": "MEMORY · 弱项追击",
        "description": "自动读取上一次训练保存的设定与薄弱项（如发言占比低、少承接他人、缺推进话术），在讨论中定向点名触发。",
        "auto_triggers": {
            "personal_statement": "结合上次记忆的角色偏好自动排布顺位，预埋针对性切入点。",
            "free_discussion": "根据上次薄弱维度自动触发AI点名互动（催促抢麦、要求承接或请求推进）。",
            "summary_report": "对照上次评分薄弱项重点考核总结完整度。",
        },
        "turn_order": [
            "ice_breaker",
            "logician",
            "mediator",
            "user",
            "interrupter",
            "idea_king",
            "digresser",
            "timekeeper",
        ],
    },
]


def get_fast_training_script(script_id: str | None) -> dict[str, Any]:
    for script in FAST_TRAINING_SCRIPTS:
        if script["id"] == script_id:
            return script
    return FAST_TRAINING_SCRIPTS[0]


def build_isolated_sandbox_context(
    agent_id: str,
    *,
    topic: str,
    material: str | None,
    phase: str,
    transcript: list[dict[str, Any]],
    script_id: str = "standard_flow",
    memory_state: dict[str, Any] | None = None,
    context_limit_override: int | None = None,
) -> dict[str, Any]:
    """Build an isolated sandbox view for a single agent.

    Guarantees:
    - The agent ONLY sees its own persona prompt & hidden agenda (never other agents' prompts).
    - The public transcript is truncated to `context_limit` recent non-system utterances.
    - Fast-training script auto-triggers and memory-mode hints are injected cleanly.
    """
    profile = AGENT_SANDBOX_PROFILES.get(agent_id) or AGENT_SANDBOX_PROFILES["ice_breaker"]
    script = get_fast_training_script(script_id)
    window_size = context_limit_override or profile.get("context_limit") or settings.LGD_CONTEXT_WINDOW_LIMIT
    window_size = max(2, min(10, int(window_size)))

    public_utterances = [
        item
        for item in (transcript or [])
        if item.get("role") != "system" and (item.get("text") or item.get("content"))
    ]
    visible_window = public_utterances[-window_size:]

    last_user_msg = None
    for item in reversed(public_utterances):
        if item.get("isUser") or item.get("role") == "user" or item.get("senderId") == "user":
            last_user_msg = (item.get("text") or item.get("content") or "").strip()
            break

    weakness_focus = None
    if memory_state and memory_state.get("memory_enabled", True):
        weak_dims = memory_state.get("weak_dimensions") or []
        if weak_dims:
            weakness_focus = weak_dims[0]

    script_trigger = (script.get("auto_triggers") or {}).get(phase) or "保持角色特征推进讨论"

    system_prompt = (
        f"{profile['persona_prompt']}\n"
        f"【沙箱隔离指令】你只能根据下方提供的最近 {len(visible_window)} 条公开讨论记录发言，"
        f"严禁跳出候选人身份或提及你是AI模型。\n"
        f"【狼人杀式隐藏任务卡】{profile['hidden_agenda']}\n"
        f"【当前快训练脚本触发器（{script['name']}）】{script_trigger}\n"
        f"【当前议题】{topic}\n"
    )
    if material:
        system_prompt += f"【议题背景摘要】{material[:260]}\n"
    if weakness_focus:
        system_prompt += (
            f"【记忆模式辅助训练目标】4号候选人上次训练薄弱项为「{weakness_focus}」，"
            f"请在发言末尾自然地抛给4号一个可接话或推进的钩子。\n"
        )

    return {
        "sandbox_id": f"sbx-{profile['seat']}号-{agent_id}",
        "seat_number": profile["seat"],
        "agent_id": agent_id,
        "agent_name": profile["name"],
        "agent_role": profile["role"],
        "context_limit": window_size,
        "visible_context_count": len(visible_window),
        "visible_window": visible_window,
        "last_user_message": last_user_msg,
        "script_id": script["id"],
        "script_badge": script["badge"],
        "script_trigger_fired": script_trigger,
        "weakness_focus": weakness_focus,
        "isolated_system_prompt": system_prompt,
    }


def _synthesize_sandbox_script_line(
    sandbox: dict[str, Any],
    *,
    phase: str,
    topic: str,
    turn_index: int = 0,
) -> str:
    """Context-aware fast-training script generator when external LLM key is not set."""
    agent_id = sandbox["agent_id"]
    last_user = sandbox.get("last_user_message")
    script_id = sandbox.get("script_id") or "standard_flow"
    weakness = sandbox.get("weakness_focus")
    short_topic = (topic or "团队协作方案")[:18]

    user_ref = ""
    if last_user:
        snippet = last_user[:22].replace("\n", " ")
        user_ref = f"刚才4号提到「{snippet}{'…' if len(last_user) > 22 else ''}」，"

    memory_tail = ""
    if weakness == "talk_share":
        memory_tail = "4号同学，这一块你怎么看？想听听你的补充。"
    elif weakness == "built_on_others":
        memory_tail = "看看4号能不能把我们刚说的两点串联一下？"
    elif weakness == "progress":
        memory_tail = "4号要不要帮大家定个优先级推进到下一步？"

    if phase == "personal_statement":
        lines_by_agent = {
            "ice_breaker": (
                f"【1号·破冰定框】围绕「{short_topic}」，我建议先用「现状痛点、核心举措、落地指标」三层框架来拆，"
                f"每位按序发言时锚定一层，避免后面自由讨论发散。"
            ),
            "idea_king": (
                f"【2号·创新切入】我赞同先立框架。针对「{short_topic}」，我们可以引入「异步优先+数字化看板」机制，"
                f"用最小试验成本先跑通核心闭环。"
            ),
            "logician": (
                f"【3号·量化逻辑】从因果链来看，「{short_topic}」的核心瓶颈在信息时延与权责不清。"
                f"我建议任何方案都必须绑定可量化指标，接下来请4号说说你的破题思路。"
            ),
            "interrupter": (
                f"【5号·高压交锋】{user_ref}但我认为光靠温和流程改造不够！如果不设硬性交付基线与淘汰红线，"
                f"所谓协同方案最后都会流于形式。"
            ),
            "digresser": (
                f"【6号·发散类比】聊到「{short_topic}」，我想到极地科考站用『每日三行极简日志』维持高压协作——"
                f"虽然场景不同，但极简同步模板或许能嫁接进来。"
            ),
            "mediator": (
                f"【7号·折中桥接】{user_ref}前面3号强调量化指标、5号强调刚性约束，其实并不冲突。"
                f"我们可以按「短期低成本止血 + 中期机制固化」分两步走。{memory_tail}"
            ),
            "timekeeper": (
                f"【8号·控时预警】个人陈述已接近尾声。进入自由讨论后建议前5分钟收敛出3个核心方案，"
                f"后5分钟敲定优先级与汇报人。"
            ),
        }
        return lines_by_agent.get(agent_id, lines_by_agent["ice_breaker"])

    if phase == "summary_report":
        return (
            f"【{sandbox['seat_number']}号·总结陈词】代表本组汇报「{short_topic}」结论："
            f"第一，确立分阶段落地框架；第二，优先上线低成本同步机制与量化看板；"
            f"第三，针对刚性考核边界保留弹性试点。{user_ref}以上汇报完毕。"
        )

    # free_discussion phase — rich variations driven by script_id & turn_index
    clash_prefix = "【狼人杀高压追问】" if script_id == "werewolf_clash" else ""
    sprint_prefix = "【极限收敛预警】" if script_id == "convergence_sprint" else ""
    prefix = clash_prefix or sprint_prefix

    free_templates: dict[str, list[str]] = {
        "ice_breaker": [
            f"{prefix}{user_ref}回到「{short_topic}」主线，我建议把大家的提议收敛为『流程标准化』与『工具自动化』两条腿走路。{memory_tail}",
            f"{prefix}为了推进进度，我先把目前无争议的『每日异步同步机制』写进一阶段结论，大家没意见吧？",
        ],
        "idea_king": [
            f"{prefix}{user_ref}我再补一个抓手：设立每周一天的『深度专注无会日』，配合自动摘要工具，立刻能降本增效。{memory_tail}",
            f"{prefix}如果加上双周复盘红黑榜的正向激励，团队对「{short_topic}」的执行意愿会高很多。",
        ],
        "logician": [
            f"{prefix}{user_ref}我们按投入产出比（ROI）排个序：第一优先级是零成本规范，第二是工具改造，第三是组织考核。{memory_tail}",
            f"{prefix}注意逻辑闭环：刚才提的方案还需要补上『验收指标（如响应时长下降30%）』，否则考官追问会失分。",
        ],
        "interrupter": [
            f"{prefix}打断一下！{user_ref or '刚才的方案太理想化了，'}如果没有明确的责任人（Owner）和延期惩罚，根本推不动！4号你怎么接这个硬骨头？",
            f"{prefix}先听我说完：减少会议不等于放任自流，核心决策节点必须强制同步对齐，不能一刀切！",
        ],
        "digresser": [
            f"{prefix}顺着刚才说的，我突然想到游戏化公会里的积分兑换机制……呃不过好像有点跑远了，还是拉回「{short_topic}」的核心指标吧。",
            f"{prefix}之前看到某跨国团队用VR虚拟工位破冰，虽然成本高了点，但说明情感连接也很重要——当然我们先定主方案。",
        ],
        "mediator": [
            f"{prefix}{user_ref}5号担心的执行力问题和2号的创新点可以融合：先小范围试点2周，用数据说话。{memory_tail or '4号觉得这个折中方案可行吗？'}",
            f"{prefix}大家核心目标一致，我们把『刚性指标』作为底线，把『柔性工具』作为赋能手段，这样汇报更有层次。",
        ],
        "timekeeper": [
            f"{prefix}【报时提醒】自由讨论时间已过半！请大家停止发散，接下来2分钟内必须敲定最终的1-2-3条结论与汇报人。{memory_tail}",
            f"{prefix}【倒计时预警】距离总结汇报仅剩最后窗口，请4号或3号快速确认汇报提纲！",
        ],
    }
    pool = free_templates.get(agent_id) or free_templates["ice_breaker"]
    return pool[turn_index % len(pool)]


def _call_openai_compatible_sync(
    *,
    api_key: str,
    base_url: str,
    model: str,
    system_prompt: str,
    visible_window: list[dict[str, Any]],
    phase: str,
) -> str:
    """Call an OpenAI-compatible chat completion API exclusively for LGD roleplay."""
    url = base_url.rstrip("/") + "/chat/completions"
    history_lines = []
    for item in visible_window:
        speaker = item.get("speaker") or item.get("senderName") or "候选人"
        text = item.get("text") or item.get("content") or ""
        history_lines.append(f"- {speaker}: {text}")
    history_block = "\n".join(history_lines) if history_lines else "（当前你是本阶段第一位发言人）"

    user_prompt = (
        f"当前群面阶段：{phase}\n"
        f"沙箱可见的最近公开讨论记录：\n{history_block}\n\n"
        f"请以你的候选人身份直接输出你在本轮的一段发言（60-95字，不要加引号或角色前缀）："
    )
    body = json.dumps(
        {
            "model": model,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            "temperature": 0.75,
            "max_tokens": 180,
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
    with urllib.request.urlopen(req, timeout=8.0) as resp:
        data = json.loads(resp.read().decode("utf-8"))
        content = (
            data.get("choices", [{}])[0]
            .get("message", {})
            .get("content", "")
            .strip()
        )
        if not content:
            raise ValueError("Empty LLM response")
        return content


async def generate_lgd_agent_turn(
    *,
    agent_id: str,
    topic: str,
    material: str | None = None,
    phase: str = "free_discussion",
    transcript: list[dict[str, Any]] | None = None,
    script_id: str = "standard_flow",
    memory_state: dict[str, Any] | None = None,
    turn_index: int = 0,
    api_key_override: str | None = None,
    base_url_override: str | None = None,
    model_override: str | None = None,
) -> dict[str, Any]:
    """Execute one isolated multi-agent turn in LGD.

    Uses external LLM API if configured (exclusively for LGD), or falls back seamlessly
    to the context-aware sandbox fast-training script engine.
    """
    sandbox = build_isolated_sandbox_context(
        agent_id,
        topic=topic,
        material=material,
        phase=phase,
        transcript=transcript or [],
        script_id=script_id,
        memory_state=memory_state,
    )

    api_key = (api_key_override or settings.LGD_LLM_API_KEY or "").strip()
    base_url = (base_url_override or settings.LGD_LLM_BASE_URL or "https://api.openai.com/v1").strip()
    model = (model_override or settings.LGD_LLM_MODEL or "gpt-4o-mini").strip()

    engine_source = "sandbox_fast_script"
    content = ""

    if api_key:
        try:
            content = await asyncio.to_thread(
                _call_openai_compatible_sync,
                api_key=api_key,
                base_url=base_url,
                model=model,
                system_prompt=sandbox["isolated_system_prompt"],
                visible_window=sandbox["visible_window"],
                phase=phase,
            )
            engine_source = "llm_multi_agent_sandbox"
        except (urllib.error.URLError, TimeoutError, ValueError, KeyError, Exception):
            content = ""

    if not content:
        content = _synthesize_sandbox_script_line(
            sandbox,
            phase=phase,
            topic=topic,
            turn_index=turn_index,
        )

    return {
        "agent_id": sandbox["agent_id"],
        "agent_name": sandbox["agent_name"],
        "agent_role": sandbox["agent_role"],
        "seat_number": sandbox["seat_number"],
        "sandbox_id": sandbox["sandbox_id"],
        "context_limit": sandbox["context_limit"],
        "visible_context_count": sandbox["visible_context_count"],
        "script_id": sandbox["script_id"],
        "script_badge": sandbox["script_badge"],
        "script_trigger_fired": sandbox["script_trigger_fired"],
        "weakness_focus": sandbox["weakness_focus"],
        "engine_source": engine_source,
        "content": content,
    }
