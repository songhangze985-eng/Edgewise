/**
 * Single Interview (1v1) 60/40 Question Taxonomy & Agent Context Handoff (`lgd_report.json` + `resume.json`).
 *
 * Implements:
 *  1. 60% Standard Questions (STAR / 5W2H structured evaluation, 4 subtypes):
 *     - `opening_motivation` (① 破冰与动机类)
 *     - `project_deep_dive`  (② 简历项目深挖类 —— 核心主战场)
 *     - `domain_knowledge`   (③ 专业基础与工具认知类)
 *     - `behavioral`         (④ 行为面试类)
 *  2. 40% Non-Standard Questions (SP Offer differentiator, dynamic follow-up & stress testing, 5 subtypes):
 *     - `case_scenario`      (① 开放式业务场景题)
 *     - `stress_rebuttal`    (② 压力追问与极限反驳题)
 *     - `lgd_cross_stage`    (③ 跨环节联动追问 —— 群面晋级专属)
 *     - `fermi_estimation`   (④ 费米估算 / 脑筋急转弯)
 *     - `reverse_qa`         (⑤ 反向提问环节 —— 隐藏加分项)
 *  3. Context Handoff (`lgd_report.json` + `resume.json` -> Single Interview):
 *     - Automatically triggers 1 `lgd_cross_stage` probe + 1 `stress_rebuttal` probe right after `project_deep_dive`.
 */

export const LGD_REPORT_HANDOFF_STORAGE_KEY = 'edgewise.context_handoff.lgd_report.v1'

export const STANDARD_QUESTION_TYPES = [
  {
    subtype: 'opening_motivation',
    code: 'S1',
    taxonomy_class: 'standard',
    weight_pct: 15,
    name: '① 破冰与动机类（Opening & Motivation）',
    short_label: '① 破冰与动机',
    framework: 'STAR / 2分钟高密度锚定',
    typical_prompt:
      '用 2 分钟介绍一下你自己，重点讲讲和这个岗位最相关的经历。为什么想来我们团队做 AI 应用/产品实习，而不是走传统算法研发？',
    assessment_points: '信息提炼能力、求职动机是否纯粹',
  },
  {
    subtype: 'project_deep_dive',
    code: 'S2',
    taxonomy_class: 'standard',
    weight_pct: 20,
    name: '② 简历项目深挖类（Project Deep-Dive —— 核心主战场）',
    short_label: '② 简历项目深挖',
    framework: 'STAR + 剥洋葱核查水分',
    triggers_post_deep_dive_handoff: true,
    typical_prompt:
      '你简历里写了做过一个多 Agent 模拟面试网站，当时的业务背景是什么？你在里面具体负责哪一块？遇到最大的技术或交互卡点是什么，最后怎么解决的？',
    assessment_points: '剥洋葱式核查水分，区分“你做的”还是“团队做的”',
  },
  {
    subtype: 'domain_knowledge',
    code: 'S3',
    taxonomy_class: 'standard',
    weight_pct: 15,
    name: '③ 专业基础与工具认知类（Domain Knowledge）',
    short_label: '③ 专业与工具认知',
    framework: '5W2H + 工程落地权衡',
    typical_prompt:
      '在搭建 Agent 工作流时，你是怎么控制上下文窗口（Context Window）和降低响应延迟的？怎么评估生成结果的好坏（Eval）？',
    assessment_points: '是否具备实战工程/产品落地经验，而非纸上谈兵',
  },
  {
    subtype: 'behavioral',
    code: 'S4',
    taxonomy_class: 'standard',
    weight_pct: 10,
    name: '④ 行为面试类（Behavioral Questions）',
    short_label: '④ 行为与失败复盘',
    framework: 'STAR + 根因内省',
    typical_prompt:
      '讲一次你和团队成员意见严重不一致的经历，最后怎么解决的？或者讲一个你做过的最失败的项目，复盘一下原因。',
    assessment_points: '复盘能力、协作性格、是否习惯甩锅',
  },
]

