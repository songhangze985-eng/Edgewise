from fastapi import APIRouter

from app.api.v1.auth import router as auth_router
from app.api.v1.dashboard import router as dashboard_router
from app.api.v1.interview import router as interview_router
from app.api.v1.lgd import router as lgd_router
from app.api.v1.questions import router as questions_router
from app.api.v1.resume import router as resume_router

api_router = APIRouter()
api_router.include_router(auth_router)
api_router.include_router(dashboard_router)
api_router.include_router(resume_router)
api_router.include_router(lgd_router)
api_router.include_router(interview_router)
api_router.include_router(questions_router)
