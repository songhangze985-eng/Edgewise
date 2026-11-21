from __future__ import annotations

import csv
import io
import json
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from fastapi.responses import PlainTextResponse, StreamingResponse
from redis.asyncio import Redis

from app.api.deps import get_current_admin, get_redis
from app.core.index_store import get_all_user_ids
from app.core.redis_client import get_json
from app.models.schemas import MessageResponse, UserInDB
from app.research.admin_stats.audit import write_audit
from app.research.admin_stats.cache import get_cache_generation, get_cached, set_cached
from app.research.admin_stats.filters import StatsFilters
from app.research.admin_stats.loader import load_cohort, load_user_timeline, summarize_event_identifiers
from app.research.admin_stats.optional_deps import require_admin_stats_deps
from app.research.admin_stats.privacy import mask_sensitive_text, resolve_user_id_by_hash, user_hash
from app.research.events import user_has_research_consent
from app.research.keys import RULE_VERSION, SURVEY_ITEMS_VERSION
from app.research.survey_engine import load_survey_items

router = APIRouter(prefix="/research/admin", tags=["research-admin"])


def _filter_dep(
    from_: str | None = Query(default=None, alias="from"),
    to: str | None = None,
    zc: str | None = None,
    zp: str | None = None,
    channel: str | None = None,
    institution: str | None = None,
    rule_version: str | None = None,
    survey_version: str | None = None,
) -> StatsFilters:
    return StatsFilters.from_query(
        from_=from_,
        to=to,
        zc=zc,
        zp=zp,
        channel=channel,
        institution=institution,
        rule_version=rule_version,
        survey_version=survey_version,
    )


async def _cached_response(
    redis: Redis,
    endpoint: str,
    filters: StatsFilters,
    builder,
) -> dict[str, Any]:
    params = filters.to_cache_params()
    for _ in range(2):
        generation = await get_cache_generation(redis)
        if generation is not None:
            cached = await get_cached(redis, generation, endpoint, params)
            if cached is not None:
                if generation == await get_cache_generation(redis):
                    return cached
                continue
        rows, meta = await load_cohort(redis, filters)
        body = builder(rows, meta)
        body["filtered_n"] = meta.get("filtered_n")
        body["consented_total"] = meta.get("consented_total")
        if generation != await get_cache_generation(redis):
            continue
        if generation is not None:
            await set_cached(redis, generation, endpoint, params, body)
            if generation != await get_cache_generation(redis):
                continue
        return body
    raise HTTPException(status_code=503, detail="Research statistics changed during calculation. Please retry.")


@router.get("/meta")
async def admin_stats_meta(
    _admin: UserInDB = Depends(get_current_admin),
    redis: Redis = Depends(get_redis),
    filters: StatsFilters = Depends(_filter_dep),
) -> dict[str, Any]:
    rows, meta = await load_cohort(redis, filters)
    channels: dict[str, int] = {}
    institutions: dict[str, int] = {}
    for r in rows:
        ch = r.get("entry_channel") or "unknown"
        channels[ch] = channels.get(ch, 0) + 1
        inst = r.get("institution_id")
        if inst:
            institutions[str(inst)] = institutions.get(str(inst), 0) + 1
    channel_opts = []
    other = 0
    for ch, n in sorted(channels.items(), key=lambda x: -x[1]):
        if n < 5:
            other += n
        else:
            channel_opts.append({"id": ch, "label": ch, "n": n})
    if other:
        channel_opts.append({"id": "__other__", "label": "其他", "n": other})
    inst_opts = []
    other_i = 0
    for inst, n in sorted(institutions.items(), key=lambda x: -x[1]):
        if n < 5:
            other_i += n
        else:
            inst_opts.append({"id": inst, "label": inst, "n": n})
    if other_i:
        inst_opts.append({"id": "__other__", "label": "其他机构", "n": other_i})
    earliest = min((r.get("consent_at") for r in rows if r.get("consent_at")), default=None)
    return {
        "channels": channel_opts,
        "institutions": inst_opts,
        "rule_versions": [RULE_VERSION],
        "survey_versions": [SURVEY_ITEMS_VERSION],
        "research_started_at": earliest,
        "computed_at": datetime.now(timezone.utc).isoformat(),
        "filtered_n": meta.get("filtered_n"),
        "consented_total": meta.get("consented_total"),
    }


@router.get("/overview")
async def admin_overview(
    _admin: UserInDB = Depends(get_current_admin),
    redis: Redis = Depends(get_redis),
    filters: StatsFilters = Depends(_filter_dep),
) -> dict[str, Any]:
    require_admin_stats_deps()
    from app.research.admin_stats.metrics import compute_overview

    return await _cached_response(redis, "overview", filters, compute_overview)


