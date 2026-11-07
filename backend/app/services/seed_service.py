from __future__ import annotations

from datetime import datetime, timedelta, timezone
from uuid import uuid4

from redis.asyncio import Redis

from app.api.v1.questions import build_question_record
from app.config import settings
from app.core.redis_client import get_json, set_json
from app.core.security import hash_password
from app.data.coding_seed import SEED_CODING_QUESTIONS
from app.data.dataset_import_seed import SEED_DATASET_QUESTIONS
from app.data.pdf_import_seed import SEED_PDF_IMPORT_QUESTIONS
from app.data.structured_seed import SEED_STRUCTURED_QUESTIONS
from app.services.referral_service import ensure_user_invite_code
from app.services.lgd_topics import build_phases
from app.services.research_service import RESEARCH_CONSENT_VERSION, assign_experiment_arm

DEMO_EMAIL = "demo@edgewise.ai"
DEMO_PASSWORD = "Demo1234!"
DEMO_NAME = "演示用户"

SEED_GENERAL_QUESTIONS = [
    {
        "id": "G001",
        "lang": "zh-CN",
        "title": "请做一个 1–2 分钟的自我介绍",
        "category": "通用题",
        "difficulty": "简单",
        "type": "general",
        "assessment_points": "考察表达清晰度、身份定位与岗位关联。",
        "answer_structure": "当前身份 → 核心经历亮点 → 与目标岗位的匹配 → 期待。",
        "follow_ups": ["其中哪些部分是你独立完成的？", "如果只有 30 秒你会保留哪两句？"],
    },
    {
        "id": "G002",
        "lang": "zh-CN",
        "title": "讲一段你最有代表性的过往经历",
        "category": "通用题",
        "difficulty": "中等",
        "type": "general",
        "assessment_points": "考察 STAR 结构、个人贡献与结果量化。",
        "answer_structure": "情境 → 任务 → 行动 → 结果（含指标）。",
        "follow_ups": ["你具体负责哪一块？", "如果重来你会改什么？"],
    },
    {
        "id": "G003",
        "lang": "zh-CN",
        "title": "你为什么想申请这个岗位",
        "category": "通用题",
        "difficulty": "简单",
        "type": "general",
        "assessment_points": "考察动机真实性、岗位理解与长期规划。",
        "answer_structure": "岗位吸引点 → 能力匹配 → 可验证经历 → 未来贡献。",
        "follow_ups": ["你还考虑了哪些方向？", "入职后 90 天想达成什么？"],
    },
    {
        "id": "G004",
        "lang": "zh-CN",
        "title": "说一次你失败或做得不好的经历，以及后来怎么改进的",
        "category": "通用题",
        "difficulty": "中等",
        "type": "general",
        "assessment_points": "考察反思能力、诚实度与改进行动。",
        "answer_structure": "失败情境 → 原因分析 → 改进措施 → 后续验证。",
        "follow_ups": ["现在回头看关键转折点是什么？", "团队从中学到了什么？"],
    },
    {
        "id": "G005",
        "lang": "zh-CN",
        "title": "你和团队成员意见不一致时，怎么处理",
        "category": "通用题",
        "difficulty": "中等",
        "type": "general",
        "assessment_points": "考察协作、沟通与冲突解决。",
        "answer_structure": "分歧点 → 你的立场与依据 → 协商过程 → 结果与复盘。",
        "follow_ups": ["如果对方是上级你会怎么做？", "有没有未达成共识的例子？"],
    },
    {
        "id": "G006",
        "lang": "zh-CN",
        "title": "你未来 3 年的职业规划是什么",
        "category": "通用题",
        "difficulty": "简单",
        "type": "general",
        "assessment_points": "考察目标感、成长路径与稳定性。",
        "answer_structure": "短期目标 → 能力补齐计划 → 中期里程碑 → 与公司的契合。",
        "follow_ups": ["若业务方向变化你会如何调整？", "最希望提升哪一项硬技能？"],
    },
]

