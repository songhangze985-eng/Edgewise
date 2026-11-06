from __future__ import annotations

import io
import json
import unittest
from unittest.mock import patch

from app.services.lgd_multi_agent import (
    AGENT_SANDBOX_PROFILES,
    FAST_TRAINING_SCRIPTS,
    SEAT_ORDER,
    _normalize_openai_completions_url,
    build_isolated_sandbox_context,
    generate_lgd_agent_turn,
)


class TestLgdMultiAgentSandbox(unittest.IsolatedAsyncioTestCase):
    def test_seat_order_and_isolated_profiles(self):
        self.assertEqual([s["seat"] for s in SEAT_ORDER], [1, 2, 3, 4, 5, 6, 7, 8])
        user_seat = next(s for s in SEAT_ORDER if s["id"] == "user")
        self.assertEqual(user_seat["seat"], 4)
        self.assertEqual(len(AGENT_SANDBOX_PROFILES), 7)
        self.assertEqual(len(FAST_TRAINING_SCRIPTS), 6)

    def test_sandbox_context_isolation_and_window_limit(self):
        transcript = [
            {"role": "system", "speaker": "系统", "text": "讨论开始"},
            {"role": "agent", "speaker": "小林", "text": "观点1"},
            {"role": "agent", "speaker": "陈思", "text": "观点2"},
            {"role": "agent", "speaker": "李理", "text": "观点3"},
            {"role": "user", "speaker": "你", "text": "我认为应该优先推进B方案，兼顾ROI与风控", "isUser": True},
            {"role": "agent", "speaker": "王和", "text": "观点5"},
        ]
        ctx = build_isolated_sandbox_context(
            "interrupter",
            topic="AI医疗商业化路径",
            material="某三甲医院试点数据",
            phase="free_discussion",
            transcript=transcript,
            script_id="werewolf_clash",
            memory_state={"memory_enabled": True, "weak_dimensions": ["talk_share"]},
        )
        self.assertEqual(ctx["sandbox_id"], "sbx-5号-interrupter")
        self.assertEqual(ctx["seat_number"], 5)
        self.assertEqual(ctx["context_limit"], 3)
        self.assertEqual(ctx["visible_context_count"], 3)
        self.assertEqual(ctx["script_id"], "werewolf_clash")
        self.assertEqual(ctx["weakness_focus"], "talk_share")
        self.assertIn("优先推进B方案", ctx["last_user_message"])
        # Ensure other agents' hidden agendas are not leaked into interrupter's isolated prompt
        self.assertNotIn(
            AGENT_SANDBOX_PROFILES["logician"]["hidden_agenda"],
            ctx["isolated_system_prompt"],
        )

    def test_openai_url_normalization_and_scheme_guard(self):
        self.assertEqual(
            _normalize_openai_completions_url("https://api.openai.com/v1"),
            "https://api.openai.com/v1/chat/completions",
        )
        self.assertEqual(
            _normalize_openai_completions_url("https://api.openai.com/v1/chat/completions/"),
            "https://api.openai.com/v1/chat/completions",
        )
        with self.assertRaises(ValueError):
            _normalize_openai_completions_url("file:///etc/passwd")
        with self.assertRaises(ValueError):
            _normalize_openai_completions_url("ftp://example.com/v1")

    async def test_generate_lgd_agent_turn_mocked_llm_and_fallback(self):
        class FakeHttpResponse:
            def __init__(self, payload: dict):
                self._raw = json.dumps(payload).encode("utf-8")

            def read(self) -> bytes:
                return self._raw

            def __enter__(self):
                return self

            def __exit__(self, exc_type, exc, tb):
                return False

        captured_urls: list[str] = []

        def fake_urlopen(req, timeout=8.0):
            captured_urls.append(req.full_url)
            return FakeHttpResponse(
                {
                    "choices": [
                        {
                            "message": {
                                "content": "各位，我从3号逻辑框架角度补充一点：先把评估标准收敛到ROI和合规风险两条主线，4号你怎么看？"
                            }
                        }
                    ]
                }
            )

        with patch("urllib.request.urlopen", side_effect=fake_urlopen):
            res = await generate_lgd_agent_turn(
                agent_id="logician",
                topic="出海电商选品策略",
                phase="free_discussion",
                transcript=[{"role": "user", "speaker": "你", "text": "建议先做东南亚市场", "isUser": True}],
                script_id="standard_flow",
                api_key_override="sk-test-key",
                base_url_override="https://llm.example.com/v1/chat/completions",
                model_override="gpt-4o-mini",
            )
        self.assertEqual(res["engine_source"], "llm_multi_agent_sandbox")
        self.assertEqual(captured_urls, ["https://llm.example.com/v1/chat/completions"])
        self.assertIn("ROI和合规风险", res["content"])

        # Empty choices should safely fall back to sandbox_fast_script without crashing
        def fake_empty_urlopen(req, timeout=8.0):
            return FakeHttpResponse({"choices": []})

        with patch("urllib.request.urlopen", side_effect=fake_empty_urlopen):
            fallback_res = await generate_lgd_agent_turn(
                agent_id="timekeeper",
                topic="出海电商选品策略",
                phase="free_discussion",
                transcript=[],
                script_id="convergence_sprint",
                api_key_override="sk-test-key",
                base_url_override="https://llm.example.com/v1",
            )
        self.assertEqual(fallback_res["engine_source"], "sandbox_fast_script")
        self.assertTrue(len(fallback_res["content"]) > 10)

    async def test_lgd_api_endpoints_memory_and_agent_turn(self):
        from types import SimpleNamespace
        from app.api.v1.lgd import (
            LgdAgentTurnRequest,
            LgdMemoryPayload,
            create_lgd_agent_turn,
            get_lgd_memory,
            list_fast_training_scripts,
            save_lgd_memory,
        )

        class FakeRedis:
            def __init__(self):
                self.store = {}

            async def get(self, key: str):
                return self.store.get(key)

            async def set(self, key: str, value: str, ex=None):
                self.store[key] = value
                return True

        fake_redis = FakeRedis()
        fake_user = SimpleNamespace(id="user-42")

        scripts_resp = await list_fast_training_scripts()
        self.assertEqual(len(scripts_resp["scripts"]), 6)
        self.assertEqual(len(scripts_resp["seats"]), 8)
        self.assertEqual(len(scripts_resp["sandboxes"]), 7)

        saved_mem = await save_lgd_memory(
            LgdMemoryPayload(
                memory_enabled=True,
                last_topic="AI医疗辅助诊断商业化",
                user_role="leader",
                script_id="werewolf_clash",
                weak_dimensions=["built_on_others"],
                last_score=84.5,
            ),
            current_user=fake_user,
            redis=fake_redis,
        )
        self.assertEqual(saved_mem.last_topic, "AI医疗辅助诊断商业化")
        self.assertIsNotNone(saved_mem.updated_at)

        loaded_mem = await get_lgd_memory(current_user=fake_user, redis=fake_redis)
        self.assertEqual(loaded_mem.script_id, "werewolf_clash")
        self.assertEqual(loaded_mem.weak_dimensions, ["built_on_others"])

        turn_resp = await create_lgd_agent_turn(
            LgdAgentTurnRequest(
                agent_id="mediator",
                topic="AI医疗辅助诊断商业化",
                phase="free_discussion",
                script_id="werewolf_clash",
                memory_enabled=True,
                turn_index=0,
            ),
            current_user=fake_user,
            redis=fake_redis,
        )
        self.assertEqual(turn_resp["seat_number"], 7)
        self.assertEqual(turn_resp["weakness_focus"], "built_on_others")
        self.assertTrue(len(turn_resp["content"]) > 10)


if __name__ == "__main__":
    unittest.main()