@router.get("/passive")
async def admin_passive(
    _admin: UserInDB = Depends(get_current_admin),
    redis: Redis = Depends(get_redis),
    filters: StatsFilters = Depends(_filter_dep),
) -> dict[str, Any]:
    require_admin_stats_deps()
    from app.research.admin_stats.metrics import compute_passive

    return await _cached_response(redis, "passive", filters, lambda rows, meta: compute_passive(rows))


@router.get("/survey/items")
async def admin_survey_items(
    _admin: UserInDB = Depends(get_current_admin),
    redis: Redis = Depends(get_redis),
    filters: StatsFilters = Depends(_filter_dep),
) -> dict[str, Any]:
    require_admin_stats_deps()
    from app.research.admin_stats.metrics import b3_encoding, compute_survey_items

    body = await _cached_response(redis, "survey_items", filters, lambda rows, meta: compute_survey_items(rows))
    body["b3"] = b3_encoding((await load_cohort(redis, filters))[0])
    return body


@router.get("/experiment")
async def admin_experiment(
    outcome: str = Query(default="qualified_activation"),
    boot: int = Query(default=2000, ge=100, le=5000),
    seed: int = Query(default=20261103),
    _admin: UserInDB = Depends(get_current_admin),
    redis: Redis = Depends(get_redis),
    filters: StatsFilters = Depends(_filter_dep),
) -> dict[str, Any]:
    require_admin_stats_deps()
    from app.research.admin_stats.experiment import (
        balance_distributions,
        bootstrap_effects,
        effect_estimates,
        four_cell_means,
        manipulation_checks,
        qualified_activation_counts,
    )

    rows, _ = await load_cohort(redis, filters)
    activation = outcome == "qualified_activation"
    cells = effects = boot_result = None
    if not activation:
        cells = four_cell_means(rows, outcome)
        means = {arm: cell["mean"] for arm, cell in cells["cells"].items()}
        effects = effect_estimates(means)
        boot_result = bootstrap_effects(rows, outcome, n_boot=boot, seed=seed)
    return {
        "exploratory_notice": "本页为探索性描述，按初始分配（ITT）计算；其中可能包含指定组别的样本，不能直接视为随机分组。论文正式分析请导出分配来源并核查研究方案。",
        "outcome": outcome,
        "cells": cells,
        "activation_counts": qualified_activation_counts(rows) if activation else None,
        "effects": effects,
        "bootstrap": boot_result,
        "manipulation": manipulation_checks(rows),
        "balance": balance_distributions(rows),
        "filtered_n": len(rows),
    }


@router.get("/crosstab")
async def admin_crosstab(
    row: str | None = None,
    col: str | None = None,
    preset: str | None = None,
    _admin: UserInDB = Depends(get_current_admin),
    redis: Redis = Depends(get_redis),
    filters: StatsFilters = Depends(_filter_dep),
) -> dict[str, Any]:
    require_admin_stats_deps()
    from app.research.admin_stats.crosstab import crosstab, preset_agreement

    rows, _ = await load_cohort(redis, filters)
    if preset:
        return preset_agreement(rows, preset)
    if not row or not col:
        raise HTTPException(status_code=400, detail="row and col required unless preset is set")
    return crosstab(rows, row, col)


@router.get("/reliability")
async def admin_reliability(
    _admin: UserInDB = Depends(get_current_admin),
    redis: Redis = Depends(get_redis),
    filters: StatsFilters = Depends(_filter_dep),
) -> dict[str, Any]:
    require_admin_stats_deps()
    from app.research.admin_stats.reliability import compute_reliability

    return await _cached_response(redis, "reliability", filters, lambda rows, meta: compute_reliability(rows))


@router.get("/users")
async def admin_user_lookup(
    q: str = Query(min_length=8, max_length=64),
    admin: UserInDB = Depends(get_current_admin),
    redis: Redis = Depends(get_redis),
) -> dict[str, Any]:
    user_ids = await get_all_user_ids(redis)
    uid = resolve_user_id_by_hash(user_ids, q)
    await write_audit(redis, admin.id, "user_lookup", {"user_hash": q})
    if not uid:
        raise HTTPException(status_code=404, detail="User not found")
    user_data = await get_json(redis, f"user:{uid}") or {}
    if not user_has_research_consent(user_data):
        raise HTTPException(status_code=404, detail="User not found")
    assignment = user_data.get("experiment_assignment") or {}
    rows, _ = await load_cohort(redis, StatsFilters())
    row = next((r for r in rows if r["user_id"] == uid), None)
    return {
        "user_hash": user_hash(uid),
        "arm": assignment.get("arm"),
        "consent_at": (user_data.get("research_consent") or {}).get("accepted_at"),
        "entry_channel": (row or {}).get("entry_channel"),
        "rule_version": (row or {}).get("rule_version"),
    }


