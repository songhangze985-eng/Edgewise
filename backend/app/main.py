from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from redis.asyncio import Redis

from app.api.v1 import api_router
from app.api.v1.questions import build_question_record
from app.config import settings
from app.core.redis_client import close_redis, init_redis, set_json

seed_questions = [
    {"id": "Q001", "title": "请介绍一个你最成功的项目经验", "category": "行为题", "difficulty": "简单"},
    {"id": "Q002", "title": "如果你发现同事的工作失误，你会怎么做？", "category": "行为题", "difficulty": "中等"},
    {"id": "Q003", "title": "估算一下北京市一天消耗多少个鸡蛋", "category": "案例分析", "difficulty": "困难"},
    {"id": "Q004", "title": "介绍一下 React 19 的新特性", "category": "专业知识", "difficulty": "中等"},
    {"id": "Q005", "title": "如果你的领导坚持一个错误的决定", "category": "压力题", "difficulty": "困难"},
    {"id": "Q006", "title": "为什么井盖是圆的？", "category": "逻辑题", "difficulty": "简单"},
]


async def seed_questions_if_needed(redis: Redis) -> None:
    if await redis.scard("questions:all"):
        return

    existing_questions: list[dict] = []
    for question in seed_questions:
        record = build_question_record(question, existing_questions=existing_questions)
        await set_json(redis, f"question:{record['id']}", record)
        await redis.sadd("questions:all", record["id"])
        existing_questions.append(record)


@asynccontextmanager
async def lifespan(app: FastAPI):
    redis = await init_redis()
    app.state.redis = redis
    await seed_questions_if_needed(redis)
    yield
    await close_redis()


app = FastAPI(
    title=settings.APP_NAME,
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router, prefix="/api/v1")


@app.get("/")
async def root() -> dict[str, str]:
    return {"app": "Edgewise API", "version": "1.0.0"}
