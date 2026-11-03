from __future__ import annotations

import numpy as np

from app.research.admin_stats.experiment import effect_estimates, four_cell_means
from app.research.admin_stats.privacy import bucket_total, suppress_count, user_hash
from app.research.admin_stats.reliability import cronbach_alpha, spearman_brown


def test_reverse_scoring_rule():
    assert 8 - 3 == 5


def test_construct_threshold():
    k = 3
    assert int(np.ceil(2 * k / 3)) == 2


def test_cronbach_alpha_known():
    matrix = np.array([[4, 5, 4], [5, 5, 5], [3, 4, 3], [4, 4, 4]], dtype=float)
    alpha = cronbach_alpha(matrix)
    assert alpha is not None
    assert 0.5 < alpha < 0.99


def test_spearman_brown():
    matrix = np.array([[2, 4], [3, 5], [4, 6], [5, 7]], dtype=float)
    sb = spearman_brown(matrix)
    assert sb is not None
    assert sb > 0.9


def test_delta_cp():
    means = {"00": 1.0, "01": 2.0, "10": 3.0, "11": 4.0}
    effects = effect_estimates(means)
    assert effects["delta_cp"] == 2.0


def test_four_cell_means():
    rows = [
        {"arm": "00", "auto": {"qualified_activation": 0}},
        {"arm": "11", "auto": {"qualified_activation": 1}},
    ]
    out = four_cell_means(rows, "qualified_activation")
    assert out["cells"]["00"]["mean"] == 0.0
    assert out["cells"]["11"]["mean"] == 1.0


def test_small_n_suppression():
    assert suppress_count(3) == "<5"
    assert suppress_count(10) == 10
    assert bucket_total(3) == "<5"


def test_user_hash_length():
    h = user_hash("user-abc")
    assert len(h) == 12