SEED_ENGLISH_GENERAL_QUESTIONS = [
    {
        "id": "EG001",
        "lang": "en-US",
        "title": "Tell me about yourself.",
        "category": "General",
        "difficulty": "简单",
        "type": "general",
        "assessment_points": "Clarity, relevance to the role, and concise structure.",
        "answer_structure": "Current role → key highlights → fit for this position → what you want next.",
        "follow_ups": ["Which part would you keep if you only had 30 seconds?", "What would you do differently in your current role?"],
    },
    {
        "id": "EG002",
        "lang": "en-US",
        "title": "Walk me through your most representative past experience.",
        "category": "General",
        "difficulty": "中等",
        "type": "general",
        "assessment_points": "STAR structure, personal contribution, and measurable outcomes.",
        "answer_structure": "Situation → Task → Action → Result (with metrics).",
        "follow_ups": ["What was your specific ownership?", "What would you change if you did it again?"],
    },
    {
        "id": "EG003",
        "lang": "en-US",
        "title": "Why do you want to join this company and this role?",
        "category": "General",
        "difficulty": "简单",
        "type": "general",
        "assessment_points": "Motivation, company understanding, and role fit.",
        "answer_structure": "What attracts you → skills match → evidence from past work → future contribution.",
        "follow_ups": ["What other options are you considering?", "What would success look like in your first 90 days?"],
    },
    {
        "id": "EG004",
        "lang": "en-US",
        "title": "Tell me about a time you failed or underperformed, and how you improved.",
        "category": "General",
        "difficulty": "中等",
        "type": "general",
        "assessment_points": "Honesty, reflection, and concrete improvement actions.",
        "answer_structure": "Context → what went wrong → root cause → fixes → verified outcome.",
        "follow_ups": ["What was the turning point in hindsight?", "What did the team learn?"],
    },
    {
        "id": "EG005",
        "lang": "en-US",
        "title": "Describe a time you disagreed with a teammate. How did you handle it?",
        "category": "General",
        "difficulty": "中等",
        "type": "general",
        "assessment_points": "Collaboration, communication, and conflict resolution.",
        "answer_structure": "Disagreement → your view and data → how you aligned → result and retrospective.",
        "follow_ups": ["What if the other person was your manager?", "Any case where you did not reach agreement?"],
    },
    {
        "id": "EG006",
        "lang": "en-US",
        "title": "Where do you see yourself in three years?",
        "category": "General",
        "difficulty": "简单",
        "type": "general",
        "assessment_points": "Goal orientation, growth plan, and stability.",
        "answer_structure": "Near-term goals → skills to build → milestones → alignment with the company.",
        "follow_ups": ["How would you adjust if the business direction changed?", "Which hard skill do you want to deepen most?"],
    },
]

SEED_QUESTIONS = [
    {"id": "Q001", "title": "请介绍一个你最成功的项目经验", "category": "行为题", "difficulty": "简单"},
    {"id": "Q002", "title": "如果你发现同事的工作失误，你会怎么做？", "category": "行为题", "difficulty": "中等"},
    {"id": "Q003", "title": "估算一下北京市一天消耗多少个鸡蛋", "category": "案例分析", "difficulty": "困难"},
    {"id": "Q004", "title": "介绍一下 React 19 的新特性", "category": "专业知识", "difficulty": "中等"},
    {"id": "Q005", "title": "如果你的领导坚持一个错误的决定", "category": "压力题", "difficulty": "困难"},
    {"id": "Q006", "title": "为什么井盖是圆的？", "category": "逻辑题", "difficulty": "简单"},
]

DEFAULT_AGENTS = ["破冰者", "点子王", "逻辑王", "抢话者", "跑题者", "和事佬", "计时员"]

SEED_ROOMS = [
    {
        "topic": "远程团队协作效率提升方案",
        "material": "请讨论如何系统性地提升远程团队的协作效率，并给出可落地的解决方案。",
        "duration_minutes": 45,
        "agents": DEFAULT_AGENTS,
    },
    {
        "topic": "新消费品牌的市场切入策略",
        "material": "请讨论新消费品牌如何选择市场切入点并建立差异化优势。",
        "duration_minutes": 40,
        "agents": ["破冰者", "点子王", "杠精", "逻辑王", "计时员"],
    },
    {
        "topic": "校园社交产品的差异化竞争",
        "material": "请讨论校园社交产品如何在同质化竞争中找到差异化定位。",
        "duration_minutes": 50,
        "agents": ["破冰者", "点子王", "杠精", "和事佬", "观察者", "计时员"],
    },
]


