from app.services.consistency_checker import (
    LOW_CONSISTENCY_TIP,
    evaluate_personality_consistency,
)


def test_consistent_pair_scores_high():
    defs = [
        {
            "id": "p01",
            "consistency_pair": "cp1",
            "a_pole": "x",
            "b_pole": "y",
        },
        {
            "id": "p02",
            "consistency_pair": "cp1",
            "a_pole": "x",
            "b_pole": "y",
        },
    ]
    answers = [
        {"id": "p01", "choice": "A"},
        {"id": "p02", "choice": "A"},
    ]
    result = evaluate_personality_consistency(answers, defs)
    assert result["consistency_score"] == 1.0
    assert result["low_consistency"] is False
    assert result["tip"] is None


def test_inconsistent_pair_low_tip_no_correct_answer():
    defs = [
        {
            "id": "p01",
            "consistency_pair": "cp1",
            "a_pole": "x",
            "b_pole": "y",
        },
        {
            "id": "p02",
            "consistency_pair": "cp1",
            "a_pole": "x",
            "b_pole": "y",
        },
    ]
    answers = [
        {"id": "p01", "choice": "A"},
        {"id": "p02", "choice": "B"},
    ]
    result = evaluate_personality_consistency(answers, defs)
    assert result["low_consistency"] is True
    assert result["tip"] == LOW_CONSISTENCY_TIP
    assert "correct" not in str(result).lower()