export const NON_STANDARD_QUESTION_TYPES = [
  {
    subtype: 'case_scenario',
    code: 'N1',
    taxonomy_class: 'non_standard',
    weight_pct: 10,
    name: '① 开放式业务场景题（Case Study / Scenario Simulation）',
    short_label: '① 开放业务场景 MVP',
    framework: '0到1架构 + Trade-off + 冷启动',
    typical_prompt:
      '假设现在老板让你在 2 周内上线一个面向应届生的 AI 简历修改助手，没有额外预算，你怎么设计 MVP（最小可行性产品）？核心指标看什么？怎么冷启动前 1000 个种子用户？',
    assessment_points: '从 0 到 1 的架构能力、资源取舍（Trade-off）思维、数据敏感度',
  },
  {
    subtype: 'stress_rebuttal',
    code: 'N2',
    taxonomy_class: 'non_standard',
    weight_pct: 10,
    name: "② 压力追问与极限反驳题（Stress Testing / Devil's Advocate）",
    short_label: '② 压力否定追问',
    framework: '情绪稳定 + 差异化壁垒防守反击',
    typical_prompt:
      '（在听完你的项目介绍后突然打断）我觉得你这个功能完全是个伪需求，大厂随便一个通用大模型加个 Prompt 就能替代，你做的这些多 Agent 编排壁垒在哪里？有什么商业价值？',
    assessment_points:
      '情绪稳定性（是否慌乱或愤怒）、能否在被否定后依然保持逻辑自洽并给出有理有据的防守反击',
  },
  {
    subtype: 'lgd_cross_stage',
    code: 'N3',
    taxonomy_class: 'non_standard',
    weight_pct: 10,
    name: '③ 跨环节联动追问（LGD 表现回溯 —— 群面晋级专属）',
    short_label: '③ LGD跨环节联动追问',
    framework: '还原局势 + 策略性妥协 vs 退缩辨析',
    typical_prompt:
      '刚才在无领导小组讨论里，我注意到第 15 分钟时你们组在商业模式上卡住了，你当时提出了一个方案但被 3 号同学否决了，你当时为什么没有坚持？你觉得他那个方案真的比你好吗？',
    assessment_points: '自我觉察力、对局势的真实判断（考察当时是“顾全大局的妥协”还是“没底气的退缩”）',
  },
  {
    subtype: 'fermi_estimation',
    code: 'N4',
    taxonomy_class: 'non_standard',
    weight_pct: 5,
    name: '④ 费米估算 / 脑筋急转弯（Fermi Estimation —— 偶发）',
    short_label: '④ 费米估算拆解',
    framework: '总人口 → 白领比例 → 周报比例 → AI渗透率 → 日活频次',
    typical_prompt: '估算一下北京市每天有多少人在用 AI 工具写周报？',
    assessment_points:
      '不看最终数字准不准，只看拆解逻辑（总人口 -> 职场白领比例 -> 需写周报比例 -> AI 渗透率 -> 日活频次）',
  },
  {
    subtype: 'reverse_qa',
    code: 'N5',
    taxonomy_class: 'non_standard',
    weight_pct: 5,
    name: '⑤ 反向提问环节（Reverse Q&A —— 隐藏加分项）',
    short_label: '⑤ 反向提问（隐藏加分）',
    framework: '业务痛点探询 + 团队战略对齐',
    typical_prompt: '我这边的问题问完了，你有什么想问我的吗？',
    assessment_points:
      '好奇心与思考深度（问“公司几点下班”是减分，问“团队目前在 AI 落地中遇到的最大业务痛点是什么”是强加分）',
  },
]

export const ALL_SUBTYPE_MAP = Object.fromEntries(
  [...STANDARD_QUESTION_TYPES, ...NON_STANDARD_QUESTION_TYPES].map((item) => [item.subtype, item]),
)

export const REVERSE_QA_STRATEGIC_PRESETS = [
  {
    label: '🔥 强加分 · 业务痛点',
    question: '团队目前在 AI 落地与多 Agent 业务闭环中遇到的最大业务痛点是什么？',
    hint: '直击业务痛点与技术卡点，展现强好奇心与 Owner 意识',
  },
  {
    label: '🎯 加分 · 90天SP标准',
    question: '如果我有幸加入团队，前 90 天衡量我拿到高评级（SP）的核心北极星指标是什么？',
    hint: '锚定可量化交付预期与结果导向',
  },
  {
    label: '🧭 加分 · 架构演进',
    question: '在控制 Agent 上下文窗口（Context Window）成本与提升复杂场景准确率之间，团队目前的重心偏向哪一侧？',
    hint: '体现工程权衡（Trade-off）思维深度',
  },
]

