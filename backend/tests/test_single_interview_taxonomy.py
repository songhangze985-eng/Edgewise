import unittest

from app.services.reverse_question_scorer import score_reverse_question
from app.services.single_interview_taxonomy import (
    NON_STANDARD_QUESTION_TYPES,
    STANDARD_QUESTION_TYPES,
    build_60_40_curated_question_plan,
    build_lgd_report_json,
    build_resume_handoff_json,
    classify_single_interview_question,
    evaluate_subtype_answer_signals,
    generate_post_deep_dive_handoff_probes,
    get_single_interview_taxonomy_catalog,
)


class SingleInterviewTaxonomyTests(unittest.TestCase):
    def test_60_40_catalog_weights_and_subtypes(self):
        catalog = get_single_interview_taxonomy_catalog()
        self.assertEqual(catalog["weights"]["standard_pct"], 60)
        self.assertEqual(catalog["weights"]["non_standard_pct"], 40)
        self.assertEqual(len(STANDARD_QUESTION_TYPES), 4)
        self.assertEqual(len(NON_STANDARD_QUESTION_TYPES), 5)

        std_weight = sum(item["weight_pct"] for item in STANDARD_QUESTION_TYPES)
        non_std_weight = sum(item["weight_pct"] for item in NON_STANDARD_QUESTION_TYPES)
        self.assertEqual(std_weight, 60)
        self.assertEqual(non_std_weight, 40)

    def test_question_classification_across_all_nine_subtypes(self):
        c1 = classify_single_interview_question("用 2 分钟介绍一下你自己，重点讲讲和这个岗位最相关的经历。")
        self.assertEqual(c1["taxonomy_class"], "standard")
        self.assertEqual(c1["taxonomy_subtype"], "opening_motivation")

        c2 = classify_single_interview_question(
            "你简历里写了做过一个多 Agent 模拟面试网站，当时的业务背景是什么？你在里面具体负责哪一块？",
            qtype="resume_specific",
        )
        self.assertEqual(c2["taxonomy_class"], "standard")
        self.assertEqual(c2["taxonomy_subtype"], "project_deep_dive")
        self.assertTrue(c2["triggers_post_deep_dive_handoff"])

        c3 = classify_single_interview_question(
            "在搭建 Agent 工作流时，你是怎么控制上下文窗口（Context Window）和降低响应延迟的？怎么评估生成结果的好坏（Eval）？"
        )
        self.assertEqual(c3["taxonomy_class"], "standard")
        self.assertEqual(c3["taxonomy_subtype"], "domain_knowledge")

        c4 = classify_single_interview_question("讲一次你和团队成员意见严重不一致的经历，最后怎么解决的？")
        self.assertEqual(c4["taxonomy_class"], "standard")
        self.assertEqual(c4["taxonomy_subtype"], "behavioral")

        n1 = classify_single_interview_question(
            "假设现在老板让你在 2 周内上线一个面向应届生的 AI 简历修改助手，没有额外预算，你怎么设计 MVP（最小可行性产品）？"
        )
        self.assertEqual(n1["taxonomy_class"], "non_standard")
        self.assertEqual(n1["taxonomy_subtype"], "case_scenario")

        n2 = classify_single_interview_question(
            "我觉得你这个功能完全是个伪需求，大厂随便一个通用大模型加个 Prompt 就能替代，你做的这些多 Agent 编排壁垒在哪里？"
        )
        self.assertEqual(n2["taxonomy_class"], "non_standard")
        self.assertEqual(n2["taxonomy_subtype"], "stress_rebuttal")

        n3 = classify_single_interview_question(
            "刚才在无领导小组讨论里，我注意到第 15 分钟时你们组在商业模式上卡住了，你当时提出了一个方案但被 3 号同学否决了，你当时为什么没有坚持？"
        )
        self.assertEqual(n3["taxonomy_class"], "non_standard")
        self.assertEqual(n3["taxonomy_subtype"], "lgd_cross_stage")

        n4 = classify_single_interview_question("估算一下北京市每天有多少人在用 AI 工具写周报？")
        self.assertEqual(n4["taxonomy_class"], "non_standard")
        self.assertEqual(n4["taxonomy_subtype"], "fermi_estimation")

        n5 = classify_single_interview_question("我这边的问题问完了，你有什么想问我的吗？")
        self.assertEqual(n5["taxonomy_class"], "non_standard")
        self.assertEqual(n5["taxonomy_subtype"], "reverse_qa")

    def test_context_handoff_lgd_report_and_post_deep_dive_probes(self):
        lgd_transcript = [
            {"role": "agent", "speaker": "李理", "text": "我认为免费模式不可持续，必须收订阅费。"},
            {"role": "user", "speaker": "你", "text": "同意3号李理说的，我折中一下先按他的商业模式定价方案推进。", "isUser": True},
        ]
        lgd_report = build_lgd_report_json(lgd_transcript, {"overall_score": 82.0}, topic="AI产品商业化路径")
        self.assertIn("five_dimensions", lgd_report)
        self.assertGreaterEqual(len(lgd_report["behavior_slices"]), 1)
        first_slice = lgd_report["behavior_slices"][0]
        self.assertIn("timestamp", first_slice)
        self.assertIn("event", first_slice)
        self.assertIn("weakness", first_slice)

        resume_json = build_resume_handoff_json()
        handoff = generate_post_deep_dive_handoff_probes(
            candidate_answer="我独立负责了多 Agent 沙箱和 SSE 流式推送。",
            resume_json=resume_json,
            lgd_report_json=lgd_report,
        )
        self.assertEqual(len(handoff["sequence"]), 2)
        self.assertEqual(handoff["lgd_cross_stage_probe"]["taxonomy_subtype"], "lgd_cross_stage")
        self.assertEqual(handoff["stress_rebuttal_probe"]["taxonomy_subtype"], "stress_rebuttal")
        self.assertIn(first_slice["timestamp"], handoff["lgd_cross_stage_probe"]["text"])
        self.assertIn("伪需求", handoff["stress_rebuttal_probe"]["text"])

    def test_60_40_curated_plan_and_subtype_rubrics(self):
        plan = build_60_40_curated_question_plan(position="AI 产品经理")
        self.assertEqual(len(plan), 8)
        std_items = [q for q in plan if q["taxonomy_class"] == "standard"]
        non_std_items = [q for q in plan if q["taxonomy_class"] == "non_standard"]
        self.assertEqual(len(std_items), 4)
        self.assertEqual(len(non_std_items), 4)

        fermi_eval = evaluate_subtype_answer_signals(
            "北京市常住人口约2100万，其中职场白领约800万，需要写周报的比例约60%，AI渗透率按25%算，每周写1次除以5个工作日，日均约24万人。",
            subtype="fermi_estimation",
        )
        self.assertGreaterEqual(fermi_eval["rubric_bonus"], 6.0)

        high_rev = score_reverse_question("团队目前在 AI 落地中遇到的最大业务痛点是什么？")
        self.assertEqual(high_rev["category"], "strategic_pain_point")
        self.assertGreaterEqual(high_rev["score"], 92.0)

        low_rev = score_reverse_question("请问公司平时几点下班？")
        self.assertEqual(low_rev["category"], "superficial_perk")
        self.assertLessEqual(low_rev["score"], 45.0)


if __name__ == "__main__":
    unittest.main()
