from __future__ import annotations

import json
import unittest
from types import SimpleNamespace

from app.api.v1.interview import (
    HrPressureProbeRequest,
    LgdFootprintRequest,
    ResumeScreenerRequest,
    create_session_hr_pressure_probe,
    record_session_lgd_footprint,
    run_session_resume_screener,
)
from app.services.recruiting_dossier_service import (
    RESUME_SCREENER_FIXED_PROMPT,
    SCREENER_ARCHITECTURE_ID,
)


class FakeRedis:
    def __init__(self):
        self.store: dict[str, str] = {}

    async def get(self, key: str):
        return self.store.get(key)

    async def set(self, key: str, value: str, ex=None):
        self.store[key] = value
        return True


class TestRecruitingDossierAndHrCrossStageInheritance(unittest.IsolatedAsyncioTestCase):
    async def test_screener_pipeline_and_hr_cross_stage_pressure_probe(self):
        fake_redis = FakeRedis()
        user = SimpleNamespace(id="u-dossier-1", is_admin=False)
        session_id = "sess-funnel-001"
        fake_redis.store[f"session:{session_id}"] = json.dumps(
            {"id": session_id, "user_id": user.id, "metadata": {"mode": "permadeath"}}
        )

        # 1. Stage 0 Resume Release -> Fixed-Prompt AI Resume Screener persists dossier & checklist
        self.assertIn("core_project_tags", RESUME_SCREENER_FIXED_PROMPT)
        dossier = await run_session_resume_screener(
            session_id,
            ResumeScreenerRequest(
                position="AI 产品经理",
                education="计算机硕士",
                core_project="主导核心求职训练漏斗转化重构项目，采用A/B实验与规则引擎使首轮完成率提升28%",
                skills_text="Python、React、FastAPI、SQL",
            ),
            current_user=user,
            redis=fake_redis,
        )
        self.assertEqual(dossier["architecture_id"], SCREENER_ARCHITECTURE_ID)
        self.assertEqual(len(dossier["execution_steps"]), 3)
        self.assertIn("漏斗转化", dossier["core_project_tags"])
        target_stages = [item["target_stage"] for item in dossier["deep_dive_checklist"]]
        self.assertEqual(target_stages, ["biz_1", "biz_2", "hr_final"])

        # 2. Stage 1 LGD -> Records compromise behavior & synthesizes HR opening inheriting Stage 1 + Stage 2
        lgd_out = await record_session_lgd_footprint(
            session_id,
            LgdFootprintRequest(
                position="AI 产品经理",
                init_offer_k=22,
                pressure_mode=True,
                lgd_score=83,
                lgd_transcript=[
                    {
                        "role": "user",
                        "isUser": True,
                        "text": "我建议桥接3号和5号做一个折中妥协方案，兼顾首题转化与标签精准度。",
                    }
                ],
            ),
            current_user=user,
            redis=fake_redis,
        )
        self.assertEqual(lgd_out["lgd_footprint"]["style"], "compromised_bridge")
        self.assertIn("刚才群面时你为什么妥协了那个方案", lgd_out["hr_opening"])
        self.assertIn("继承第1关·简历追问", lgd_out["hr_opening"])

        # 3. HR Final Pressure Probe -> Detects evasive answer vs full cross-stage defense
        evasive = await create_session_hr_pressure_probe(
            session_id,
            HrPressureProbeRequest(
                candidate_answer="我非常看重贵司平台，期望月薪28k，每周能来实习5天。",
                position="AI 产品经理",
                expected_salary_k=28,
                floor_k=20,
            ),
            current_user=user,
            redis=fake_redis,
        )
        self.assertFalse(evasive["addressed_lgd"])
        self.assertIn("刚才群面时你为什么妥协了那个方案", evasive["probe_text"])

        thorough = await create_session_hr_pressure_probe(
            session_id,
            HrPressureProbeRequest(
                candidate_answer=(
                    "刚才群面选择折中妥协是为了在5分钟死线前锁定3号与5号的共识；"
                    "同时复盘第1关简历项目的失误，我们已补齐基线指标监控；未来三年稳定深耕，保证实习6个月。"
                ),
                position="AI 产品经理",
                expected_salary_k=26,
                floor_k=20,
            ),
            current_user=user,
            redis=fake_redis,
        )
        self.assertTrue(thorough["addressed_lgd"])
        self.assertTrue(thorough["addressed_resume"])
        self.assertGreater(thorough["consistency_score"], evasive["consistency_score"])


if __name__ == "__main__":
    unittest.main()
