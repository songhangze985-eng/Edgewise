from __future__ import annotations

import asyncio
import json
import unittest
from types import SimpleNamespace
from unittest.mock import patch

from app.api.v1.lgd import (
    LgdAcpStreamRequest,
    LgdBiddingRequest,
    LgdObserverTagRequest,
    LgdRoomSignalRequest,
    compute_room_bidding,
    create_lgd_observer_tag,
    post_room_signal,
    stream_room_agent_turn,
)
from app.services.lgd_acp_engine import (
    ACP_PROTOCOL_VERSION,
    acquire_floor_lock,
    build_reading_warmup_stances,
    compute_psycholinguistic_speech_rate,
    compute_urgency_bids,
    release_floor_lock,
    stream_acp_agent_turn,
)
from app.services.lgd_multi_agent import (
    build_isolated_sandbox_context,
    clean_spoken_lgd_text,
)
from app.services.lgd_observer import evaluate_utterance_side_channel
from app.services.lgd_scorer import score_lgd_discussion


class FakeRedis:
    def __init__(self):
        self.store: dict[str, str] = {}

    async def get(self, key: str):
        return self.store.get(key)

    async def set(self, key: str, value: str, ex=None):
        self.store[key] = value
        return True

    async def delete(self, key: str):
        self.store.pop(key, None)
        return 1


