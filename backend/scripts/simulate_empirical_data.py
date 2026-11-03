#!/usr/bin/env python3
"""
Simulate Empirical Research Dataset for Edgewise Factorial Trial (2x2 Design).

Generates N = 400 complete participant records stored in Redis across 4 arms:
- Arm '00': Disconnected entry (ZC=0) + Passive observation (ZP=0)
- Arm '01': Disconnected entry (ZC=0) + Active practice & revision (ZP=1)
- Arm '10': Continuous entry (ZC=1) + Passive observation (ZP=0)
- Arm '11': Continuous entry (ZC=1) + Active practice & revision (ZP=1)

Fully covers the six research propositions (P1 ~ P6), all 52 survey items (A1~K2),
psychometric scale constructs, behavioral indices, and export pipelines.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any

import numpy as np
from redis.asyncio import Redis

from app.research.keys import (
    RULE_VERSION,
    SURVEY_ITEMS_VERSION,
    auto_hash_key,
    auto_meta_key,
    blind_pool_key,
    event_stream_key,
    survey_hash_key,
    survey_state_key,
)
from app.research.survey_engine import load_survey_items


# Target cell counts and qualified activation counts (P3)
# Delta CP = 0.78 - 0.30 - 0.35 + 0.12 = +0.250 > 0
TARGET_QUALIFIED = {
    "00": 12,  # 12% of 100
    "01": 35,  # 35% of 100
    "10": 30,  # 30% of 100
    "11": 78,  # 78% of 100
}

# Channel distribution per arm (sum = 100 per arm, 400 total)
CHANNELS_PER_ARM = (
    ["creator"] * 30      # 120 total (30%)
    + ["video"] * 25      # 100 total (25%)
    + ["search"] * 20     # 80 total (20%)
    + ["agent"] * 15      # 60 total (15%)
    + ["institution"] * 10  # 40 total (10%)
)

# Referral incentive distribution per arm (sum = 100 per arm)
INCENTIVES_PER_ARM = (
    ["bonus_practice"] * 40  # 160 total
    + ["cash_rebate"] * 40   # 160 total
    + ["none"] * 20          # 80 total
)


def _clip_likert(val: float) -> int:
    """Clips and rounds a latent score to 1-7 Likert scale integer."""
    return int(max(1, min(7, round(val))))


def generate_cohort(n_per_arm: int = 100, seed: int = 20261103) -> list[dict[str, Any]]:
    """Generates balanced participant records satisfying all 6 propositions."""
    rng = np.random.default_rng(seed)
    now = datetime.now(timezone.utc)
    survey_item_defs = load_survey_items()
    all_survey_ids = [item["id"] for item in survey_item_defs]

    cohort: list[dict[str, Any]] = []

    for arm in ("00", "01", "10", "11"):
        zc = int(arm[0])
        zp = int(arm[1])
        n_qualified_target = TARGET_QUALIFIED[arm]

        # Determine which participants in this arm achieve qualified activation
        qual_flags = [1] * n_qualified_target + [0] * (n_per_arm - n_qualified_target)
        rng.shuffle(qual_flags)

        # Shuffle channels and incentives for this arm
        channels = list(CHANNELS_PER_ARM)
        rng.shuffle(channels)
        incentives = list(INCENTIVES_PER_ARM)
        rng.shuffle(incentives)

        for i in range(n_per_arm):
            user_id = f"sim_user_{arm}_{i + 1:03d}"
            qualified = qual_flags[i]
            channel = channels[i]
            incentive = incentives[i]

            # Timestamps: spread across last 14 to 28 days
            days_ago = float(rng.uniform(14.0, 28.0))
            created_dt = now - timedelta(days=days_ago)
            consent_dt = created_dt + timedelta(minutes=float(rng.uniform(1.0, 5.0)))
            practice_dt = consent_dt + timedelta(minutes=float(rng.uniform(5.0, 25.0)))
            # Posttest due 7 days after consent, completed shortly after
            posttest_due_dt = consent_dt + timedelta(days=7)
            posttest_completed_dt = posttest_due_dt + timedelta(hours=float(rng.uniform(1.0, 12.0)))

            # Latent psychological variables
            # 1. Prior Ability (balanced across arms: mean ~4.2, std ~1.2)
            theta_ability = float(rng.normal(4.2, 1.1))

            # 2. Entry Continuity (high for ZC=1, low for ZC=0)
            theta_continuity = float(rng.normal(5.8 if zc == 1 else 2.6, 0.65))

            # 3. Diagnosticity & Expectation Fit (P4)
            # High diagnosticity for complementary creator content, moderate for search/institution
            creator_variant = "complementary" if i % 2 == 0 else "conclusion"
            if channel in ("creator", "video"):
                theta_diag = float(rng.normal(5.9 if creator_variant == "complementary" else 3.8, 0.6))
            else:
                theta_diag = float(rng.normal(4.6, 0.8))
            theta_fit = float(np.clip(0.6 * theta_diag + 0.3 * theta_continuity + rng.normal(0, 0.5), 1.0, 7.0))

            # 4. Learning Progress & Feedback Quality (P2)
            # High for active practice ZP=1, moderate/low for passive ZP=0
            theta_progress = float(rng.normal(5.9 if zp == 1 else 3.2, 0.6))
            theta_feedback = float(rng.normal(5.8 if zp == 1 else 3.8, 0.65))

            # 5. Agent Relevance & Disturbance (P5)
            # Microtask vs generic for agent channel
            is_microtask = (i % 2 == 0)
            if channel == "agent":
                theta_agent_rel = float(rng.normal(6.0 if is_microtask else 3.1, 0.6))
                agent_latency = int(rng.uniform(850, 1400)) if is_microtask else int(rng.uniform(3600, 5800))
                agent_to_practice = 1 if is_microtask and rng.random() < 0.88 else (1 if not is_microtask and rng.random() < 0.20 else 0)
                agent_opt_out = 0 if is_microtask else (1 if rng.random() < 0.35 else 0)
            else:
                theta_agent_rel = float(rng.normal(4.5, 1.0))
                agent_latency = int(rng.uniform(1200, 3000))
                agent_to_practice = 1 if rng.random() < 0.5 else 0
                agent_opt_out = 0

            # 6. Process Trust & Privacy (P6)
            theta_trust = float(rng.normal(5.7, 0.7))

            # Realized checks
            zc_realized = 1 if (zc == 1 and rng.random() < 0.96) or (zc == 0 and rng.random() < 0.04) else 0

            # --- Behavioral Indices (Numeric Covariance Guaranteed) ---
            # Index 1: task_rebuild_cost (P1)
            xi_rebuild = float(rng.normal(0, 0.8))
            if zc == 0:
                steps_first_ans = int(np.clip(round(6.8 + 1.2 * xi_rebuild), 4, 10))
                time_first_ans_sec = int(np.clip(round(175 + 28 * xi_rebuild), 110, 260))
                reselect_count = int(np.clip(round(2.4 + 0.8 * xi_rebuild), 1, 5))
                agent_repeat = int(np.clip(round(1.9 + 0.6 * xi_rebuild), 1, 4))
            else:
                steps_first_ans = int(np.clip(round(2.1 + 0.3 * xi_rebuild), 1, 3))
                time_first_ans_sec = int(np.clip(round(42 + 8 * xi_rebuild), 22, 65))
                reselect_count = int(np.clip(round(0.1 + 0.3 * xi_rebuild), 0, 1))
                agent_repeat = int(np.clip(round(0.2 + 0.4 * xi_rebuild), 0, 1))

            # Index 2: active_processing (P2)
            eta_active = float(rng.normal(0, 0.7))
            if zp == 1:
                ans_before_fb = 1
                rev_action = 1.0
                rev_count = int(rng.choice([2, 3, 4]))
                variant_followups = int(np.clip(round(2.6 + 0.7 * eta_active), 1, 5))
                passive_time_ratio = float(np.clip(round(0.14 + 0.04 * eta_active, 3), 0.05, 0.25))
            else:
                ans_before_fb = 0
                rev_action = 0.0
                rev_count = 0
                variant_followups = int(np.clip(round(0.2 + 0.3 * eta_active), 0, 1))
                passive_time_ratio = float(np.clip(round(0.81 + 0.06 * eta_active, 3), 0.65, 0.95))

            # Long-term retention & viral metrics (P3 & P6)
            if arm == "11":
                return_sessions = int(np.clip(round(rng.normal(4.3, 1.1)), 2, 8))
                vol_act_14d = 1 if rng.random() < 0.65 else 0
                pt_score = float(np.clip(rng.normal(83.0, 5.5), 65.0, 98.0))
            elif arm == "10":
                return_sessions = int(np.clip(round(rng.normal(1.9, 0.8)), 0, 4))
                vol_act_14d = 1 if rng.random() < 0.22 else 0
                pt_score = float(np.clip(rng.normal(64.0, 7.0), 45.0, 85.0))
            elif arm == "01":
                return_sessions = int(np.clip(round(rng.normal(2.1, 0.8)), 0, 4))
                vol_act_14d = 1 if rng.random() < 0.24 else 0
                pt_score = float(np.clip(rng.normal(72.0, 6.5), 55.0, 90.0))
            else:  # "00"
                return_sessions = int(np.clip(round(rng.normal(0.8, 0.6)), 0, 2))
                vol_act_14d = 1 if rng.random() < 0.08 else 0
                pt_score = float(np.clip(rng.normal(52.0, 8.0), 30.0, 75.0))

            # Viral referrals (P6)
            if incentive == "bonus_practice":
                qual_invitees = int(np.clip(round(rng.normal(2.2, 0.9)), 0, 6))
                share_opens = int(rng.integers(3, 8))
                invites_sent = int(rng.integers(2, 6))
                share_chosen = "答案修订卡"
                incentive_choice = "练习权益"
            elif incentive == "cash_rebate":
                qual_invitees = int(np.clip(round(rng.normal(0.8, 0.6)), 0, 3))
                share_opens = int(rng.integers(1, 5))
                invites_sent = int(rng.integers(1, 4))
                share_chosen = "评分或报告"
                incentive_choice = "现金返利"
            else:
                qual_invitees = int(np.clip(round(rng.normal(0.2, 0.4)), 0, 2))
                share_opens = int(rng.integers(0, 3))
                invites_sent = int(rng.integers(0, 2))
                share_chosen = "一条方法"
                incentive_choice = "不需要奖励"

            # Institution attribution
            inst_id = f"inst_{rng.choice(['tsinghua', 'peking', 'fudan', 'sjtu'])}" if channel == "institution" else None

            # --- Construct Survey Item Responses (52 items) ---
            survey_dict: dict[str, Any] = {}
            noise = lambda s=0.35: float(rng.normal(0, s))

            # A-series: Baseline Demographics & Prior Ability
            survey_dict["A1"] = {"status": "answered", "value": rng.choice(["首次求职", "在职考虑换工作", "在校未开始", "转行或换岗位方向"]), "answered_at": consent_dt.isoformat()}
            survey_dict["A2"] = {"status": "answered", "value": rng.choice(["一周内", "1–4 周", "1 个月以上"]), "answered_at": consent_dt.isoformat()}
            survey_dict["A3"] = {"status": "answered", "value": rng.choice(["有答案但经不起追问", "不知道哪些经历值得讲", "讲不清个人贡献", "解释不清转行"]), "answered_at": consent_dt.isoformat()}
            survey_dict["A5"] = {"status": "answered", "value": rng.choice(["用过 1–2 次", "经常", "听说过"]), "answered_at": consent_dt.isoformat()}
            # prior_ability construct (A7a, A7b, A7c)
            survey_dict["A7a"] = {"status": "answered", "value": _clip_likert(theta_ability + noise()), "answered_at": consent_dt.isoformat()}
            survey_dict["A7b"] = {"status": "answered", "value": _clip_likert(theta_ability + noise()), "answered_at": consent_dt.isoformat()}
            survey_dict["A7c"] = {"status": "answered", "value": _clip_likert(theta_ability + noise()), "answered_at": consent_dt.isoformat()}

            # B-series: Brand Promise & Credibility
            survey_dict["B3"] = {"status": "answered", "value": "找出空白并练习应对追问", "answered_at": consent_dt.isoformat()}
            survey_dict["B4"] = {"status": "answered", "value": _clip_likert(5.2 + noise(0.7)), "answered_at": consent_dt.isoformat()}

            # C-series & Manipulation Check ZC
            # C1 Manipulation Check: ZC=1 -> 5~7 (mean ~5.9), ZC=0 -> 1~3 (mean ~2.3)
            c1_val = _clip_likert(rng.normal(5.9, 0.55)) if zc == 1 else _clip_likert(rng.normal(2.3, 0.55))
            survey_dict["C1"] = {"status": "answered", "value": c1_val, "answered_at": practice_dt.isoformat()}
            # entry_continuity construct (C4, C5, C6)
            survey_dict["C4"] = {"status": "answered", "value": _clip_likert(theta_continuity + noise()), "answered_at": practice_dt.isoformat()}
            survey_dict["C5"] = {"status": "answered", "value": _clip_likert(theta_continuity + noise()), "answered_at": posttest_completed_dt.isoformat()}
            survey_dict["C6"] = {"status": "answered", "value": _clip_likert(theta_continuity + noise()), "answered_at": posttest_completed_dt.isoformat()}

            # F-series: Feedback & Practice Manipulation Check ZP
            survey_dict["F1"] = {
                "status": "answered",
                "value": "自己作答再修改" if zp == 1 else "观看理想答案示范",
                "answered_at": practice_dt.isoformat(),
            }
            survey_dict["F2b"] = {"status": "answered", "value": _clip_likert(5.5 + noise(0.6)), "answered_at": practice_dt.isoformat()}
            # feedback_quality construct (F3a, F3b, F3c)
            survey_dict["F3a"] = {"status": "answered", "value": _clip_likert(theta_feedback + noise()), "answered_at": practice_dt.isoformat()}
            survey_dict["F3b"] = {"status": "answered", "value": _clip_likert(theta_feedback + noise()), "answered_at": practice_dt.isoformat()}
            survey_dict["F3c"] = {"status": "answered", "value": _clip_likert(theta_feedback + noise()), "answered_at": practice_dt.isoformat()}
            # expectation_fit construct (F4a, F4b reversed)
            survey_dict["F4a"] = {"status": "answered", "value": _clip_likert(theta_fit + noise()), "answered_at": practice_dt.isoformat()}
            # F4b is reversed in scale: high fit -> low raw response (8 - theta_fit)
            survey_dict["F4b"] = {"status": "answered", "value": _clip_likert(8.0 - theta_fit + noise()), "answered_at": practice_dt.isoformat()}
            # progress construct (F5a, F5b, F5c)
            survey_dict["F5a"] = {"status": "answered", "value": _clip_likert(theta_progress + noise()), "answered_at": practice_dt.isoformat()}
            survey_dict["F5b"] = {"status": "answered", "value": _clip_likert(theta_progress + noise()), "answered_at": practice_dt.isoformat()}
            survey_dict["F5c"] = {"status": "answered", "value": _clip_likert(theta_progress + noise()), "answered_at": posttest_completed_dt.isoformat()}
            survey_dict["F6"] = {"status": "answered", "value": "以STAR框架复盘实际项目技术选型，重点论证事实数据与权衡依据而非罗列结论", "answered_at": posttest_completed_dt.isoformat()}

            # D-series: Diagnosticity (P4)
            # D3 is reverse-coded: high diagnosticity -> low raw score (8 - theta_diag)
            survey_dict["D1"] = {"status": "answered", "value": _clip_likert(theta_diag + noise()), "answered_at": practice_dt.isoformat()}
            # D2: Open recall question, stored as numeric score (1-7) for psychometric alpha computation
            survey_dict["D2"] = {"status": "answered", "value": _clip_likert(theta_diag + noise()), "answered_at": practice_dt.isoformat()}
            survey_dict["D3"] = {"status": "answered", "value": _clip_likert(8.0 - theta_diag + noise()), "answered_at": practice_dt.isoformat()}
            survey_dict["D4"] = {"status": "answered", "value": _clip_likert(5.1 + noise(0.8)), "answered_at": practice_dt.isoformat()}
            survey_dict["D5"] = {"status": "answered", "value": _clip_likert(theta_diag + noise()), "answered_at": practice_dt.isoformat()}
            survey_dict["D6"] = {"status": "answered", "value": _clip_likert(theta_diag + noise()), "answered_at": practice_dt.isoformat()}

            # E-series: Agent Relevance & Disturbance (P5)
            # E7 is reverse-coded: high relevance -> low disturbance (8 - theta_agent_rel)
            survey_dict["E1"] = {"status": "answered", "value": _clip_likert(theta_agent_rel + noise()), "answered_at": practice_dt.isoformat()}
            survey_dict["E2"] = {"status": "answered", "value": _clip_likert(theta_agent_rel + noise()), "answered_at": practice_dt.isoformat()}
            survey_dict["E7"] = {"status": "answered", "value": _clip_likert(8.0 - theta_agent_rel + noise()), "answered_at": practice_dt.isoformat()}

            # I-series: Institutional attribution & Process Trust (P6)
            survey_dict["I5a"] = {"status": "answered", "value": _clip_likert(5.8 if channel == "institution" else 3.2), "answered_at": practice_dt.isoformat()}
            survey_dict["I5b"] = {"status": "answered", "value": _clip_likert(5.5 if channel == "institution" else 3.1), "answered_at": practice_dt.isoformat()}
            survey_dict["I5c"] = {"status": "answered", "value": _clip_likert(6.0 if channel == "institution" else 2.8), "answered_at": practice_dt.isoformat()}
            survey_dict["I5d"] = {"status": "answered", "value": _clip_likert(3.8 + noise(0.8)), "answered_at": practice_dt.isoformat()}
            # process_trust construct (I1, I2, I3 reversed, I4)
            survey_dict["I1"] = {"status": "answered", "value": _clip_likert(theta_trust + noise()), "answered_at": posttest_completed_dt.isoformat()}
            survey_dict["I2"] = {"status": "answered", "value": _clip_likert(theta_trust + noise()), "answered_at": posttest_completed_dt.isoformat()}
            survey_dict["I3"] = {"status": "answered", "value": _clip_likert(8.0 - theta_trust + noise()), "answered_at": posttest_completed_dt.isoformat()}
            survey_dict["I4"] = {"status": "answered", "value": _clip_likert(theta_trust + noise()), "answered_at": posttest_completed_dt.isoformat()}

            # G, H, J, K-series: Virality, Retention, Posttest & Qualitative
            survey_dict["G1"] = {"status": "answered", "value": _clip_likert(5.8 + noise(0.6)), "answered_at": posttest_completed_dt.isoformat()}
            survey_dict["G2"] = {"status": "answered", "value": _clip_likert(5.6 + noise(0.7)), "answered_at": posttest_completed_dt.isoformat()}
            survey_dict["G3"] = {"status": "answered", "value": _clip_likert(4.3 + noise(0.9)), "answered_at": posttest_completed_dt.isoformat()}
            survey_dict["G4"] = {"status": "answered", "value": _clip_likert(4.5 + noise(0.9)), "answered_at": posttest_completed_dt.isoformat()}
            survey_dict["G5"] = {"status": "answered", "value": share_chosen, "answered_at": posttest_completed_dt.isoformat()}
            survey_dict["G6"] = {"status": "answered", "value": incentive_choice, "answered_at": posttest_completed_dt.isoformat()}
            survey_dict["H3"] = {"status": "answered", "value": rng.choice(["30–60 元", "60–100 元", "30 元内", "100 元以上"]), "answered_at": posttest_completed_dt.isoformat()}
            survey_dict["H4"] = {"status": "answered", "value": "面试已结束或任务完成了", "answered_at": posttest_completed_dt.isoformat()}
            survey_dict["J2"] = {"status": "answered", "value": _clip_likert(rng.normal(5.8 if zp == 1 else 3.6, 0.85)), "answered_at": posttest_completed_dt.isoformat()}
            survey_dict["K1"] = {"status": "answered", "value": "希望后续能增加更多大厂系统架构追问案例和深度答题拆解", "answered_at": posttest_completed_dt.isoformat()}
            survey_dict["K2"] = {"status": "answered", "value": "追问精准切中个人简历表达盲区，比单纯背诵题解更具备实战锻炼价值", "answered_at": posttest_completed_dt.isoformat()}

            # Ensure all 52 survey IDs are present
            assert len(survey_dict) == 52, f"Expected 52 items, got {len(survey_dict)}"

            # --- User Document ---
            user_doc = {
                "id": user_id,
                "email": f"{user_id}@research.edgewise.ai",
                "role": "user",
                "created_at": created_dt.isoformat(),
                "research_consent": {
                    "accepted": True,
                    "accepted_at": consent_dt.isoformat(),
                    "version": RULE_VERSION,
                },
                "experiment_assignment": {
                    "arm": arm,
                    "factors": {"continuity": zc, "participation": zp},
                    "assigned_at": consent_dt.isoformat(),
                    "source": "simulated",
                },
                "posttest_due_at": posttest_due_dt.isoformat(),
                "posttest_completed_at": posttest_completed_dt.isoformat(),
                "followup_task_due_at": (posttest_due_dt + timedelta(days=7)).isoformat(),
                "referral_incentive": incentive,
                "invite_code": f"INV-{arm}-{i + 1:03d}",
            }

            # --- Auto-Derived Metrics Hash ---
            auto_hash = {
                # Factorial & Assignment
                "ZC": zc,
                "ZP": zp,
                "zc_assigned": zc,
                "zp_assigned": zp,
                "zc_realized": zc_realized,
                "first_practice_completed": 1,
                # P1: Task Rebuild Cost
                "steps_to_first_answer": steps_first_ans,
                "time_to_first_answer_sec": time_first_ans_sec,
                "entry_reselect_count": reselect_count,
                "agent_repeat_explain": agent_repeat,
                # P2: Active Processing
                "answered_before_feedback": ans_before_fb,
                "revision_action": rev_action,
                "revision_count": rev_count,
                "variant_followups_done": variant_followups,
                "passive_time_ratio": passive_time_ratio,
                "feedback_viewed": 1,
                # P3: Superadditive Complementarity
                "qualified_activation": qualified,
                "return_sessions_7d": return_sessions,
                "voluntary_activation_14d": vol_act_14d,
                "posttest_status": "done",
                "posttest_score": pt_score,
                "days_elapsed": int(days_ago - 7),
                "blind_score_mean": round(float(np.clip(pt_score / 14.0, 1.0, 7.0)), 1),
                # P4: Information Diagnosticity
                "entry_channel": channel,
                "B1": channel,
                "B2": rng.choice(["software_engineer", "product_manager", "data_analyst", "consultant"]),
                "creator_series_variant": creator_variant,
                "inactive_3d": 1 if rng.random() < (0.15 if theta_diag < 4.5 else 0.02) else 0,
                "churn_after_interview_date": 0,
                # P5: Copilot Relevance & Latency
                "proactive_reply_latency_ms": agent_latency,
                "proactive_reply_type": "microtask" if is_microtask else "generic",
                "E3-auto": "microtask" if is_microtask else "generic",
                "E-lat": agent_latency,
                "agent_to_practice": agent_to_practice,
                "agent_opt_out": agent_opt_out,
                # P6: Viral Referrals & Incentives
                "referral_incentive": incentive,
                "referral_qualified_invitees": qual_invitees,
                "share_card_opens": share_opens,
                "invites_sent": invites_sent,
                "referral_net_contribution": round(qual_invitees * 25.0 - (15.0 if incentive == "cash_rebate" else 0.0), 2),
                "share_object_chosen": share_chosen,
                "incentive_claimed": incentive_choice,
                # General Demographics & Metadata
                "institution_id": inst_id,
                "is_first_use": 1,
                "daily_minutes_actual": int(rng.uniform(18, 48)),
                "target_role": "后端开发工程师" if i % 2 == 1 else "产品经理",
            }

            # State hash
            state_hash = {
                "feedback_view_count": 2,
                "report_view_count": 2,
                "completed_sessions": 2,
                "agent_used": True if channel == "agent" else False,
                "posttest_survey_enqueued": True,
                "skip_counts": {},
                "declined_items": [],
            }

            # Events list
            events = [
                {"id": str(uuid.uuid4()), "event": "research.consent", "ts": consent_dt.isoformat(), "user_id": user_id, "props": {"arm": arm}},
                {"id": str(uuid.uuid4()), "event": "session.start", "ts": practice_dt.isoformat(), "user_id": user_id, "props": {"channel": channel}},
                {"id": str(uuid.uuid4()), "event": "session.answer", "ts": (practice_dt + timedelta(minutes=3)).isoformat(), "user_id": user_id, "props": {"steps": steps_first_ans}},
                {"id": str(uuid.uuid4()), "event": "session.feedback", "ts": (practice_dt + timedelta(minutes=5)).isoformat(), "user_id": user_id, "props": {"viewed": True}},
                {"id": str(uuid.uuid4()), "event": "posttest.complete", "ts": posttest_completed_dt.isoformat(), "user_id": user_id, "props": {"score": pt_score}},
            ]

            cohort.append({
                "user_id": user_id,
                "user_doc": user_doc,
                "auto_hash": auto_hash,
                "survey_dict": survey_dict,
                "state_hash": state_hash,
                "events": events,
            })

    return cohort


async def clear_simulated_participants(redis: Redis) -> int:
    """Removes existing simulated participant records while preserving real admin users."""
    user_ids = [u.decode("utf-8") if isinstance(u, bytes) else str(u) for u in await redis.smembers("users:all")]
    cleared = 0
    for uid in user_ids:
        if uid.startswith("sim_user_") or uid.startswith("u-sim-") or uid.startswith("u-test-"):
            await redis.delete(
                f"user:{uid}",
                auto_hash_key(uid),
                auto_meta_key(uid),
                survey_hash_key(uid),
                f"research:survey:{uid}:queue",
                f"research:survey:{uid}:shown",
                survey_state_key(uid),
                event_stream_key(uid),
            )
            await redis.srem("users:all", uid)
            cleared += 1

    # Invalidate cached admin stats
    cache_keys = await redis.keys("research:admin_cache:*")
    if cache_keys:
        await redis.delete(*cache_keys)

    return cleared


async def persist_cohort_to_redis(cohort: list[dict[str, Any]], redis_url: str = "redis://localhost:6379/0") -> None:
    """Writes the simulated cohort into Redis data structures."""
    redis = Redis.from_url(redis_url, decode_responses=True)

    cleared = await clear_simulated_participants(redis)
    print(f"Cleared {cleared} prior simulated participant records from Redis.")

    meta_payload = json.dumps({"computed_at": datetime.now(timezone.utc).isoformat(), "rule_version": RULE_VERSION})

    arm_counts = {"00": 0, "01": 0, "10": 0, "11": 0}

    for p in cohort:
        uid = p["user_id"]
        arm = p["user_doc"]["experiment_assignment"]["arm"]
        arm_counts[arm] += 1

        # 1. users:all & user:{uid}
        await redis.sadd("users:all", uid)
        await redis.set(f"user:{uid}", json.dumps(p["user_doc"], ensure_ascii=False))

        # 2. research:auto:{uid}
        auto_serialized = {k: json.dumps(v, ensure_ascii=False) if not isinstance(v, (int, float, str)) or isinstance(v, bool) else (str(v) if isinstance(v, (int, float)) else json.dumps(v, ensure_ascii=False)) for k, v in p["auto_hash"].items()}
        await redis.hset(auto_hash_key(uid), mapping=auto_serialized)
        await redis.hset(auto_meta_key(uid), mapping={"computed_at": meta_payload, "rule_version": RULE_VERSION})

        # 3. research:survey:{uid}
        survey_serialized = {k: json.dumps(v, ensure_ascii=False) for k, v in p["survey_dict"].items()}
        await redis.hset(survey_hash_key(uid), mapping=survey_serialized)

        # 4. research:survey:{uid}:state
        state_serialized = {k: json.dumps(v, ensure_ascii=False) for k, v in p["state_hash"].items()}
        await redis.hset(survey_state_key(uid), mapping=state_serialized)

        # 5. research:event:{uid}
        await redis.delete(event_stream_key(uid))
        for ev in p["events"]:
            await redis.rpush(event_stream_key(uid), json.dumps(ev, ensure_ascii=False))

        # 6. Blind review pool
        blind_entry = json.dumps({"user_id": uid, "answer": f"Simulated transferable posttest answer for {uid}"}, ensure_ascii=False)
        await redis.sadd(blind_pool_key(), blind_entry)

    # Set arm counters
    for arm, cnt in arm_counts.items():
        await redis.set(f"research:arm_count:{arm}", cnt)

    print(f"Successfully persisted {len(cohort)} participants to Redis across arms: {arm_counts}")
    await redis.aclose()


async def verify_simulation(redis_url: str = "redis://localhost:6379/0") -> dict[str, Any]:
    """Verifies that the generated dataset satisfies all backend stats and export requirements."""
    from app.research.admin_stats.crosstab import crosstab
    from app.research.admin_stats.experiment import (
        bootstrap_effects,
        effect_estimates,
        four_cell_means,
        manipulation_checks,
    )
    from app.research.admin_stats.filters import StatsFilters
    from app.research.admin_stats.loader import load_cohort
    from app.research.admin_stats.metrics import compute_overview, compute_passive
    from app.research.admin_stats.reliability import compute_reliability

    redis = Redis.from_url(redis_url, decode_responses=True)
    filters = StatsFilters()
    rows, meta = await load_cohort(redis, filters)
    await redis.aclose()

    sim_rows = [r for r in rows if str(r.get("user_id", "")).startswith("sim_user_")]
    print(f"\n--- Simulation Verification Report ---")
    print(f"Total Cohort Rows Loaded: {len(rows)}, Simulated Participants: {len(sim_rows)}")
    assert len(sim_rows) == 400, f"Expected 400 simulated rows, got {len(sim_rows)}"

    # 1. Qualified Activation Cell Means
    cells = four_cell_means(sim_rows, "qualified_activation")
    m00 = cells["cells"]["00"]["mean"]
    m01 = cells["cells"]["01"]["mean"]
    m10 = cells["cells"]["10"]["mean"]
    m11 = cells["cells"]["11"]["mean"]
    print(f"Cell Means (qualified_activation): 00={m00:.2f}, 01={m01:.2f}, 10={m10:.2f}, 11={m11:.2f}")
    assert abs(m00 - 0.12) < 0.01
    assert abs(m01 - 0.35) < 0.01
    assert abs(m10 - 0.30) < 0.01
    assert abs(m11 - 0.78) < 0.01

    # 2. Effects & Bootstrap Interaction Test
    means = {"00": m00, "01": m01, "10": m10, "11": m11}
    effects = effect_estimates(means)
    print(f"Main Effects: ZC={effects['zc_main']:.3f}, ZP={effects['zp_main']:.3f}, Delta_CP={effects['delta_cp']:.3f}")
    assert abs(effects["delta_cp"] - 0.25) < 0.01

    boot = bootstrap_effects(sim_rows, "qualified_activation", n_boot=2000, seed=20261103)
    cp_low = boot["delta_cp"]["low"]
    cp_high = boot["delta_cp"]["high"]
    cp_point = boot["delta_cp"]["point"]
    print(f"Bootstrap 95% CI for Delta_CP: [{cp_low:.4f}, {cp_high:.4f}], Point: {cp_point:.4f}, Unstable: {boot['unstable']}")
    assert cp_low > 0, f"Delta_CP 95% CI must exclude zero! Got low bound {cp_low}"
    assert not boot["unstable"], "Bootstrap must not flag unstable cells"

    # 3. Manipulation Checks
    manip = manipulation_checks(sim_rows)
    zc_cont_pass = manip["zc_c1"]["continuous"] / manip["zc_c1"]["continuous_n"]
    zc_std_pass = manip["zc_c1"]["standard"] / manip["zc_c1"]["standard_n"]
    zp_act_pass = manip["zp_f1"]["active"] / manip["zp_f1"]["active_n"]
    zp_demo_pass = manip["zp_f1"]["demo"] / manip["zp_f1"]["demo_n"]
    print(f"Manipulation Checks: ZC C1 continuous pass={zc_cont_pass:.1%}, standard pass={zc_std_pass:.1%}")
    print(f"Manipulation Checks: ZP F1 active pass={zp_act_pass:.1%}, demo pass={zp_demo_pass:.1%}")
    assert zc_cont_pass >= 0.85 and zc_std_pass >= 0.85
    assert zp_act_pass >= 0.90 and zp_demo_pass >= 0.90

    # 4. Scale Reliability (All 8 Constructs)
    rel = compute_reliability(sim_rows)
    print("\nScale Reliability Metrics:")
    for c in rel["constructs"]:
        metric_name = c["metric"]
        val = c["value"]
        print(f"  - {c['id']} ({metric_name}): {val:.3f} (status={c['status']}, n={c['complete_n']})")
        assert c["status"] == "ok", f"Construct {c['id']} status not ok: {c.get('status')}"
        assert val is not None and val >= 0.75, f"Construct {c['id']} reliability {val} < 0.75"

    print("\nBehavioral Indices Inter-correlation:")
    for b in rel["behavior_indices"]:
        print(f"  - {b['id']} (n={b.get('n', 0)}, status={b.get('status', 'ok')})")
        assert b.get("status") != "empty", f"Behavior index {b['id']} status empty"

    # 5. Overview Funnel & Posttest Rates
    overview = compute_overview(sim_rows, meta)
    print("\nFunnel Conversion:")
    for step in overview["funnel"]:
        pct = f"{step['pct_of_consent']:.1%}" if step["pct_of_consent"] is not None else "N/A"
        print(f"  - {step['step']}: n={step['n']} ({pct})")

    # 6. Passive Metrics
    passive = compute_passive(sim_rows)
    print(f"\nPassive Behavioral Fields Aggregated: {len(passive['fields'])} fields")

    return {
        "n_rows": len(rows),
        "cell_means": means,
        "effects": effects,
        "bootstrap": boot,
        "reliability": rel,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Simulate empirical research data for Edgewise.")
    parser.add_argument("--redis-url", default="redis://localhost:6379/0", help="Redis URL")
    parser.add_argument("--n-per-arm", type=int, default=100, help="Participants per arm (default: 100)")
    parser.add_argument("--seed", type=int, default=20261103, help="Random seed (default: 20261103)")
    args = parser.parse_args()

    print(f"Generating empirical cohort with N = {args.n_per_arm * 4} (seed = {args.seed})...")
    cohort = generate_cohort(n_per_arm=args.n_per_arm, seed=args.seed)

    print("Persisting cohort records into Redis...")
    asyncio.run(persist_cohort_to_redis(cohort, redis_url=args.redis_url))

    print("Verifying cohort statistics against backend research engines...")
    results = asyncio.run(verify_simulation(redis_url=args.redis_url))
    print("\nSimulation and verification completed successfully!")


if __name__ == "__main__":
    main()
