from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from fastapi.responses import PlainTextResponse
from redis.asyncio import Redis

from app.api.deps import get_current_admin, get_current_user, get_redis
from app.core.redis_client import get_json
from app.models.schemas import (
    BlindReviewItem,
    BlindReviewScoreSubmit,
    MessageResponse,
    ReferralClaimUpdate,
    ReferralStatsRow,
    ResearchConsentUpdate,
    ResearchConsentView,
    ResearchEventsBatch,
    ResearchEventsBatchResponse,
    ResearchExperimentContext,
    ResearchInviteView,
    ResearchPosttestStatus,
    ResearchPosttestSubmit,
    ResearchSurveyAnswerBatch,
    ResearchSurveyPending,
    UserInDB,
)
from app.services.research_survey_service import (
    blind_review_pending,
    blind_review_submit,
    export_research_panel,
    export_research_panel_csv,
    ingest_events,
    pending_survey,
    run_daily_derive,
    submit_survey_answers,
)
from app.services.referral_service import bind_referral, build_referral_stats
from app.services.research_service import (
    accelerate_research_dates,
    export_research_csv,
    export_research_jsonl,
    get_experiment_context,
    get_posttest_status,
    get_research_invite,
    set_research_consent,
    submit_posttest_answer,
)

router = APIRouter(prefix="/research", tags=["research"])


@router.post("/consent", response_model=ResearchConsentView)
async def write_consent(
    payload: ResearchConsentUpdate,
    current_user: UserInDB = Depends(get_current_user),
    redis: Redis = Depends(get_redis),
) -> ResearchConsentView:
    return await set_research_consent(redis, current_user, payload)


@router.get("/experiment", response_model=ResearchExperimentContext)
async def read_experiment_context(
    current_user: UserInDB = Depends(get_current_user),
    redis: Redis = Depends(get_redis),
) -> ResearchExperimentContext:
    return await get_experiment_context(redis, current_user)


@router.get("/posttest/status", response_model=ResearchPosttestStatus)
async def read_posttest_status(
    research_accelerate: bool = Query(default=False),
    current_user: UserInDB = Depends(get_current_user),
    redis: Redis = Depends(get_redis),
) -> ResearchPosttestStatus:
    return await get_posttest_status(
        redis,
        current_user,
        accelerate=research_accelerate,
    )


@router.post("/posttest/submit")
async def submit_posttest(
    payload: ResearchPosttestSubmit,
    current_user: UserInDB = Depends(get_current_user),
    redis: Redis = Depends(get_redis),
) -> dict:
    session = await submit_posttest_answer(redis, current_user, payload.answer)
    return {"session_id": session["id"], "status": "completed"}


@router.post("/posttest/accelerate", response_model=MessageResponse)
async def accelerate_posttest_dates(
    _admin: UserInDB = Depends(get_current_admin),
    redis: Redis = Depends(get_redis),
    current_user: UserInDB = Depends(get_current_user),
) -> MessageResponse:
    user_data = await get_json(redis, f"user:{current_user.id}")
    if user_data is None:
        return MessageResponse(message="User not found")
    await accelerate_research_dates(redis, user_data)
    return MessageResponse(message="Research due dates set to now")


@router.get("/invite", response_model=ResearchInviteView)
async def read_invite(
    current_user: UserInDB = Depends(get_current_user),
    redis: Redis = Depends(get_redis),
) -> ResearchInviteView:
    return await get_research_invite(redis, current_user)


@router.post("/referral/claim", response_model=MessageResponse)
async def claim_referral(
    payload: ReferralClaimUpdate,
    current_user: UserInDB = Depends(get_current_user),
    redis: Redis = Depends(get_redis),
) -> MessageResponse:
    user_data = await get_json(redis, f"user:{current_user.id}")
    if user_data is None:
        return MessageResponse(message="User not found")
    await bind_referral(redis, user_data, payload.invite_code)
    return MessageResponse(message="Referral recorded")


@router.get("/referral/stats", response_model=list[ReferralStatsRow])
async def referral_stats(
    _admin: UserInDB = Depends(get_current_admin),
    redis: Redis = Depends(get_redis),
) -> list[ReferralStatsRow]:
    rows = await build_referral_stats(redis)
    return [ReferralStatsRow.model_validate(row) for row in rows]


