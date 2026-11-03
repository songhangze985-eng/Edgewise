from app.services.experience_sanitize import contains_private_contact, validate_experience_payload


def test_rejects_phone_in_questions():
    try:
        validate_experience_payload(
            company="某厂",
            role="产品",
            stage="技术面",
            date_month="2026-03",
            questions=["你的手机号是 13800138000 吗？"],
        )
        assert False, "expected ValueError"
    except ValueError as exc:
        assert str(exc) == "content_contains_private_contact"


def test_allows_clean_submission():
    validate_experience_payload(
        company="某厂",
        role="产品",
        stage="技术面",
        date_month="2026-03",
        questions=["请介绍一个你主导的需求迭代"],
    )
    assert not contains_private_contact("结构化问题，无联系方式")