class TestLgdAcpEngine(unittest.IsolatedAsyncioTestCase):
    def test_spoken_text_cleaner_strips_markdown_and_thoughts(self):
        raw = (
            "[思考：指出缺乏量化口径]\n"
            "### 核心建议\n"
            "1. **首先**，我认为需要补齐ROI验收指标；\n"
            "- 其次，明确每周响应时延下降30%的红线。"
        )
        cleaned = clean_spoken_lgd_text(raw)
        self.assertNotIn("思考", cleaned)
        self.assertNotIn("###", cleaned)
        self.assertNotIn("**", cleaned)
        self.assertIn("我认为需要补齐ROI验收指标", cleaned)
        self.assertIn("30%", cleaned)

    def test_kv_cache_prefix_invariance_and_perspective_flip(self):
        t1 = [{"role": "user", "speaker": "你", "senderId": "user", "text": "第一轮发言", "isUser": True}]
        t2 = t1 + [
            {"role": "agent", "speaker": "李理", "senderId": "logician", "text": "我补充指标口径"},
            {"role": "agent", "speaker": "韩抢", "senderId": "interrupter", "text": "不同意温和方案"},
        ]
        ctx1 = build_isolated_sandbox_context(
            "logician",
            topic="远程团队协作效率提升方案",
            material="68%员工反馈同步效率低",
            phase="free_discussion",
            transcript=t1,
            script_id="werewolf_clash",
        )
        ctx2 = build_isolated_sandbox_context(
            "logician",
            topic="远程团队协作效率提升方案",
            material="68%员工反馈同步效率低",
            phase="free_discussion",
            transcript=t2,
            script_id="werewolf_clash",
            visual_board_summary="[MECE逻辑树] | 标准:ROI、成本 | 主线:流程机制:异步站会 | 暂存:纪录片展望",
        )
        # Prefix system prompt must stay byte-identical across turns (even with evolving visual board!) for KV-Cache hit
        self.assertEqual(ctx1["static_prefix_prompt"], ctx2["static_prefix_prompt"])
        # Self utterance is mapped to `assistant`, others + tail visual board summary to `user`
        roles = [m["role"] for m in ctx2["perspective_messages"]]
        self.assertEqual(roles, ["system", "user", "assistant", "user"])
        self.assertIn("[MECE逻辑树]", ctx2["perspective_messages"][-1]["content"])

    def test_heuristic_urgency_bidding_semantics_and_cooldown(self):
        # 1. Time pressure (<25% remaining) boosts Timekeeper (8号·刘时)
        bids_urgent_time = compute_urgency_bids(
            transcript=[
                {"senderId": "idea_king", "speaker": "陈思", "text": "我们可以做异步文档"},
            ],
            script_id="standard_flow",
            remaining_seconds=90,
            total_phase_seconds=600,
            turn_index=4,
        )
        self.assertEqual(bids_urgent_time[0]["agent_id"], "timekeeper")
        # Same speaker cooldown check: idea_king should be at bottom
        idea_bid = next(b for b in bids_urgent_time if b["agent_id"] == "idea_king")
        self.assertLess(idea_bid["urgency"], 1.0)

        # 2. Idealistic / metric-free user statement boosts Interrupter or Logician
        bids_idealistic = compute_urgency_bids(
            transcript=[
                {
                    "senderId": "user",
                    "speaker": "你",
                    "isUser": True,
                    "text": "我觉得全靠团队自觉与企业文化愿景赋能，采购VR设备让大家开心就好。",
                }
            ],
            script_id="anti_teleprompter_probe",
            remaining_seconds=450,
            total_phase_seconds=600,
            turn_index=1,
        )
        self.assertIn(bids_idealistic[0]["agent_id"], ("interrupter", "logician"))
        self.assertGreater(bids_idealistic[0]["urgency"], 8.0)

        # 3. Clash + silent user boosts Mediator (7号·王和)
        bids_clash = compute_urgency_bids(
            transcript=[
                {"senderId": "ice_breaker", "speaker": "小林", "text": "先定三层框架"},
                {"senderId": "idea_king", "speaker": "陈思", "text": "建议无会日"},
                {"senderId": "logician", "speaker": "李理", "text": "必须看ROI"},
                {"senderId": "interrupter", "speaker": "韩抢", "text": "打断一下！太理想了，完全不同意！"},
            ],
            script_id="standard_flow",
            remaining_seconds=420,
            total_phase_seconds=600,
            memory_state={"memory_enabled": True, "weak_dimensions": ["talk_share"]},
            turn_index=3,
        )
        self.assertEqual(bids_clash[0]["agent_id"], "mediator")

    async def test_offline_acp_stream_full_lifecycle(self):
        room_id = "test-room-offline-stream"
        await release_floor_lock(room_id)
        events = []
        async for ev in stream_acp_agent_turn(
            room_id=room_id,
            agent_id=None,
            topic="远程团队协作效率提升方案",
            phase="free_discussion",
            transcript=[
                {"senderId": "user", "speaker": "你", "isUser": True, "text": "建议靠文化自觉推进，不设考核"}
            ],
            script_id="werewolf_clash",
            chunk_delay_sec=0.0,
        ):
            events.append(ev)

        types = [e["type"] for e in events]
        self.assertEqual(types[0], "bidding_round")
        self.assertIn("agent_thought_chunk", types)
        self.assertIn("agent_message_chunk", types)
        self.assertIn("message_final", types)
        final_ev = next(e for e in events if e["type"] == "message_final")
        self.assertEqual(final_ev["protocol"], ACP_PROTOCOL_VERSION)
        self.assertEqual(final_ev["engine_source"], "acp_sandbox_fast_script")
        self.assertTrue(len(final_ev["content"]) > 15)
        self.assertEqual(len(final_ev["message"]["parts"]), 2)

    async def test_typing_lock_blocks_ai_bidding_and_barge_in_aborts_stream(self):
        fake_redis = FakeRedis()
        room_id = "test-room-lock-barge"

        # 1. Typing lock prevents AI from starting free_discussion turn
        await acquire_floor_lock(
            room_id,
            holder="user-1",
            mode="typing_lock",
            ttl_seconds=15,
            interrupt_speaking=False,
            redis=fake_redis,
        )
        locked_events = []
        async for ev in stream_acp_agent_turn(
            room_id=room_id,
            phase="free_discussion",
            redis=fake_redis,
            chunk_delay_sec=0.0,
        ):
            locked_events.append(ev)
        self.assertEqual(len(locked_events), 1)
        self.assertEqual(locked_events[0]["type"], "lock_state")
        self.assertTrue(locked_events[0]["locked"])

        await release_floor_lock(room_id, redis=fake_redis)

        # 2. Mid-speech Barge-in (`grab_mic`) aborts active stream and retains partial_content
        aborted_events = []
        gen = stream_acp_agent_turn(
            room_id=room_id,
            agent_id="interrupter",
            phase="free_discussion",
            redis=fake_redis,
            chunk_delay_sec=0.02,
        )
        async for ev in gen:
            aborted_events.append(ev)
            if ev["type"] == "agent_message_chunk":
                # Human grabs mic right after first spoken phrase chunk
                await acquire_floor_lock(
                    room_id,
                    holder="user-1",
                    mode="grab_mic",
                    ttl_seconds=20,
                    interrupt_speaking=True,
                    redis=fake_redis,
                )

        event_types = [e["type"] for e in aborted_events]
        self.assertIn("turn_aborted", event_types)
        self.assertNotIn("message_final", event_types)
        abort_ev = next(e for e in aborted_events if e["type"] == "turn_aborted")
        self.assertTrue(len(abort_ev["partial_content"]) > 0)
        self.assertEqual(abort_ev["reason"], "grab_mic")
        await release_floor_lock(room_id, redis=fake_redis)

    async def test_mocked_openai_sse_stream_parses_thought_and_message(self):
        sse_lines = [
            b'data: {"choices":[{"delta":{"content":"[\xe6\x80\x9d\xe8\x80\x83\xef\xbc\x9a\xe8\xbf\xbd\xe9\x97\xaeROI\xe9\xaa\x8c\xe6\x94\xb6"}}]}\n\n',
            b'data: {"choices":[{"delta":{"content":"\xe5\x8f\xa3\xe5\xbe\x84]\\n\xe6\x88\x91\xe8\xa1\xa5\xe5\x85\x85\xe4\xb8\x80\xe7\x82\xb9\xef\xbc\x8c"}}]}\n\n',
            b'data: {"choices":[{"delta":{"content":"\xe5\xbf\x85\xe9\xa1\xbb\xe6\x8a\x8a\xe5\x93\x8d\xe5\xba\x94\xe6\x97\xb6\xe5\xbb\xb6\xe9\x99\x8d\xe4\xbd\x8e30%\xe4\xbd\x9c\xe4\xb8\xba\xe7\xa1\xac\xe6\x8c\x87\xe6\xa0\x87\xe3\x80\x82"}}]}\n\n',
            b"data: [DONE]\n\n",
        ]

        class FakeSseHttpResponse:
            def __iter__(self):
                return iter(sse_lines)

            def __enter__(self):
                return self

            def __exit__(self, exc_type, exc, tb):
                return False

        events = []
        with patch("urllib.request.urlopen", return_value=FakeSseHttpResponse()):
            async for ev in stream_acp_agent_turn(
                room_id="test-room-llm-sse",
                agent_id="logician",
                phase="free_discussion",
                api_key_override="sk-test",
                base_url_override="https://llm.example.com/v1",
                chunk_delay_sec=0.0,
            ):
                events.append(ev)

        thought_evs = [e for e in events if e["type"] == "agent_thought_chunk"]
        msg_evs = [e for e in events if e["type"] == "agent_message_chunk"]
        final_ev = next(e for e in events if e["type"] == "message_final")
        self.assertTrue(len(thought_evs) >= 1)
        self.assertIn("追问ROI验收口径", final_ev["thought"])
        self.assertTrue(len(msg_evs) >= 1)
        self.assertEqual(final_ev["engine_source"], "acp_llm_stream")
        self.assertEqual(final_ev["content"], "我补充一点，必须把响应时延降低30%作为硬指标。")

    def test_side_channel_observer_and_competency_radar(self):
        prior = [
            {"role": "agent", "senderId": "digresser", "speaker": "孙偏", "text": "我想到南极科考站的纪录片…"},
        ]
        user_turn = {
            "role": "user",
            "senderId": "user",
            "speaker": "你",
            "isUser": True,
            "phase": "free_discussion",
            "text": "6号孙偏的角度很有趣，不过还剩8分钟，建议拉回主线，结合1号小林和3号李理的观点分两步走，首月目标将响应时延降低30%。",
        }
        tags = evaluate_utterance_side_channel(user_turn, prior, user_role="leader", turn_index=2)
        tag_names = {t["tag"] for t in tags}
        self.assertIn("二阶折中破局", tag_names)
        self.assertIn("温和纠偏控场", tag_names)

        # Board authorization, criteria-first & Parking Lot observer tags
        board_turn = {
            "role": "user",
            "senderId": "user",
            "speaker": "你",
            "isUser": True,
            "phase": "free_discussion",
            "text": "为了方便大家对齐进度，我帮大家开启共享看板实时整理；建议先定三个评判标准，把争议项放入暂存区（Parking Lot）。",
        }
        board_tags = {t["tag"] for t in evaluate_utterance_side_channel(board_turn, [], user_role="leader")}
        self.assertIn("团队授权控屏", board_tags)
        self.assertIn("先立评判标准", board_tags)
        self.assertIn("Parking Lot收纳", board_tags)

        # Pure mechanical timekeeping triggers warning tag
        mech_turn = {
            "role": "user",
            "senderId": "user",
            "speaker": "你",
            "isUser": True,
            "phase": "free_discussion",
            "text": "大家看下时间，现在还剩 5 分钟了。",
        }
        mech_tags = {t["tag"] for t in evaluate_utterance_side_channel(mech_turn, [], user_role="timekeeper")}
        self.assertIn("机械报时预警", mech_tags)

        # Stubbornness & time-dragging side-channel observer warnings + psycholinguistic tempo acceleration
        stub_turn = {
            "role": "user",
            "senderId": "user",
            "speaker": "你",
            "isUser": True,
            "phase": "free_discussion",
            "text": "先别急着收敛，再多聊一会儿！我坚持必须按我的方案，别的方案都不行！",
        }
        stub_tags = {t["tag"] for t in evaluate_utterance_side_channel(stub_turn, [], user_role="member")}
        self.assertIn("固执己见拉扯", stub_tags)
        self.assertIn("拖延空转预警", stub_tags)

        r_fast = compute_psycholinguistic_speech_rate("interrupter", remaining_seconds=580, total_phase_seconds=600)
        r_slow = compute_psycholinguistic_speech_rate("mediator", remaining_seconds=580, total_phase_seconds=600)
        r_urgent = compute_psycholinguistic_speech_rate("mediator", remaining_seconds=40, total_phase_seconds=600)
        self.assertGreater(r_fast["effective_rate"], r_slow["effective_rate"])
        self.assertGreater(r_urgent["effective_rate"], r_slow["effective_rate"])
        self.assertEqual(r_urgent["tempo_stage"], "deadline_sprint")

        # Scorer integration check
        scored = score_lgd_discussion(prior + [user_turn], user_role="leader")
        self.assertEqual(len(scored["competency_radar"]), 5)
        self.assertTrue(len(scored["observer_annotations"]) >= 2)
        self.assertTrue(len(scored["dual_evaluators"]["business_examiner"]["highlights"]) >= 1)

    async def test_fastapi_acp_endpoints(self):
        fake_redis = FakeRedis()
        fake_user = SimpleNamespace(id="user-acp-99")

        warmup = await post_room_signal(
            "room-ep-1",
            LgdRoomSignalRequest(action="reading_warmup", topic="跨境电商选品"),
            current_user=fake_user,
            redis=fake_redis,
        )
        self.assertEqual(len(warmup["stances"]), 7)

        bid_res = await compute_room_bidding(
            "room-ep-1",
            LgdBiddingRequest(
                transcript=[{"senderId": "user", "isUser": True, "text": "建议先不设考核靠自觉"}],
                script_id="werewolf_clash",
            ),
            current_user=fake_user,
            redis=fake_redis,
        )
        self.assertFalse(bid_res["locked"])
        self.assertIsNotNone(bid_res["winner"])

        obs_res = await create_lgd_observer_tag(
            LgdObserverTagRequest(
                utterance={"isUser": True, "text": "赋能抓手闭环组合拳底层逻辑顶层设计"},
                user_role="member",
            ),
            current_user=fake_user,
        )
        self.assertEqual(obs_res["annotations"][0]["tag"], "套话背稿预警")

        class FakeRequest:
            async def is_disconnected(self) -> bool:
                return False

        stream_resp = await stream_room_agent_turn(
            "room-ep-1",
            LgdAcpStreamRequest(phase="personal_statement", agent_id="ice_breaker", api_mode="fast_script_only"),
            request=FakeRequest(),
            current_user=fake_user,
            redis=fake_redis,
        )
        chunks = []
        async for frame in stream_resp.body_iterator:
            chunks.append(frame if isinstance(frame, str) else frame.decode("utf-8"))
        joined_sse = "".join(chunks)
        self.assertIn('"type": "agent_thought_chunk"', joined_sse)
        self.assertIn('"type": "message_final"', joined_sse)

    async def test_seat_randomization_undetermined_identity_claim_and_scoring(self):
        seat_map = {
            "user": 7,
            "ice_breaker": 4,
            "idea_king": 2,
            "logician": 1,
            "interrupter": 8,
            "digresser": 5,
            "mediator": 3,
            "timekeeper": 6,
        }
        undet_roles = {k: "undetermined" for k in seat_map}
        events = []
        async for ev in stream_acp_agent_turn(
            room_id="room-seat-random-1",
            agent_id=None,
            topic="新业务预算裁撤与ROI排序",
            phase="free_discussion",
            transcript=[
                {
                    "role": "user",
                    "senderId": "user",
                    "speaker": "你",
                    "isUser": True,
                    "text": "我承接4号小林和1号李理的思路，建议分两步将转化率提升25%。",
                    "meta": {"claimed_role": "leader"},
                }
            ],
            seat_map=seat_map,
            identity_mode="undetermined",
            participant_roles=undet_roles,
            chunk_delay_sec=0.0,
        ):
            events.append(ev)

        bid_ev = next(e for e in events if e["type"] == "bidding_round")
        final_ev = next(e for e in events if e["type"] == "message_final")
        self.assertTrue(len(bid_ev["speaker_queue"]) >= 1)
        self.assertEqual(final_ev["seat"], seat_map[final_ev["agent_id"]])
        self.assertIsNotNone(final_ev["claimed_role"])
        self.assertIsNotNone(final_ev["claimed_role_label"])

        scored = score_lgd_discussion(
            [
                {"role": "agent", "senderId": "ice_breaker", "speaker": "小林", "text": "我们先定三个评估维度"},
                {
                    "role": "user",
                    "senderId": "user",
                    "speaker": "你",
                    "isUser": True,
                    "text": "我结合4号小林的评估维度补充量化指标：首月将ROI提升25%，还剩5分钟建议先收敛提纲。",
                    "meta": {"claimed_role": "leader"},
                },
            ],
            user_role="undetermined",
        )
        self.assertEqual(scored["role_fit"]["role"], "leader")
        self.assertGreaterEqual(scored["built_on_others"]["count"], 1)


if __name__ == "__main__":
    unittest.main()
