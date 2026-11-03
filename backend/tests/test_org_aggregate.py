import pytest

from app.services.org_aggregate import AGGREGATE_MIN_GROUP_SIZE, SUPPRESSED_REASON, _group_metrics


@pytest.mark.asyncio
async def test_group_metrics_suppressed_below_threshold():
    class FakeRedis:
        pass

    redis = FakeRedis()
    result = await _group_metrics(redis, "org1", ["u1", "u2", "u3"])
    assert result["member_count"] == 3
    assert result["suppressed"] is True
    assert result["suppressed_reason"] == SUPPRESSED_REASON
    assert AGGREGATE_MIN_GROUP_SIZE == 5
