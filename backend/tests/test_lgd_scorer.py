from app.services.lgd_scorer import score_lgd_discussion


def test_lgd_scorer_no_user_speech():
    metrics = score_lgd_discussion(
        [{"role": "agent", "speaker": "小林", "text": "大家好"}],
        user_role="member",
    )
    assert metrics["spoke"] is False
    assert metrics["talk_share"]["display"] == "未发言"
    assert metrics["overall_score"] is None


def test_lgd_scorer_user_progress_and_build():
    transcript = [
        {"role": "user", "speaker": "你", "text": "同意小林说的，我补充一点：我们分工一下，你负责调研我来写方案。还剩 5 分钟。"},
    ]
    metrics = score_lgd_discussion(transcript, user_role="timekeeper")
    assert metrics["spoke"] is True
    assert metrics["built_on_others"]["value"] >= 1
    assert metrics["progress"]["time_mentions"] >= 1