export function classifySingleInterviewQuestion(title = '', qMeta = null) {
  if (qMeta?.taxonomy_subtype && ALL_SUBTYPE_MAP[qMeta.taxonomy_subtype]) {
    const spec = ALL_SUBTYPE_MAP[qMeta.taxonomy_subtype]
    return buildTaxonomyMeta(spec)
  }
  const t = String(title || qMeta?.title || '').trim()
  const qtype = String(qMeta?.type || '').trim()
  const category = String(qMeta?.category || '').trim()

  if (/无领导小组|群面|3\s*号|5\s*号|刚才在.*讨论里|为什么没有坚持|妥协了/.test(t)) {
    return buildTaxonomyMeta(ALL_SUBTYPE_MAP.lgd_cross_stage)
  }
  if (/估算一下|费米|每天有多少人|多少家|Fermi/i.test(t)) {
    return buildTaxonomyMeta(ALL_SUBTYPE_MAP.fermi_estimation)
  }
  if (/伪需求|通用大模型加个\s*Prompt|壁垒在哪里|有什么商业价值|突然打断|Devil/i.test(t) || category === '压力题') {
    return buildTaxonomyMeta(ALL_SUBTYPE_MAP.stress_rebuttal)
  }
  if (/假设现在老板让你|2\s*周内上线|MVP|最小可行性产品|冷启动前\s*1000/i.test(t) || category === '案例分析') {
    return buildTaxonomyMeta(ALL_SUBTYPE_MAP.case_scenario)
  }
  if (/有什么想问我的|反问环节/.test(t)) {
    return buildTaxonomyMeta(ALL_SUBTYPE_MAP.reverse_qa)
  }
  if (/介绍一下你自己|自我介绍|为什么想来我们团队|为什么选择应聘|求职动机/.test(t)) {
    return buildTaxonomyMeta(ALL_SUBTYPE_MAP.opening_motivation)
  }
  if (
    qtype === 'resume_specific' ||
    /简历里写|做过一个|具体负责哪一块|具体独立负责|最大的技术或交互卡点|主导的项目/.test(t)
  ) {
    return buildTaxonomyMeta(ALL_SUBTYPE_MAP.project_deep_dive)
  }
  if (/意见严重不一致|最失败的项目|解决冲突|复盘一下原因/.test(t) || category === '行为题') {
    return buildTaxonomyMeta(ALL_SUBTYPE_MAP.behavioral)
  }
  return buildTaxonomyMeta(ALL_SUBTYPE_MAP.domain_knowledge)
}

function buildTaxonomyMeta(spec) {
  const isStd = spec.taxonomy_class === 'standard'
  const prefix = isStd ? '60% 标准题' : '40% 非标准题'
  return {
    taxonomy_class: spec.taxonomy_class,
    taxonomy_subtype: spec.subtype,
    taxonomy_code: spec.code,
    taxonomy_name: spec.name,
    taxonomy_badge: `${prefix} · ${spec.short_label}`,
    weight_group: isStd ? '60%_standard' : '40%_non_standard',
    framework: spec.framework,
    assessment_points: spec.assessment_points,
    triggers_post_deep_dive_handoff: Boolean(spec.triggers_post_deep_dive_handoff),
  }
}

export function synthesizeLgdReportFromSession({
  transcript = [],
  lgdMetrics = null,
  topic = '远程团队协作与商业化方案',
  roomId = null,
  userRole = 'member',
  userSeat = 4,
} = {}) {
  if (lgdMetrics?.lgd_report?.behavior_slices?.length) {
    return lgdMetrics.lgd_report
  }
  const dims = lgdMetrics?.dimensions_suggested || {}
  const five_dimensions = {
    expression: dims.expression ?? lgdMetrics?.talk_share_score ?? 78,
    logic: dims.logic ?? 80,
    teamwork: dims.teamwork ?? lgdMetrics?.built_on_others_score ?? 82,
    leadership: dims.leadership ?? lgdMetrics?.progress_score ?? 76,
    authenticity: lgdMetrics?.anti_scripted?.authenticity_score ?? 84,
  }

  const userTurns = (transcript || []).filter(
    (m) => (m.isUser || m.role === 'user' || m.senderId === 'user') && (m.text || m.content),
  )

  const behavior_slices = []
  if (userTurns.length > 0) {
    userTurns.slice(0, 2).forEach((msg, idx) => {
      const txt = String(msg.text || msg.content || '').trim()
      const hasData = /\d+(?:\.\d+)?\s*(?:%|万|倍|ms|秒|天|人|元)/.test(txt)
      const mm = 12 + idx * 3
      const ss = idx === 0 ? '30' : '00'
      behavior_slices.push({
        timestamp: `${mm}:${ss}`,
        seat_clash: idx === 0 ? '3号同学（逻辑王·李理）' : '5号同学（抢话者·韩抢）',
        event: /折中|妥协|同意|兼顾|分两步/.test(txt)
          ? '妥协了核心定价与商业模式策略'
          : '商业模式卡住时未坚持原方案，被3号同学质疑后退让',
        weakness: hasData ? '破局控场坚持度不足' : '数据支撑不足',
        quote: txt.slice(0, 56),
      })
    })
  }

  if (behavior_slices.length === 0) {
    behavior_slices.push({
      timestamp: '12:30',
      seat_clash: '3号同学（逻辑王·李理）',
      event: '妥协了核心定价策略',
      weakness: '数据支撑不足',
      quote: '在商业模式争论中未亮出量化 ROI 数据闭环，顺从了 3 号同学的折中提议',
    })
  }

  return {
    schema_version: 'edgewise.lgd_report.v1',
    generated_at: new Date().toISOString(),
    room_id: roomId,
    topic: topic || '远程团队协作与商业化方案',
    user_role: userRole || 'member',
    user_seat: userSeat || 4,
    overall_score: lgdMetrics?.overall_score ?? 81.0,
    five_dimensions,
    behavior_slices,
  }
}

