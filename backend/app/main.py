from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.v1 import api_router
from app.config import settings
from app.core.migration import migrate_redis_to_mongo
from app.core.mongo_client import close_mongo, init_mongo
from app.core.rate_limiter import RateLimitMiddleware
from app.core.redis_client import close_redis, init_redis
from app.services.seed_service import seed_all

logger = logging.getLogger("edgewise")


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings.require_secure_jwt()
    if settings.uses_jwt_placeholder:
        logger.warning(
            "JWT_SECRET is empty or uses a public placeholder. Set a strong secret in backend/.env before deploying."
        )
    mongo = await init_mongo()
    if mongo.degraded:
        logger.error(
            "STARTUP ALERT: MongoDB running in DEGRADED local fallback mode (reason=%s). "
            "Check MONGODB_URI and driver installation!",
            mongo.fallback_reason,
        )
    redis = await init_redis()
    app.state.mongo = mongo
    app.state.redis = redis
    await migrate_redis_to_mongo(redis, mongo)
    await seed_all(redis)
    yield
    await close_redis()
    await close_mongo()


app = FastAPI(
    title=settings.APP_NAME,
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(RateLimitMiddleware)
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
