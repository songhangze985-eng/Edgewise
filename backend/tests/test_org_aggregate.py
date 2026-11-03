import unittest

try:
    import pytest
except ImportError:  # pragma: no cover
    pytest = None

from app.services.org_aggregate import AGGREGATE_MIN_GROUP_SIZE, SUPPRESSED_REASON, _group_metrics


async def _check_group_metrics_suppressed_below_threshold():
    class FakeRedis:
        pass

    redis = FakeRedis()
    result = await _group_metrics(redis, "org1", ["u1", "u2", "u3"])
    assert result["member_count"] == 3
    assert result["suppressed"] is True
    assert result["suppressed_reason"] == SUPPRESSED_REASON
    assert AGGREGATE_MIN_GROUP_SIZE == 5


if pytest is not None:
    test_group_metrics_suppressed_below_threshold = pytest.mark.asyncio(
        _check_group_metrics_suppressed_below_threshold
    )


class TestOrgAggregate(unittest.IsolatedAsyncioTestCase):
    async def test_group_metrics_suppressed_below_threshold(self):
        await _check_group_metrics_suppressed_below_threshold()