@router.post("/events", response_model=ResearchEventsBatchResponse)
async def post_research_events(
    payload: ResearchEventsBatch,
    current_user: UserInDB = Depends(get_current_user),
    redis: Redis = Depends(get_redis),
) -> ResearchEventsBatchResponse:
    events = [item.model_dump() for item in payload.events]
    accepted, event_ids = await ingest_events(redis, current_user, events)
    return ResearchEventsBatchResponse(accepted=accepted, event_ids=event_ids)


@router.get("/survey/pending", response_model=ResearchSurveyPending)
async def read_survey_pending(
    context: str | None = Query(default=None),
    current_user: UserInDB = Depends(get_current_user),
    redis: Redis = Depends(get_redis),
) -> ResearchSurveyPending:
    data = await pending_survey(redis, current_user, context=context)
    return ResearchSurveyPending.model_validate(data)


@router.post("/survey/answer")
async def write_survey_answers(
    payload: ResearchSurveyAnswerBatch,
    current_user: UserInDB = Depends(get_current_user),
    redis: Redis = Depends(get_redis),
) -> dict:
    answers = [item.model_dump() for item in payload.answers]
    records = await submit_survey_answers(redis, current_user, answers)
    return {"saved": len(records), "records": records}


@router.post("/derive/daily", response_model=MessageResponse)
async def trigger_daily_derive(
    user_id: str | None = Query(default=None),
    _admin: UserInDB = Depends(get_current_admin),
    redis: Redis = Depends(get_redis),
) -> MessageResponse:
    count = await run_daily_derive(redis, user_id)
    return MessageResponse(message=f"Daily derive completed for {count} user(s)")


@router.get("/blind-review/pending", response_model=list[BlindReviewItem])
async def read_blind_review_pending(
    limit: int = Query(default=10, ge=1, le=50),
    _admin: UserInDB = Depends(get_current_admin),
    redis: Redis = Depends(get_redis),
) -> list[BlindReviewItem]:
    rows = await blind_review_pending(redis, limit=limit)
    return [BlindReviewItem.model_validate(row) for row in rows]


@router.post("/blind-review/score", response_model=MessageResponse)
async def write_blind_review_score(
    payload: BlindReviewScoreSubmit,
    admin: UserInDB = Depends(get_current_admin),
    redis: Redis = Depends(get_redis),
) -> MessageResponse:
    await blind_review_submit(redis, admin.id, payload.model_dump())
    return MessageResponse(message="Blind review scores saved")


@router.get("/export/panel")
async def export_research_panel_data(
    format: str = Query(default="jsonl", pattern="^(jsonl|csv)$"),
    anonymize: bool = Query(default=True),
    _admin: UserInDB = Depends(get_current_admin),
    redis: Redis = Depends(get_redis),
) -> PlainTextResponse:
    if format == "csv":
        body = await export_research_panel_csv(redis, anonymize=anonymize)
        media_type = "text/csv; charset=utf-8"
        filename = "edgewise-research-panel.csv"
    else:
        body = await export_research_panel(redis, anonymize=anonymize)
        media_type = "application/x-ndjson; charset=utf-8"
        filename = "edgewise-research-panel.jsonl"

    return PlainTextResponse(
        content=body,
        media_type=media_type,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/export")
async def export_research_data(
    format: str = Query(default="jsonl", pattern="^(jsonl|csv)$"),
    anonymize: bool = Query(default=False),
    _admin: UserInDB = Depends(get_current_admin),
    redis: Redis = Depends(get_redis),
) -> PlainTextResponse:
    if format == "csv":
        body = await export_research_csv(redis, anonymize=anonymize)
        media_type = "text/csv; charset=utf-8"
        filename = "edgewise-research-export.csv"
    else:
        body = await export_research_jsonl(redis, anonymize=anonymize)
        media_type = "application/x-ndjson; charset=utf-8"
        filename = "edgewise-research-export.jsonl"

    return PlainTextResponse(
        content=body,
        media_type=media_type,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