@router.get("/users/{user_hash_value}/timeline")
async def admin_user_timeline(
    user_hash_value: str,
    response: Response,
    admin: UserInDB = Depends(get_current_admin),
    redis: Redis = Depends(get_redis),
) -> dict[str, Any]:
    user_ids = await get_all_user_ids(redis)
    uid = resolve_user_id_by_hash(user_ids, user_hash_value)
    await write_audit(redis, admin.id, "user_timeline", {"user_hash": user_hash_value})
    if not uid:
        raise HTTPException(status_code=404, detail="User not found")
    if not user_has_research_consent(await get_json(redis, f"user:{uid}")):
        raise HTTPException(status_code=404, detail="User not found")
    timeline = await load_user_timeline(redis, uid)
    response.headers["Cache-Control"] = "no-store"
    return {"user_hash": user_hash(uid), "timeline": timeline, "event_quality": summarize_event_identifiers(timeline)}


@router.get("/blind-review/progress")
async def admin_blind_progress(
    _admin: UserInDB = Depends(get_current_admin),
    redis: Redis = Depends(get_redis),
) -> dict[str, Any]:
    from app.core.mongo_client import mongo_store
    from app.research.blind_review import get_independent_review_progress

    processing = await mongo_store.collection("surveys").count_documents({"doc_type": "blind_review_pool", "status": {"$in": ["processing", "retryable"]}})
    progress = await get_independent_review_progress(redis)
    return {
        "pending": progress["awaiting_first"] + progress["awaiting_second"] if progress is not None else None,
        "processing": processing,
        "single_review": progress["awaiting_second"] if progress is not None else None,
        "double_review": progress["completed"] if progress is not None else None,
        "awaiting_first_review": progress["awaiting_first"] if progress is not None else None,
        "reviewer_workload": [],
        "rubric_agreement": {},
        "disagreements": [],
        "note": (
            "双评进度仅统计当前同意周期的双评后测。"
            if progress is not None else "双评记录超过当前统计上限，暂无法显示完整进度。"
        ),
    }


@router.post("/export")
async def admin_export(
    payload: dict[str, Any],
    admin: UserInDB = Depends(get_current_admin),
    redis: Redis = Depends(get_redis),
):
    fmt = payload.get("format") or "wide_csv"
    filter_raw = payload.get("filters") or {}
    mapped = dict(filter_raw)
    if "from" in mapped:
        mapped["from_"] = mapped.pop("from")
    filters = StatsFilters.from_query(**mapped)
    rows, _ = await load_cohort(redis, filters)
    await write_audit(redis, admin.id, "export", {"format": fmt, "filters": filter_raw})
    headers = {"Cache-Control": "no-store"}

    if fmt == "codebook_json":
        items = load_survey_items()
        body = json.dumps({"version": SURVEY_ITEMS_VERSION, "items": items}, ensure_ascii=False)
        return PlainTextResponse(body, media_type="application/json", headers=headers)

    if fmt == "long_csv":
        buffer = io.StringIO()
        writer = csv.writer(buffer)
        writer.writerow(["user_hash", "ts", "source", "name", "payload"])
        for row in rows:
            uid = row["user_id"]
            for ev in await load_user_timeline(redis, uid):
                writer.writerow([row["user_hash"], ev.get("ts"), ev.get("source"), ev.get("name"), json.dumps(ev.get("props") or {})])
        return StreamingResponse(iter([buffer.getvalue()]), media_type="text/csv", headers=headers)

    buffer = io.StringIO()
    writer = csv.writer(buffer)
    survey_ids = [i["id"] for i in load_survey_items()]
    writer.writerow(["user_hash", "arm", "zc", "zp", "consent_at", "entry_channel"] + survey_ids)
    for row in rows:
        survey = row.get("survey") or {}
        answers = []
        for sid in survey_ids:
            rec = survey.get(sid)
            if isinstance(rec, dict) and rec.get("status") == "answered":
                answers.append(rec.get("value"))
            else:
                answers.append("")
        writer.writerow(
            [
                row["user_hash"],
                row.get("arm"),
                row.get("zc"),
                row.get("zp"),
                row.get("consent_at"),
                row.get("entry_channel"),
                *answers,
            ]
        )
    return StreamingResponse(iter([buffer.getvalue()]), media_type="text/csv", headers=headers)