async def seed_questions_if_needed(redis: Redis) -> None:
    existing_questions: list[dict] = []
    if not await redis.scard("questions:all"):
        for question in SEED_QUESTIONS:
            record = build_question_record(question, existing_questions=existing_questions)
            await set_json(redis, f"question:{record['id']}", record)
            await redis.sadd("questions:all", record["id"])
            existing_questions.append(record)
    else:
        question_ids = await redis.smembers("questions:all")
        for qid in question_ids:
            q = await get_json(redis, f"question:{qid}")
            if q:
                existing_questions.append(q)

    for question in SEED_GENERAL_QUESTIONS:
        if await redis.sismember("questions:all", question["id"]):
            continue
        record = build_question_record(question, existing_questions=existing_questions)
        await set_json(redis, f"question:{record['id']}", record)
        await redis.sadd("questions:all", record["id"])
        existing_questions.append(record)

    for question in SEED_ENGLISH_GENERAL_QUESTIONS:
        if await redis.sismember("questions:all", question["id"]):
            continue
        record = build_question_record(question, existing_questions=existing_questions)
        await set_json(redis, f"question:{record['id']}", record)
        await redis.sadd("questions:all", record["id"])
        existing_questions.append(record)

    for question in SEED_STRUCTURED_QUESTIONS:
        if await redis.sismember("questions:all", question["id"]):
            continue
        record = build_question_record(question, existing_questions=existing_questions)
        await set_json(redis, f"question:{record['id']}", record)
        await redis.sadd("questions:all", record["id"])
        existing_questions.append(record)

    for question in SEED_CODING_QUESTIONS:
        if await redis.sismember("questions:all", question["id"]):
            continue
        record = build_question_record(question, existing_questions=existing_questions)
        await set_json(redis, f"question:{record['id']}", record)
        await redis.sadd("questions:all", record["id"])
        existing_questions.append(record)

    for question in SEED_PDF_IMPORT_QUESTIONS:
        if await redis.sismember("questions:all", question["id"]):
            continue
        record = build_question_record(question, existing_questions=existing_questions)
        await set_json(redis, f"question:{record['id']}", record)
        await redis.sadd("questions:all", record["id"])
        existing_questions.append(record)

    for question in SEED_DATASET_QUESTIONS:
        if await redis.sismember("questions:all", question["id"]):
            continue
        record = build_question_record(question, existing_questions=existing_questions)
        await set_json(redis, f"question:{record['id']}", record)
        await redis.sadd("questions:all", record["id"])
        existing_questions.append(record)


async def seed_demo_user_if_needed(redis: Redis) -> dict | None:
    existing_id = await redis.get(f"user:email:{DEMO_EMAIL}")
    if existing_id:
        user = await get_json(redis, f"user:{existing_id}")
        if user and not user.get("research_consent"):
            user["research_consent"] = {
                "accepted": True,
                "accepted_at": user.get("created_at") or datetime.now(timezone.utc).isoformat(),
                "version": RESEARCH_CONSENT_VERSION,
            }
            await set_json(redis, f"user:{existing_id}", user)
        if user:
            await ensure_user_invite_code(redis, user)
            if user.get("research_consent", {}).get("accepted") and not user.get("experiment_assignment"):
                await assign_experiment_arm(redis, user, source="seed")
                user = await get_json(redis, f"user:{existing_id}")
        return user

    if not settings.is_development:
        return None

    now = datetime.now(timezone.utc).isoformat()
    user_id = uuid4().hex
    user_record = {
        "id": user_id,
        "email": DEMO_EMAIL,
        "name": DEMO_NAME,
        "initials": "演示",
        "tier": "Pro",
        "tier_label": "黄金专业版",
        "credits": 1280,
        "join_date": now[:10],
        "is_admin": False,
        "created_at": now,
        "updated_at": now,
        "password_hash": hash_password(DEMO_PASSWORD),
        "research_consent": {
            "accepted": True,
            "accepted_at": now,
            "version": RESEARCH_CONSENT_VERSION,
        },
    }
    await set_json(redis, f"user:{user_id}", user_record)
    await redis.set(f"user:email:{DEMO_EMAIL}", user_id)
    await redis.sadd("users:all", user_id)
    await ensure_user_invite_code(redis, user_record)
    await assign_experiment_arm(redis, user_record, source="seed")
    return await get_json(redis, f"user:{user_id}")