export function saveLgdReportHandoff(lgdReport) {
  if (!lgdReport) return null
  try {
    localStorage.setItem(LGD_REPORT_HANDOFF_STORAGE_KEY, JSON.stringify(lgdReport))
  } catch {
    /* ignore */
  }
  return lgdReport
}

export function loadLgdReportHandoff() {
  try {
    const raw = localStorage.getItem(LGD_REPORT_HANDOFF_STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (parsed && Array.isArray(parsed.behavior_slices)) return parsed
    }
  } catch {
    /* ignore */
  }
  return synthesizeLgdReportFromSession()
}

export function buildResumeHandoffJson(resumeState = {}, position = 'AI 产品经理 / Agent 应用工程师') {
  const parsed = resumeState?.parsedData || {}
  const projects = parsed.projects || []
  let projectTitle = ''
  let projectSummary = ''
  if (projects.length > 0 && typeof projects[0] === 'object') {
    projectTitle = projects[0].name || projects[0].title || ''
    projectSummary = projects[0].description || projects[0].summary || ''
  }
  if (!projectTitle) {
    projectTitle = resumeState?.fileName
      ? `${resumeState.fileName.replace(/\.[^.]+$/, '')} · 多 Agent 模拟面试网站`
      : '多 Agent 模拟面试网站（谈锋 Edgewise）'
    projectSummary =
      '搭建多 Agent 群面沙箱与 1v1 状态流转工作流，控制 Context Window 并通过流式调度压降响应延迟。'
  }
  return {
    schema_version: 'edgewise.resume_handoff.v1',
    resume_id: resumeState?.resumeId || null,
    position: position || 'AI 产品经理 / Agent 应用工程师',
    project_title: projectTitle,
    project_summary: projectSummary,
  }
}

export function generateLocalPostDeepDiveProbes({
  candidateAnswer = '',
  resumeJson = null,
  lgdReportJson = null,
} = {}) {
  const resObj = resumeJson || buildResumeHandoffJson()
  const lgdObj = lgdReportJson || loadLgdReportHandoff()
  const slice = lgdObj?.behavior_slices?.[0] || {
    timestamp: '12:30',
    seat_clash: '3号同学（逻辑王·李理）',
    event: '妥协了核心定价策略',
    weakness: '数据支撑不足',
  }

  const ts = slice.timestamp || '12:30'
  const event = slice.event || '妥协了核心定价策略'
  const weakness = slice.weakness || '数据支撑不足'
  const seatClash = slice.seat_clash || '3号同学'
  const projTitle = resObj.project_title || '多 Agent 模拟面试网站'
  const snippet = String(candidateAnswer || '').trim().slice(0, 32)
  const prefix = snippet ? `（听完你刚才关于「${snippet}…」的阐述后追问）` : '（在听完你的项目介绍后突然打断）'

  const lgd_cross_stage_probe = {
    id: 'handoff_lgd_cross_stage',
    taxonomy_class: 'non_standard',
    taxonomy_subtype: 'lgd_cross_stage',
    taxonomy_badge: '40% 非标准题 · ③ 跨环节联动追问（LGD回溯）',
    source_slice: slice,
    text: `【跨环节联动追问 · LGD 表现回溯】刚才在无领导小组讨论里，我注意到第 ${ts} 时你们组在商业模式上卡住了（行为切片：${event}，短板信号：${weakness}），你当时提出了一个方案但被 ${seatClash} 否决了，你当时为什么没有坚持？你觉得他那个方案真的比你好吗？`,
  }

  const stress_rebuttal_probe = {
    id: 'handoff_stress_rebuttal',
    taxonomy_class: 'non_standard',
    taxonomy_subtype: 'stress_rebuttal',
    taxonomy_badge: "40% 非标准题 · ② 压力追问与极限反驳（Devil's Advocate）",
    source_project: projTitle,
    text: `【压力追问与极限反驳 · Devil's Advocate】${prefix}我觉得你做的这个「${projTitle}」功能完全是个伪需求！大厂随便一个通用大模型加个 Prompt 就能替代，你做的这些多 Agent 编排壁垒在哪里？有什么真实的商业价值？`,
  }

  return {
    resume_json: resObj,
    lgd_report_json: lgdObj,
    lgd_cross_stage_probe,
    stress_rebuttal_probe,
    sequence: [lgd_cross_stage_probe, stress_rebuttal_probe],
  }
}
