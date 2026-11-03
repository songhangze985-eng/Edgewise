from __future__ import annotations

from datetime import datetime, timezone
from uuid import uuid4

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status
from redis.asyncio import Redis

from app.api.deps import get_current_admin, get_current_user, get_redis
from app.core.redis_client import get_json, set_json
from app.models.schemas import (
    QuestionCreate,
    QuestionRelatedItem,
    QuestionResponse,
    QuestionStar,
    QuestionUploadItem,
    QuestionUploadResponse,
    UserInDB,
)
from app.services.document_parse import UPLOAD_TEXT_MAX_CHARS, extract_text_from_upload
from app.services.question_text_parse import parse_questions_from_text

MAX_UPLOAD_BYTES = 10 * 1024 * 1024

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

    qtype = payload.get("type") or "professional"
    record = {
        "id": question_id,
        "title": title,
        "category": category,
        "difficulty": difficulty,
        "type": qtype,
        "lang": payload.get("lang") or "zh-CN",
        "tags": payload.get("tags", []),
        "count": payload.get("count", 0),
        "collected": payload.get("collected", False),
        "history": payload.get("history", []),
        "related": payload.get("related") or related_items,
        "created_at": payload.get("created_at", now),
        "updated_at": now,
        "follow_ups": payload.get("follow_ups") or [],
        "keywords": payload.get("keywords") or [],
        "source_project": payload.get("source_project"),
        "user_id": payload.get("user_id"),
    }
    if qtype in ("general", "resume_specific", "structured"):
        record["assessment_points"] = payload.get("assessment_points") or "考察表达结构、经历深度与岗位匹配度。"
        record["answer_structure"] = payload.get("answer_structure") or "开场定位 → 核心经历 → 与岗位的连接 → 简短总结。"
        record["ideal"] = None
        record["star"] = None
        if qtype == "structured":
            record["structured_category"] = payload.get("structured_category") or "analysis"
            record["source_label"] = payload.get("source_label") or "谈锋自编练习题"
    elif qtype == "coding":
        record["ideal"] = None
        record["star"] = None
        record["problem_statement"] = payload.get("problem_statement") or title
        record["signature"] = payload.get("signature") or ""
        record["starter_code"] = payload.get("starter_code") or payload.get("signature") or ""
        record["coding_language"] = payload.get("coding_language") or "javascript"
        record["entry_point"] = payload.get("entry_point") or "solution"
        record["samples"] = payload.get("samples") or []
        record["hidden_tests"] = payload.get("hidden_tests") or []
        record["assessment_points"] = payload.get("assessment_points") or "考察算法实现、复杂度分析与边界处理。"
        record["answer_structure"] = payload.get("answer_structure") or "思路口述 → 编码 → 样例自测 → 复杂度与边界说明。"
    else:
        record["ideal"] = payload.get("ideal") or (
            f"回答《{title}》时，建议先给出结构化框架，再结合真实经历或案例量化结果。"
        )
        record["star"] = star
        record["assessment_points"] = payload.get("assessment_points")
        record["answer_structure"] = payload.get("answer_structure")
    return record


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
    type: str | None = Query(default=None, alias="type"),
    scope: str | None = Query(default=None),
    redis: Redis = Depends(get_redis),
    current_user: UserInDB = Depends(get_current_user),
) -> list[QuestionResponse]:
    questions = await _load_all_questions(redis)
    filtered: list[dict] = []
    for question in questions:
        qtype = question.get("type") or "professional"
        if qtype == "resume_specific":
            if scope == "mine":
                if question.get("user_id") != current_user.id:
                    continue
            else:
                continue
        if type is not None and qtype != type:
            continue
        if category is not None and question["category"] != category:
            continue
        if difficulty is not None and question["difficulty"] != difficulty:
            continue
        filtered.append(question)
    return [QuestionResponse.model_validate(question) for question in filtered]


@router.post("/upload", response_model=QuestionUploadResponse, status_code=status.HTTP_201_CREATED)
async def upload_questions_file(
    file: UploadFile = File(...),
    current_user: UserInDB = Depends(get_current_user),
    redis: Redis = Depends(get_redis),
) -> QuestionUploadResponse:
    file_bytes = await file.read()
    if not file_bytes:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Uploaded file is empty",
        )
    if len(file_bytes) > MAX_UPLOAD_BYTES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="文件不能超过 10MB",
        )

    file_name = file.filename or "questions.bin"
    content_type = file.content_type or "application/octet-stream"
    preview_text, _ = extract_text_from_upload(
        file_name,
        content_type,
        file_bytes,
        max_chars=UPLOAD_TEXT_MAX_CHARS,
    )
    if not preview_text or not preview_text.strip():
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="无法从该文件提取可读文本",
        )

    parsed_payloads = parse_questions_from_text(preview_text)
    if not parsed_payloads:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="未能从文本中识别题目，请使用编号列表、Q 开头行或空行分隔题目",
        )

    existing_questions = await _load_all_questions(redis)
    imported: list[QuestionUploadItem] = []

    for payload in parsed_payloads:
        question_id = uuid4().hex[:8].upper()
        while await redis.sismember("questions:all", question_id):
            question_id = uuid4().hex[:8].upper()

        question_record = build_question_record(
            {**payload, "id": question_id, "tags": payload.get("tags", ["用户上传"])},
            existing_questions=existing_questions,
        )
        await set_json(redis, f"question:{question_id}", question_record)
        await redis.sadd("questions:all", question_id)
        existing_questions.append(question_record)
        imported.append(QuestionUploadItem(id=question_id, title=question_record["title"]))

    upload_meta = {
        "id": uuid4().hex,
        "file_name": file_name,
        "content_type": content_type,
        "imported": len(imported),
        "uploaded_at": datetime.now(timezone.utc).isoformat(),
    }
    await redis.sadd(f"user:{current_user.id}:question_uploads", upload_meta["id"])
    await set_json(redis, f"user:{current_user.id}:question_upload:{upload_meta['id']}", upload_meta)

    return QuestionUploadResponse(
        imported=len(imported),
        questions=imported,
        preview_text_len=len(preview_text),
    )


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
