from app.services.case_flow import RuleCaseInterviewer, get_case_definition


def test_clarification_match():
    interviewer = RuleCaseInterviewer()
    reply = interviewer.respond_clarification("case_market_size", "目标市场是哪座城市？")
    assert reply["matched"] is True
    assert "城市" in reply["reply"] or "一线" in reply["reply"]


def test_step_checklist_scores():
    interviewer = RuleCaseInterviewer()
    answer = (
        "我先用人群乘以频次乘以单价。假设18-45岁人口约400万，渗透率30%，"
        "年频次20次，客单价25元，得到市场规模约60亿。"
    )
    result = interviewer.evaluate_step("case_market_size", "data", answer)
    assert result["total"] >= 1
    assert isinstance(result.get("score"), (int, float))


def test_case_bank_self_authored():
    definition = get_case_definition("sd_seckill")
    assert definition is not None
    assert "秒杀" in (definition.get("title") or "")
