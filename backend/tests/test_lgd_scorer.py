import unittest

from app.data.dataset_import_seed import SEED_DATASET_QUESTIONS
from app.services.lgd_multi_agent import FAST_TRAINING_SCRIPTS
from app.services.lgd_scorer import score_lgd_discussion
from app.services.lgd_topics import load_lgd_topics


def test_lgd_scorer_no_user_speech():
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


def test_lgd_scorer_user_progress_and_build():
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


class LgdEnhancedSuiteTests(unittest.TestCase):
    def test_scorer_v2_fields(self):
        test_lgd_scorer_no_user_speech()
        test_lgd_scorer_user_progress_and_build()

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

