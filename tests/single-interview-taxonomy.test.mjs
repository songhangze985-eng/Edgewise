import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  NON_STANDARD_QUESTION_TYPES,
  REVERSE_QA_STRATEGIC_PRESETS,
  STANDARD_QUESTION_TYPES,
  buildResumeHandoffJson,
  classifySingleInterviewQuestion,
  generateLocalPostDeepDiveProbes,
  synthesizeLgdReportFromSession,
} from '../src/utils/singleInterviewTaxonomy.js'

describe('Single Interview 60/40 Taxonomy & Context Handoff (lgd_report.json + resume.json)', () => {
  it('defines 4 Standard subtypes (60%) and 5 Non-Standard subtypes (40%)', () => {
    assert.strictEqual(STANDARD_QUESTION_TYPES.length, 4)
    assert.strictEqual(NON_STANDARD_QUESTION_TYPES.length, 5)
    const stdWeight = STANDARD_QUESTION_TYPES.reduce((s, x) => s + x.weight_pct, 0)
    const nonStdWeight = NON_STANDARD_QUESTION_TYPES.reduce((s, x) => s + x.weight_pct, 0)
    assert.strictEqual(stdWeight, 60)
    assert.strictEqual(nonStdWeight, 40)
    assert.ok(REVERSE_QA_STRATEGIC_PRESETS.length >= 3)
  })

  it('classifies all 9 standard and non-standard question archetypes accurately', () => {
    const s1 = classifySingleInterviewQuestion('用 2 分钟介绍一下你自己，重点讲讲和这个岗位最相关的经历。')
    assert.strictEqual(s1.taxonomy_class, 'standard')
    assert.strictEqual(s1.taxonomy_subtype, 'opening_motivation')

    const s2 = classifySingleInterviewQuestion(
      '你简历里写了做过一个多 Agent 模拟面试网站，当时的业务背景是什么？你在里面具体负责哪一块？',
      { type: 'resume_specific' },
    )
    assert.strictEqual(s2.taxonomy_class, 'standard')
    assert.strictEqual(s2.taxonomy_subtype, 'project_deep_dive')
    assert.strictEqual(s2.triggers_post_deep_dive_handoff, true)

    const n2 = classifySingleInterviewQuestion(
      '我觉得你这个功能完全是个伪需求，大厂随便一个通用大模型加个 Prompt 就能替代，你做的这些多 Agent 编排壁垒在哪里？',
    )
    assert.strictEqual(n2.taxonomy_class, 'non_standard')
    assert.strictEqual(n2.taxonomy_subtype, 'stress_rebuttal')

    const n3 = classifySingleInterviewQuestion(
      '刚才在无领导小组讨论里，我注意到第 15 分钟时你们组在商业模式上卡住了，你当时提出了一个方案但被 3 号同学否决了，你当时为什么没有坚持？',
    )
    assert.strictEqual(n3.taxonomy_class, 'non_standard')
    assert.strictEqual(n3.taxonomy_subtype, 'lgd_cross_stage')

    const n4 = classifySingleInterviewQuestion('估算一下北京市每天有多少人在用 AI 工具写周报？')
    assert.strictEqual(n4.taxonomy_class, 'non_standard')
    assert.strictEqual(n4.taxonomy_subtype, 'fermi_estimation')
  })

  it('synthesizes lgd_report.json and triggers lgd_cross_stage + stress_rebuttal probes after Project Deep-Dive', () => {
    const lgdReport = synthesizeLgdReportFromSession({
      transcript: [
        { role: 'user', isUser: true, text: '我同意3号同学，我们先妥协折中一下定价方案。' },
      ],
      topic: 'AI 简历助手商业化方案',
    })
    assert.ok(lgdReport.five_dimensions)
    assert.ok(Array.isArray(lgdReport.behavior_slices))
    assert.strictEqual(lgdReport.behavior_slices[0].timestamp, '12:30')
    assert.strictEqual(lgdReport.behavior_slices[0].weakness, '数据支撑不足')

    const resumeJson = buildResumeHandoffJson({}, 'AI 产品经理')
    const probes = generateLocalPostDeepDiveProbes({
      candidateAnswer: '我负责多 Agent 状态机与 Context Window 裁剪设计。',
      resumeJson,
      lgdReportJson: lgdReport,
    })
    assert.strictEqual(probes.sequence.length, 2)
    assert.strictEqual(probes.lgd_cross_stage_probe.taxonomy_subtype, 'lgd_cross_stage')
    assert.strictEqual(probes.stress_rebuttal_probe.taxonomy_subtype, 'stress_rebuttal')
    assert.ok(probes.lgd_cross_stage_probe.text.includes('12:30'))
    assert.ok(probes.stress_rebuttal_probe.text.includes('伪需求'))
  })
})
