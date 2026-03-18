from __future__ import annotations

from datetime import datetime, timezone
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, Query, status
from redis.asyncio import Redis

from app.api.deps import get_current_admin, get_redis
from app.core.redis_client import get_json, set_json
from app.models.schemas import QuestionCreate, QuestionRelatedItem, QuestionResponse, QuestionStar

router = APIRouter(prefix="/questions", tags=["questions"])


def build_question_record(payload: dict, existing_questions: list[dict] | None = None) -> dict:
    now = datetime.now(timezone.utc).isoformat()
    question_id = payload.get("id") or uuid4().hex[:8].upper()
    category = payload["category"]
    title = payload["title"]
    difficulty = payload["difficulty"]

    if category == "行为题":
        star = payload.get("star") or {
            "s": "简述项目或场景背景，明确挑战和上下文。",
            "t": "说明你承担的职责、目标和衡量标准。",
            "a": "重点描述你的关键动作、决策与协作方式。",
            "r": "量化结果并补充你的复盘与迁移能力。",
        }
    else:
        star = payload.get("star") or {
            "s": "快速定义问题边界和已知条件。",
            "t": "说明你要解决的核心目标或判断标准。",
            "a": "分步骤展开分析、拆解框架和推理过程。",
            "r": "给出结论、风险和下一步验证思路。",
        }

    related_items: list[dict] = []
    for question in existing_questions or []:
        if question["id"] == question_id:
            continue
        if question["category"] == category or question["difficulty"] == difficulty:
            related_items.append({"id": question["id"], "title": question["title"]})
        if len(related_items) >= 3:
            break

    return {
        "id": question_id,
        "title": title,
        "category": category,
        "difficulty": difficulty,
        "ideal": payload.get("ideal")
        or f"回答《{title}》时，建议先给出结构化框架，再结合真实经历或案例量化结果。",
        "star": star,
        "tags": payload.get("tags", []),
        "count": payload.get("count", 0),
        "collected": payload.get("collected", False),
        "history": payload.get("history", []),
        "related": payload.get("related") or related_items,
        "created_at": payload.get("created_at", now),
        "updated_at": now,
    }


async def _load_all_questions(redis: Redis) -> list[dict]:
    question_ids = sorted(await redis.smembers("questions:all"))
    questions: list[dict] = []
    for question_id in question_ids:
        question = await get_json(redis, f"question:{question_id}")
        if question:
            questions.append(question)
    questions.sort(key=lambda item: item["id"])
    return questions


@router.get("", response_model=list[QuestionResponse])
async def list_questions(
    category: str | None = Query(default=None),
    difficulty: str | None = Query(default=None),
    redis: Redis = Depends(get_redis),
) -> list[QuestionResponse]:
    questions = await _load_all_questions(redis)
    filtered = [
        question
        for question in questions
        if (category is None or question["category"] == category)
        and (difficulty is None or question["difficulty"] == difficulty)
    ]
    return [QuestionResponse.model_validate(question) for question in filtered]


@router.get("/{question_id}", response_model=QuestionResponse)
async def get_question(
    question_id: str,
    redis: Redis = Depends(get_redis),
) -> QuestionResponse:
    question = await get_json(redis, f"question:{question_id}")
    if question is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Question not found",
        )
    if not question.get("related"):
        all_questions = await _load_all_questions(redis)
        question["related"] = [
            QuestionRelatedItem.model_validate(item).model_dump()
            for item in build_question_record(question, existing_questions=all_questions)["related"]
        ]
    if question.get("star"):
        question["star"] = QuestionStar.model_validate(question["star"]).model_dump()
    return QuestionResponse.model_validate(question)


@router.post("", response_model=QuestionResponse, status_code=status.HTTP_201_CREATED)
async def create_question(
    payload: QuestionCreate,
    redis: Redis = Depends(get_redis),
    _: object = Depends(get_current_admin),
) -> QuestionResponse:
    question_id = payload.id or uuid4().hex[:8].upper()
    if await redis.sismember("questions:all", question_id):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Question ID already exists",
        )

    existing_questions = await _load_all_questions(redis)
    question_record = build_question_record(
        {
            **payload.model_dump(exclude_none=True),
            "id": question_id,
        },
        existing_questions=existing_questions,
    )
    await set_json(redis, f"question:{question_id}", question_record)
    await redis.sadd("questions:all", question_id)
    return QuestionResponse.model_validate(question_record)
