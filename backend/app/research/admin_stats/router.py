from __future__ import annotations

import csv
import io
import json
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import PlainTextResponse, StreamingResponse
from redis.asyncio import Redis

from app.api.deps import get_current_admin, get_redis
from app.core.redis_client import get_json
from app.models.schemas import MessageResponse, UserInDB
from app.research.admin_stats.audit import write_audit
from app.research.admin_stats.cache import get_cached, set_cached
from app.research.admin_stats.filters import StatsFilters
from app.research.admin_stats.loader import load_cohort, load_user_timeline
from app.research.admin_stats.optional_deps import require_admin_stats_deps
from app.research.admin_stats.privacy import mask_sensitive_text, resolve_user_id_by_hash, user_hash
from app.research.keys import RULE_VERSION, SURVEY_ITEMS_VERSION, blind_pool_key
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
    cached = await get_cached(redis, endpoint, params)
    if cached:
        return cached
    rows, meta = await load_cohort(redis, filters)
    body = builder(rows, meta)
    body["filtered_n"] = meta.get("filtered_n")
    body["consented_total"] = meta.get("consented_total")
    await set_cached(redis, endpoint, params, body)
    return body


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


@router.get("/survey/items/{item_id}")
async def admin_survey_item_detail(
    item_id: str,
    include_text: int = Query(default=0, ge=0, le=1),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    _admin: UserInDB = Depends(get_current_admin),
    redis: Redis = Depends(get_redis),
    filters: StatsFilters = Depends(_filter_dep),
) -> dict[str, Any]:
    require_admin_stats_deps()
    from app.research.admin_stats.metrics import compute_survey_items
    from app.research.admin_stats.text import word_frequencies

    rows, _ = await load_cohort(redis, filters)
    item_def = next((i for i in load_survey_items() if i["id"] == item_id), None)
    if not item_def:
        raise HTTPException(status_code=404, detail="Unknown item")
    summary = compute_survey_items(rows)["items"].get(item_id, {})
    texts: list[str] = []
    if item_def.get("type") == "open" or include_text:
        for r in rows:
            rec = (r.get("survey") or {}).get(item_id)
            if rec and rec.get("status") == "answered" and rec.get("value"):
                texts.append(str(rec.get("value")))
        summary["word_freq"] = word_frequencies(texts)
        if include_text and len(texts) >= 5:
            start = (page - 1) * page_size
            summary["texts"] = [
                {"user_hash": r["user_hash"], "text": mask_sensitive_text(str((r.get("survey") or {}).get(item_id, {}).get("value")))}
                for r in rows
                if (r.get("survey") or {}).get(item_id, {}).get("status") == "answered"
            ][start : start + page_size]
    return summary


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
    )

    rows, _ = await load_cohort(redis, filters)
    cells = four_cell_means(rows, outcome)
    means = {arm: (cells["cells"][arm]["mean"] if isinstance(cells["cells"][arm]["mean"], (int, float)) else None) for arm in ("00", "01", "10", "11")}
    effects = effect_estimates(means)
    boot_result = bootstrap_effects(rows, outcome, n_boot=boot, seed=seed)
    return {
        "exploratory_notice": "本页为探索性描述，按初始分配（ITT）计算。论文正式分析请导出数据，在预注册的模型中完成。",
        "outcome": outcome,
        "cells": cells,
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
    user_ids = list(await redis.smembers("users:all"))
    uid = resolve_user_id_by_hash(user_ids, q)
    await write_audit(redis, admin.id, "user_lookup", {"user_hash": q})
    if not uid:
        raise HTTPException(status_code=404, detail="User not found")
    user_data = await get_json(redis, f"user:{uid}") or {}
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


@router.get("/users/{user_hash}/timeline")
async def admin_user_timeline(
    user_hash_value: str,
    admin: UserInDB = Depends(get_current_admin),
    redis: Redis = Depends(get_redis),
) -> dict[str, Any]:
    user_ids = list(await redis.smembers("users:all"))
    uid = resolve_user_id_by_hash(user_ids, user_hash_value)
    await write_audit(redis, admin.id, "user_timeline", {"user_hash": user_hash_value})
    if not uid:
        raise HTTPException(status_code=404, detail="User not found")
    timeline = await load_user_timeline(redis, uid)
    return {"user_hash": user_hash(uid), "timeline": timeline}


@router.get("/blind-review/progress")
async def admin_blind_progress(
    _admin: UserInDB = Depends(get_current_admin),
    redis: Redis = Depends(get_redis),
) -> dict[str, Any]:
    pending = await redis.scard(blind_pool_key())
    return {
        "pending": int(pending),
        "single_review": None,
        "double_review": None,
        "reviewer_workload": [],
        "rubric_agreement": {},
        "disagreements": [],
        "note": "详细一致性指标需积累双评数据后显示",
    }


@router.post("/coding/{item_id}")
async def save_open_coding(
    item_id: str,
    payload: dict[str, Any],
    admin: UserInDB = Depends(get_current_admin),
    redis: Redis = Depends(get_redis),
) -> MessageResponse:
    user_h = payload.get("user_hash")
    label = payload.get("label")
    if not user_h or not label:
        raise HTTPException(status_code=400, detail="user_hash and label required")
    key = f"research:coding:{item_id}:{user_h}"
    await redis.hset(
        key,
        mapping={
            "coder": admin.id,
            "label": str(label),
            "ts": datetime.now(timezone.utc).isoformat(),
        },
    )
    return MessageResponse(message="Coding saved")


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

    if fmt == "codebook_json":
        items = load_survey_items()
        body = json.dumps({"version": SURVEY_ITEMS_VERSION, "items": items}, ensure_ascii=False)
        return PlainTextResponse(body, media_type="application/json")

    if fmt == "long_csv":
        buffer = io.StringIO()
        writer = csv.writer(buffer)
        writer.writerow(["user_hash", "ts", "source", "name", "payload"])
        for row in rows:
            uid = row["user_id"]
            for ev in await load_user_timeline(redis, uid):
                writer.writerow([row["user_hash"], ev.get("ts"), ev.get("source"), ev.get("name"), json.dumps(ev.get("props") or {})])
        return StreamingResponse(iter([buffer.getvalue()]), media_type="text/csv")

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
    return StreamingResponse(iter([buffer.getvalue()]), media_type="text/csv")
