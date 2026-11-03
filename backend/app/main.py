from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.v1 import api_router
from app.config import INSECURE_JWT_SECRET, settings
from app.core.redis_client import close_redis, init_redis
from app.services.seed_service import seed_all

logger = logging.getLogger("edgewise")


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings.require_secure_jwt()
    if (settings.JWT_SECRET or "").strip() == INSECURE_JWT_SECRET:
        logger.warning(
            "JWT_SECRET is still the insecure default. Set a strong secret in backend/.env before deploying."
        )
    redis = await init_redis()
    app.state.redis = redis
    await seed_all(redis)
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
