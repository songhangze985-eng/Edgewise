from __future__ import annotations

from fastapi import APIRouter, Depends
from redis.asyncio import Redis

from app.api.deps import get_current_admin, get_current_user, get_redis
from app.models.schemas import (
    OrgAdminListItem,
    OrgConsentUpdate,
    OrgCreate,
    OrgJoinPreview,
    OrgJoinSubmit,
    OrgMembershipView,
    OrgMentorAdd,
    OrgShareSession,
    OrgUpdate,
    OrgWorkshopCreate,
    OrgWorkshopView,
    UserInDB,
)
from app.services import org_service

router = APIRouter(prefix="/org", tags=["org"])


@router.post("/admin/orgs", response_model=OrgAdminListItem)
async def admin_create_org(
    payload: OrgCreate,
    _admin: UserInDB = Depends(get_current_admin),
    redis: Redis = Depends(get_redis),
) -> OrgAdminListItem:
    admin_ids = [payload.admin_user_id] if payload.admin_user_id else []
    org = await org_service.create_org(
        redis,
        name=payload.name,
        pilot_period=payload.pilot_period,
        service_description=payload.service_description,
        fee_paid=payload.fee_paid,
        invite_method=payload.invite_method,
        human_coaching=payload.human_coaching,
        admin_user_ids=admin_ids,
    )
    return OrgAdminListItem(
        id=org["id"],
        name=org["name"],
        pilot_period=org["pilot_period"],
        invite_code=org["invite_code"],
        fee_paid=org["fee_paid"],
        invite_method=org["invite_method"],
        human_coaching=org["human_coaching"],
        member_count=0,
        created_at=org.get("created_at"),
    )


@router.get("/admin/orgs", response_model=list[OrgAdminListItem])
async def admin_list_orgs(
    _admin: UserInDB = Depends(get_current_admin),
    redis: Redis = Depends(get_redis),
) -> list[OrgAdminListItem]:
    rows = await org_service.list_orgs_admin(redis)
    return [OrgAdminListItem.model_validate(row) for row in rows]


@router.patch("/admin/orgs/{org_id}", response_model=OrgAdminListItem)
async def admin_update_org(
    org_id: str,
    payload: OrgUpdate,
    _admin: UserInDB = Depends(get_current_admin),
    redis: Redis = Depends(get_redis),
) -> OrgAdminListItem:
    org = await org_service.update_org_admin(
        redis,
        org_id,
        name=payload.name,
        pilot_period=payload.pilot_period,
        service_description=payload.service_description,
        fee_paid=payload.fee_paid,
        invite_method=payload.invite_method,
        human_coaching=payload.human_coaching,
    )
    member_count = await redis.scard(f"org:{org_id}:members")
    return OrgAdminListItem(
        id=org_id,
        name=org["name"],
        pilot_period=org["pilot_period"],
        invite_code=org["invite_code"],
        fee_paid=org["fee_paid"],
        invite_method=org["invite_method"],
        human_coaching=org["human_coaching"],
        member_count=member_count,
        created_at=org.get("created_at"),
    )


@router.post("/admin/orgs/{org_id}/workshops", response_model=OrgWorkshopView)
async def admin_add_workshop(
    org_id: str,
    payload: OrgWorkshopCreate,
    _admin: UserInDB = Depends(get_current_admin),
    redis: Redis = Depends(get_redis),
) -> OrgWorkshopView:
    ws = await org_service.add_workshop(
        redis,
        org_id,
        title=payload.title,
        description=payload.description,
        mode=payload.mode,
        task_slug=payload.task_slug,
    )
    return OrgWorkshopView.model_validate(ws)


@router.post("/admin/orgs/{org_id}/mentors")
async def admin_add_mentor(
    org_id: str,
    payload: OrgMentorAdd,
    _admin: UserInDB = Depends(get_current_admin),
    redis: Redis = Depends(get_redis),
) -> dict[str, str]:
    await org_service.add_org_mentor(redis, org_id, payload.user_id)
    return {"status": "ok"}


@router.get("/join/{code}/preview", response_model=OrgJoinPreview)
async def join_preview(
    code: str,
    redis: Redis = Depends(get_redis),
) -> OrgJoinPreview:
    data = await org_service.preview_join(redis, code)
    return OrgJoinPreview.model_validate(data)


@router.post("/join/{code}", response_model=OrgMembershipView)
async def join_with_code(
    code: str,
    payload: OrgJoinSubmit,
    current_user: UserInDB = Depends(get_current_user),
    redis: Redis = Depends(get_redis),
) -> OrgMembershipView:
    await org_service.join_org(
        redis,
        current_user,
        code,
        cohort=payload.cohort,
        org_consent_accepted=payload.org_consent_accepted,
        share_with_mentor=payload.share_with_mentor,
        share_scope=payload.share_scope,
    )
    membership = await org_service.get_membership(redis, current_user.id)
    return OrgMembershipView.model_validate(membership or {})


@router.get("/me", response_model=OrgMembershipView)
async def read_my_org_membership(
    current_user: UserInDB = Depends(get_current_user),
    redis: Redis = Depends(get_redis),
) -> OrgMembershipView:
    membership = await org_service.get_membership(redis, current_user.id)
    if not membership:
        return OrgMembershipView()
    return OrgMembershipView.model_validate(membership)


@router.patch("/me/consent", response_model=OrgMembershipView)
async def patch_my_org_consent(
    payload: OrgConsentUpdate,
    current_user: UserInDB = Depends(get_current_user),
    redis: Redis = Depends(get_redis),
) -> OrgMembershipView:
    await org_service.update_org_consent(
        redis,
        current_user,
        share_with_mentor=payload.share_with_mentor,
        share_scope=payload.share_scope,
        cohort=payload.cohort,
    )
    membership = await org_service.get_membership(redis, current_user.id)
    return OrgMembershipView.model_validate(membership or {})


@router.post("/sessions/share")
async def post_share_session(
    payload: OrgShareSession,
    current_user: UserInDB = Depends(get_current_user),
    redis: Redis = Depends(get_redis),
) -> dict[str, object]:
    return await org_service.share_session_with_mentor(redis, current_user, payload.session_id)


@router.get("/mentor/sessions")
async def list_mentor_sessions(
    current_user: UserInDB = Depends(get_current_user),
    redis: Redis = Depends(get_redis),
) -> list[dict[str, object]]:
    return await org_service.list_mentor_shared_sessions(redis, current_user)


@router.post("/workshops/{workshop_id}/complete")
async def complete_workshop(
    workshop_id: str,
    current_user: UserInDB = Depends(get_current_user),
    redis: Redis = Depends(get_redis),
) -> dict[str, object]:
    return await org_service.complete_workshop(redis, current_user, workshop_id)


@router.get("/{org_id}/aggregate")
async def read_org_aggregate(
    org_id: str,
    current_user: UserInDB = Depends(get_current_user),
    redis: Redis = Depends(get_redis),
) -> dict[str, object]:
    return await org_service.get_aggregate_for_user(redis, current_user, org_id)
