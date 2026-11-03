from fastapi import APIRouter

from app.api.v1.assessment import router as assessment_router
from app.api.v1.auth import router as auth_router
from app.api.v1.case import router as case_router
from app.api.v1.coding import router as coding_router
from app.api.v1.copilot import router as copilot_router
from app.api.v1.dashboard import router as dashboard_router
from app.api.v1.experiences import router as experiences_router
from app.api.v1.interview import router as interview_router
from app.api.v1.jobs import router as jobs_router
from app.api.v1.lgd import router as lgd_router
from app.api.v1.org import router as org_router
from app.api.v1.questions import router as questions_router
from app.api.v1.research import router as research_router
from app.research.admin_stats.router import router as research_admin_router
from app.api.v1.resume import router as resume_router
from app.api.v1.schedule import router as schedule_router
from app.api.v1.series import router as series_router
from app.api.v1.share import router as share_router
from app.api.v1.stories import router as stories_router
from app.api.v1.tasks import router as tasks_router

api_router = APIRouter()
api_router.include_router(assessment_router)
api_router.include_router(auth_router)
api_router.include_router(case_router)
api_router.include_router(coding_router)
api_router.include_router(copilot_router)
api_router.include_router(dashboard_router)
api_router.include_router(experiences_router)
api_router.include_router(resume_router)
api_router.include_router(jobs_router)
api_router.include_router(lgd_router)
api_router.include_router(org_router)
api_router.include_router(interview_router)
api_router.include_router(questions_router)
api_router.include_router(research_router)
api_router.include_router(research_admin_router)
api_router.include_router(schedule_router)
api_router.include_router(series_router)
api_router.include_router(share_router)
api_router.include_router(stories_router)
api_router.include_router(tasks_router)
