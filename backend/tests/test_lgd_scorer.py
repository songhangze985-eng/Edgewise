import unittest

from app.data.dataset_import_seed import SEED_DATASET_QUESTIONS
from app.services.lgd_multi_agent import FAST_TRAINING_SCRIPTS
from app.services.lgd_scorer import score_lgd_discussion
from app.services.lgd_topics import build_phases, load_lgd_topics


class LgdEnhancedSuiteTests(unittest.TestCase):
    def test_lgd_scorer_no_user_speech(self):
        metrics = score_lgd_discussion(
            [{"role": "agent", "speaker": "小林", "text": "大家好"}],
            user_role="member",
        )
        assert metrics["spoke"] is False
        assert metrics["talk_share"]["display"] == "未发言"
        assert metrics["overall_score"] is None
        assert metrics["rule_version"] == "lgd_v2"
        assert "role_fit" in metrics
        assert "anti_scripted" in metrics
        assert "dual_evaluators" in metrics

    def test_lgd_scorer_user_progress_and_build(self):
        transcript = [
            {"role": "agent", "speaker": "小林", "text": "我先抛砖引玉，建议按三个维度拆解。"},
            {
                "role": "user",
                "speaker": "你",
                "text": "同意1号小林说的，我补充一点：我们分工一下，你负责调研我来写方案。还剩 5 分钟，建议先收敛前二优先级。",
            },
        ]
        metrics = score_lgd_discussion(transcript, user_role="timekeeper")
        assert metrics["spoke"] is True
        assert metrics["built_on_others"]["value"] >= 1
        assert metrics["progress"]["time_mentions"] >= 1
        assert metrics["role_fit"]["role"] == "timekeeper"
        assert metrics["role_fit"]["score"] >= 70
        assert metrics["anti_scripted"]["scripted_risk"] in ("low", "medium")
        assert metrics["dual_evaluators"]["business_examiner"]["score"] is not None
        assert metrics["dual_evaluators"]["hr_examiner"]["score"] is not None
        assert "agreed_points" in metrics["progressive_summary"]

    def test_scorer_v2_fields(self):
        self.test_lgd_scorer_no_user_speech()
        self.test_lgd_scorer_user_progress_and_build()

    def test_ten_lgd_topics_and_six_scripts(self):
        topics = load_lgd_topics()
        self.assertGreaterEqual(len(topics), 10)
        topic_types = {t.get("topic_type") for t in topics}
        self.assertTrue({"open", "planning", "ranking", "dilemma", "case_debate"}.issubset(topic_types))

        self.assertEqual(len(FAST_TRAINING_SCRIPTS), 6)
        script_ids = {s["id"] for s in FAST_TRAINING_SCRIPTS}
        self.assertIn("anti_teleprompter_probe", script_ids)
        self.assertIn("leader_vacancy_brawl", script_ids)

    def test_dataset_import_seed_loaded(self):
        self.assertEqual(len(SEED_DATASET_QUESTIONS), 50)

    def test_five_stage_phases_criteria_redlines_visual_board_and_followup(self):
        phases = build_phases(20)
        self.assertEqual(len(phases), 5)
        self.assertEqual(phases[-1]["name"], "examiner_followup")

        # High-performing session with Criteria-First, Visual Board, Parking Lot & Stage-5 Follow-up
        good_transcript = [
            {
                "role": "user",
                "isUser": True,
                "speaker": "你",
                "phase": "free_discussion",
                "text": "为了方便大家对齐进度，我开启共享看板实时整理；建议先定三个评判标准：投入产出ROI、止损速度、合规底线。",
            },
            {
                "role": "agent",
                "senderId": "digresser",
                "speaker": "孙偏",
                "phase": "free_discussion",
                "text": "我们不如拍一部南极纪录片做雇主品牌！",
            },
            {
                "role": "user",
                "isUser": True,
                "speaker": "你",
                "phase": "free_discussion",
                "text": "6号孙偏的想法很有创意，我先把它收入看板右侧暂存区（Parking Lot），还剩5分钟我们先收敛P0方案，将响应时延压降30%。",
            },
            {
                "role": "user",
                "isUser": True,
                "speaker": "你",
                "phase": "summary_report",
                "meta": {"summary": True},
                "text": "各位考官好，按全组确立的ROI评判标准，我们一致收敛出短期异步站会与中期看板两步方案，风险预案已闭环。",
            },
            {
                "role": "user",
                "isUser": True,
                "speaker": "你",
                "phase": "examiner_followup",
                "text": "感谢考官追问。若预算砍半，依据团队共同确立的评判标准，我们优先保住P0最小可行闭环，确保首月激活率≥25%。",
            },
        ]
        board = {
            "modelType": "roi_quadrant",
            "authorized": True,
            "alignmentCount": 2,
            "reporterAssistCount": 1,
            "consensusLocked": True,
            "criteria": [{"label": "ROI", "weight": 5}, {"label": "速度", "weight": 4}],
            "quadrant": {"p0": ["异步站会"], "p1": ["量化看板"]},
            "parkingLot": [{"text": "纪录片展望"}],
        }
        res = score_lgd_discussion(
            good_transcript,
            user_role="leader",
            user_was_reporter=True,
            topic_type="dilemma",
            visual_board=board,
        )
        self.assertEqual(res["rule_version"], "lgd_v2")
        self.assertTrue(res["criteria_first"]["established"])
        self.assertEqual(res["team_consensus"]["status"], "converged")
        self.assertEqual(res["redline_audit"]["triggered_count"], 0)
        self.assertTrue(res["visual_board_eval"]["submitted"])
        self.assertGreaterEqual(res["visual_board_eval"]["score"], 85)
        self.assertTrue(res["followup_eval"]["answered"])
        self.assertGreaterEqual(res["followup_eval"]["score"], 85)

        # Redline violation session: direct option jump, mechanical timekeeping only, summary hijack
        bad_transcript = [
            {
                "role": "user",
                "isUser": True,
                "speaker": "你",
                "phase": "free_discussion",
                "text": "我直接选①和②，不用定标准了。",
            },
            {
                "role": "user",
                "isUser": True,
                "speaker": "你",
                "phase": "free_discussion",
                "text": "大家注意一下，现在还剩 5 分钟了。",
            },
            {
                "role": "user",
                "isUser": True,
                "speaker": "你",
                "phase": "summary_report",
                "meta": {"summary": True},
                "text": "虽然刚才大家讨论了A方案，但我个人认为应该推翻重来改成我自己的方案。",
            },
        ]
        bad_res = score_lgd_discussion(bad_transcript, user_role="reporter", topic_type="ranking")
        self.assertTrue(bad_res["criteria_first"]["option_jump_warning"])
        self.assertGreaterEqual(bad_res["redline_audit"]["triggered_count"], 2)
        triggered_keys = {item["key"] for item in bad_res["redline_audit"]["items"] if item["triggered"]}
        self.assertIn("silent_or_mech_time", triggered_keys)
        self.assertIn("summary_hijack", triggered_keys)

    def test_role_weighted_leader_advantage_penalties_final_report_and_listener_notes(self):
        # 1. Identical high-quality leadership transcript achieves higher weighted score under `leader` than `member`
        shared_transcript = [
            {
                "role": "agent",
                "senderId": "ice_breaker",
                "speaker": "小林",
                "phase": "free_discussion",
                "text": "我们讨论一下效率提升思路。",
            },
            {
                "role": "user",
                "isUser": True,
                "speaker": "你",
                "phase": "free_discussion",
                "text": "同意1号小林的方向，我先定三个评判标准并分工一下：前5分钟对齐ROI维度，后5分钟收敛优先级排序并推选汇报人，目标压降时延30%。",
            },
            {
                "role": "agent",
                "senderId": "logician",
                "speaker": "李理",
                "phase": "summary_report",
                "meta": {"summary": True},
                "text": "各位考官好，按全组确立的ROI标准，第一我们落地异步站会，第二补充试点复盘风险预案。",
            },
        ]
        leader_res = score_lgd_discussion(
            shared_transcript,
            user_role="leader",
            visual_board={"authorized": True, "reporterAssistCount": 2, "criteria": [{"label": "ROI"}]},
            listener_notes="[01:20 1号·小林] 效率框架\n【共识】异步站会压降时延30%",
        )
        member_res = score_lgd_discussion(
            shared_transcript,
            user_role="member",
            visual_board={"authorized": True, "reporterAssistCount": 2, "criteria": [{"label": "ROI"}]},
        )
        self.assertEqual(leader_res["role_rubric_breakdown"]["leverage_multiplier"], 1.08)
        self.assertGreater(leader_res["role_rubric_breakdown"]["role_premium"], 0)
        self.assertGreater(leader_res["overall_score"], member_res["overall_score"])

        # 2. Team final report & active listener notes are evaluated even when AI teammate was Reporter
        self.assertTrue(leader_res["final_report_summary"]["delivered"])
        self.assertEqual(leader_res["final_report_summary"]["user_mode"], "copilot_assist")
        self.assertTrue(leader_res["listening_notes_eval"]["active"])
        self.assertGreaterEqual(leader_res["listening_notes_eval"]["note_score"], 68)

        # 3. Silent non-speaker with active notes keeps overall_score=None while earning listening_notes_eval
        silent_listener = score_lgd_discussion(
            [{"role": "agent", "speaker": "小林", "text": "先拆解三层框架"}],
            user_role="member",
            listener_notes="[00:30 1号·小林] 三层框架；【分歧】3号李理与5号韩抢针对考核红线交锋",
        )
        self.assertIsNone(silent_listener["overall_score"])
        self.assertTrue(silent_listener["listening_notes_eval"]["active"])
        self.assertGreaterEqual(silent_listener["listening_notes_eval"]["note_score"], 70)

        # 4. Time-dragging & Stubbornness penalties trigger and deduct score
        stubborn_drag_transcript = [
            {
                "role": "user",
                "isUser": True,
                "speaker": "你",
                "phase": "free_discussion",
                "text": "先别急着收敛，再多聊一会儿不用管时间！我坚持必须按我的方案执行，别的方案都不行，绝不退让！",
            }
        ]
        penalized = score_lgd_discussion(stubborn_drag_transcript, user_role="member")
        pen_keys = {r["key"] for r in penalized["redline_audit"]["items"] if r["triggered"]}
        self.assertIn("time_dragging", pen_keys)
        self.assertIn("stubborn_rigidity", pen_keys)
        self.assertLessEqual(penalized["redline_audit"]["penalty_total"], -10)

    def test_three_examiner_panel_five_dim_rubric_and_calibration_meeting(self):
        # 1. High-performing candidate: MECE + conclusion-first + teammate build-on + timekeeper duty
        strong_transcript = [
            {
                "role": "agent",
                "senderId": "ice_breaker",
                "speaker": "小林",
                "phase": "personal_statement",
                "elapsed_seconds": 25,
                "text": "我们先把痛点和举措分两层来看。",
            },
            {
                "role": "user",
                "isUser": True,
                "speaker": "你",
                "phase": "free_discussion",
                "elapsed_seconds": 95,
                "text": "我的核心结论是先确立三个评判标准：第一ROI成本，第二两周见效速度，第三风控底线。我补充1号小林的观点，现在还剩5分钟，建议按权重收敛优先级排序，目标压降流失率30%。",
            },
            {
                "role": "agent",
                "senderId": "digresser",
                "speaker": "孙偏",
                "phase": "free_discussion",
                "elapsed_seconds": 160,
                "text": "要不我们顺便拍个南极纪录片做元宇宙宣传？",
            },
            {
                "role": "user",
                "isUser": True,
                "speaker": "你",
                "phase": "free_discussion",
                "elapsed_seconds": 190,
                "text": "同意6号孙偏创意有亮点，我们先温和放入Parking Lot暂存区拉回主线；结合3号李理的口径折中分两步推进。",
            },
            {
                "role": "user",
                "isUser": True,
                "speaker": "你",
                "phase": "summary_report",
                "elapsed_seconds": 410,
                "meta": {"summary": True},
                "text": "各位考官好，代表全组总结核心结论：按ROI与速度标准，短期落地P0异步站会压降流失30%，长期储备暂存区方案，风险预案为双周复盘止损。",
            },
        ]
        res_8in3 = score_lgd_discussion(
            strong_transcript,
            user_role="leader",
            user_was_reporter=True,
            advancement_quota=3,
            seat_map={"user": 6, "interrupter": 5, "logician": 3, "ice_breaker": 1},
            participant_roles={"user": "leader"},
            visual_board={"authorized": True, "consensusLocked": True, "criteria": [{"label": "ROI"}, {"label": "速度"}]},
        )

        # Verify 5-dimension weighted rubric matrix sums to 1.00 (30/25/20/15/10)
        rubric = res_8in3["five_dim_rubric"]
        self.assertEqual(rubric["weights_sum"], 1.0)
        self.assertEqual(
            [d["weight"] for d in rubric["dimensions"]],
            [0.30, 0.25, 0.20, 0.15, 0.10],
        )
        self.assertFalse(rubric["vetoed"])
        self.assertGreaterEqual(rubric["weighted_total"], 82.0)

        # Verify 3-examiner panel & Zone Watch sector (seat 6 -> [5,6,7,8])
        panel = res_8in3["examiner_panel"]
        self.assertEqual(panel["zone_observer_a"]["watched_seats"], [5, 6, 7, 8])
        self.assertGreaterEqual(panel["milestone_scribe_b"]["milestone_hits"], 3)
        self.assertGreaterEqual(len(res_8in3["milestone_ledger"]), 4)

        # Verify Calibration 8-seat leaderboard, 5号韩抢 vetoed, and user promoted in 8进3
        cal = res_8in3["calibration"]
        self.assertEqual(cal["ratio_label"], "8进3")
        self.assertEqual(len(cal["dialogue"]), 4)
        self.assertEqual(len(cal["leaderboard"]), 8)
        self.assertTrue(cal["user_promoted"])
        self.assertLessEqual(cal["user_rank"], 3)
        interrupter_row = next(r for r in cal["leaderboard"] if r["participant_id"] == "interrupter")
        self.assertTrue(interrupter_row["vetoed"])
        self.assertFalse(interrupter_row["promoted"])

        # 2. Candidate claiming Timer without checking clock + triggering harsh attack/stubborn One-Vote Veto
        veto_transcript = [
            {
                "role": "user",
                "isUser": True,
                "speaker": "你",
                "phase": "free_discussion",
                "text": "别说了你完全错了！你懂不懂业务？我坚持必须按我的方案来，绝不退让！",
            }
        ]
        veto_res = score_lgd_discussion(
            veto_transcript,
            user_role="timekeeper",
            advancement_quota=2,
            seat_map={"user": 2},
            participant_roles={"user": "timekeeper"},
        )
        self.assertEqual(veto_res["examiner_panel"]["zone_observer_a"]["watched_seats"], [1, 2, 3, 4])
        self.assertTrue(veto_res["five_dim_rubric"]["vetoed"])
        self.assertTrue(veto_res["calibration"]["user_vetoed"])
        self.assertFalse(veto_res["calibration"]["user_promoted"])
        self.assertEqual(veto_res["calibration"]["ratio_label"], "8进2")
        role_dim = next(d for d in veto_res["five_dim_rubric"]["dimensions"] if d["key"] == "role_contribution")
        self.assertTrue(any("Timer" in m for m in role_dim["triggered_minefields"]))