async def seed_lgd_rooms_if_needed(redis: Redis, host_user: dict) -> None:
    if await redis.scard("lgd_rooms:all"):
        return

    now = datetime.now(timezone.utc).isoformat()
    for room in SEED_ROOMS:
        room_id = uuid4().hex
        record = {
            "id": room_id,
            "host_user_id": host_user["id"],
            "topic": room["topic"],
            "material": room["material"],
            "status": "waiting",
            "phase": "lobby",
            "participant_count": 1,
            "max_participants": 8,
            "duration_minutes": room["duration_minutes"],
            "remaining_seconds": room["duration_minutes"] * 60,
            "agents": room["agents"],
            "phases": build_phases(room["duration_minutes"]),
            "user_role": "member",
            "topic_type": "open",
            "participants": [
                {
                    "user_id": host_user["id"],
                    "name": host_user["name"],
                    "role": "host",
                }
            ],
            "created_at": now,
            "updated_at": now,
        }
        await set_json(redis, f"lgd_room:{room_id}", record)
        await redis.sadd("lgd_rooms:all", room_id)


async def seed_demo_sessions_if_needed(redis: Redis, user: dict) -> None:
    session_key = f"user:{user['id']}:sessions"
    if await redis.zcard(session_key):
        return

    now = datetime.now(timezone.utc)
    samples = [
        {
            "type": "lgd",
            "topic": "远程团队协作效率提升方案",
            "score": 86.0,
            "duration_minutes": 42,
            "days_ago": 1,
            "dimensions": {
                "expression": 88,
                "logic": 85,
                "leadership": 82,
                "teamwork": 90,
                "adaptability": 84,
            },
        },
        {
            "type": "interview",
            "topic": "1v1 模拟面试 · 产品经理",
            "position": "产品经理",
            "difficulty": "medium",
            "score": 81.0,
            "duration_minutes": 30,
            "days_ago": 3,
            "dimensions": {
                "expression": 84,
                "logic": 80,
                "leadership": 75,
                "teamwork": 78,
                "adaptability": 82,
            },
        },
    ]

    for sample in samples:
        created = now - timedelta(days=sample["days_ago"])
        session_id = uuid4().hex
        created_iso = created.isoformat()
        record = {
            "id": session_id,
            "user_id": user["id"],
            "type": sample["type"],
            "position": sample.get("position"),
            "difficulty": sample.get("difficulty"),
            "topic": sample["topic"],
            "question_id": None,
            "status": "completed",
            "score": sample["score"],
            "duration_minutes": sample["duration_minutes"],
            "date": created.date().isoformat(),
            "time": created.strftime("%H:%M"),
            "created_at": created_iso,
            "updated_at": created_iso,
            "completed_at": created_iso,
            "metadata": {"dimensions": sample["dimensions"]},
        }
        await set_json(redis, f"session:{session_id}", record)
        await redis.zadd(session_key, {session_id: created.timestamp()})


async def seed_all(redis: Redis) -> None:
    from app.services.series_service import seed_creator_series_if_needed

    await seed_questions_if_needed(redis)
    await seed_creator_series_if_needed(redis)
    demo_user = await seed_demo_user_if_needed(redis)
    if demo_user:
        await seed_lgd_rooms_if_needed(redis, demo_user)
        await seed_demo_sessions_if_needed(redis, demo_user)
