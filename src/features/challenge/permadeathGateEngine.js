/**
 * End-to-End Recruiting Funnel & Blind Pass-Line Gate Engine (`一血通关`)
 *
 * Pipeline Topology:
 *   Stage 0: `resume`     — 进入释放简历（上传解析 / 岗位微简历释放）
 *   Stage 1: `lgd`        — LGD 无领导小组群面突围
 *   [Optional]: `written` — 笔试模拟场景（逻辑推理 + 数据测算 + 岗位情境）
 *   Stage 2A: `biz_1`     — 单人业务一面（执行力与简历项目深挖）
 *   [Optional]: `biz_2`   — 单人业务二面（Leader面 / 场景模拟 / 二连追问压力测试）
 *   Final:   `hr_final`   — HR / 终面（稳定性 + 实习时长 + 薪资预期 + 文化匹配度） ➔ 签发 Offer
 *
 * Core Invariants:
 * 1. Blind Scoring (`sealed: true` while `gameState === 'playing'`):
 *    All completed stage numerical scores remain strictly hidden until final Offer or elimination exit.
 * 2. Pass-Line Gatekeeper (`score < passLine`):
 *    Immediately halts subsequent stages, exits the funnel, and unseals prior scores with a non-pass verdict.
 */

export const SCREENER_ARCHITECTURE_ID = 'edgewise.screener.fixed_pipeline.v1'

export const RESUME_SCREENER_FIXED_PROMPT = [
  '【系统角色：首席 AI 简历筛选官（Fixed Screener Architecture v1）】',
  '严格执行固定三步审阅管线，禁止寒暄跳步：',
  'Step 1 [core_project_tags]：从候选人释放简历中提取项目主干名称、技术/业务方法论标签（3-6项）与量化声明；',
  'Step 2 [suspicion_gaps]：审计指标样本基线缺失、个人与团队功劳边界模糊、以及顺风局外异常兜底空白；',
  'Step 3 [deep_dive_checklist]：生成跨关卡专属深挖问题清单，定向派发至 biz_1（一面真伪深挖）、biz_2（二面Leader反例压测）与 hr_final（终面动机与前后一致性复核）。',
].join('\n')

export const SCREENER_EXECUTION_STEPS = [
  { step: 1, code: 'tag_extraction', label: '提取核心项目与技能标签' },
  { step: 2, code: 'vulnerability_audit', label: '审计量化口径与贡献边界疑点' },
  { step: 3, code: 'dossier_dispatch', label: '派发专属深挖问题清单至后续关卡' },
]

export const WRITTEN_SIMULATION_BANK = [
  {
    id: 'w_logic_1',
    category: '行测逻辑推理',
    stem: '某校招群面小组有甲、乙、丙、丁4人。已知：① 若甲担任Leader，则乙担任计时员；② 只有丙担任汇报人，乙才担任计时员；③ 丙未担任汇报人。由此必然推出：',
    options: [
      'A. 甲未担任 Leader',
      'B. 乙担任了计时员',
      'C. 丁担任了汇报人',
      'D. 甲担任了计时员',
    ],
    correctIndex: 0,
  },
  {
    id: 'w_data_2',
    category: '商业数据测算',
    stem: '某 AI 面试产品新用户日均注册 2,000 人，首轮漏斗完成率为 45%。改版精简前置引导后，首轮完成率提升至 63%，假设次日留存率稳定在 40%，改版后每日新增次留用户净增多少人？',
    options: [
      'A. 120 人',
      'B. 144 人',
      'C. 180 人',
      'D. 360 人',
    ],
    correctIndex: 1,
  },
  {
    id: 'w_scene_3',
    category: '岗位工程/业务取舍',
    stem: '大促上线前 2 小时发现核心推荐接口在极端并发下 P99 延迟飙升至 2.4s（SLA 上限 500ms），此时最稳妥的首要止损动作是：',
    options: [
      'A. 临时重构底层数据库索引结构并全量发布',
      'B. 开启网关超时熔断与热缓存兜底降级，保核心交易链路可用',
      'C. 忽略告警按原计划全量推流观察',
      'D. 关闭全部监控日志减少 IO 开销',
    ],
    correctIndex: 1,
  },
]

/**
 * Build the dynamic stage sequence according to user-configured funnel route.
 */
export function buildRecruitingFunnelStages({
  includeWrittenTest = true,
  businessRounds = 2,
} = {}) {
  const stages = [
    {
      key: 'resume',
      name: '释放简历',
      shortName: '释放简历',
      desc: '投递解析简历或释放项目卡片 · 锚定一面深挖背景',
      time: '120s',
      limitSec: 120,
      fallbackRoute: '/resume',
    },
    {
      key: 'lgd',
      name: 'LGD 群面',
      shortName: 'LGD 群面',
      desc: '8人圆桌多Agent交锋 · 控场整合分歧并推动共识',
      time: '180s',
      limitSec: 180,
      fallbackRoute: '/lgd/lobby',
    },
  ]

  if (includeWrittenTest) {
    stages.push({
      key: 'written',
      name: '笔试模拟',
      shortName: '笔试模拟',
      desc: '限时行测逻辑 + 商业数据测算 + 岗位专业取舍笔试',
      time: '150s',
      limitSec: 150,
      fallbackRoute: '/assessment',
    })
  }

  stages.push({
    key: 'biz_1',
    name: '业务一面（项目深挖）',
    shortName: '业务一面',
    desc: '围绕已释放简历代表作深挖个人执行细节与量化产出',
    time: '180s',
    limitSec: 180,
    fallbackRoute: '/interview/lobby',
  })

  if (Number(businessRounds) >= 2) {
    stages.push({
      key: 'biz_2',
      name: '业务二面（Leader压测）',
      shortName: '业务二面',
      desc: 'Leader 复杂场景模拟 + AI 连环漏洞追问压力测试',
      time: '150s',
      limitSec: 150,
      fallbackRoute: '/interview/lobby',
    })
  }

  stages.push({
    key: 'hr_final',
    name: 'HR / 终面 & Offer',
    shortName: 'HR 终面',
    desc: '考察稳定性、实习时长/到岗周期、薪资预期与文化匹配度',
    time: '150s',
    limitSec: 150,
    fallbackRoute: '/interview/lobby',
  })

  return stages.map((st, idx) => ({
    ...st,
    id: idx + 1,
    index: idx,
  }))
}

/**
 * Evaluate Stage 0 Resume Release quality & JD readiness (`0–98`).
 */
export function evaluateResumeRelease({
  candidateName = '',
  education = '',
  coreProject = '',
  skillsText = '',
  parsedResume = null,
} = {}) {
  const proj = String(coreProject || parsedResume?.projects?.[0]?.desc || '').trim()
  const skills = String(
    skillsText || (Array.isArray(parsedResume?.skills) ? parsedResume.skills.join('、') : ''),
  ).trim()
  const edu = String(education || parsedResume?.education || '').trim()

  if (!proj && !skills && !parsedResume) {
    return {
      score: 42,
      valid: false,
      summary: '简历核心项目与技能空白，未达网申筛选标准',
      extractedProject: '核心业务增长与系统重构项目',
      extractedSkills: [],
    }
  }

  let score = 62
  if (proj.length >= 18) score += 14
  else if (proj.length >= 6) score += 7
  if (/(\d+(?:\.\d+)?\s*(?:%|万|倍|ms|s|人|天)|ROI|提升|降低|重构|主导)/.test(proj)) {
    score += 10
  }
  const skillTokens = skills
    .split(/[,，、/|\s]+/)
    .map((s) => s.trim())
    .filter(Boolean)
  if (skillTokens.length >= 3) score += 7
  else if (skillTokens.length >= 1) score += 4
  if (edu.length >= 4 || candidateName.trim().length >= 2) score += 4

  const finalScore = Math.max(40, Math.min(96, score))
  return {
    score: finalScore,
    valid: proj.length >= 6 || Boolean(parsedResume),
    summary: `简历画像提取完成（提炼 ${skillTokens.length || 1} 项技能标签与代表项目）`,
    extractedProject: proj.slice(0, 46) || '核心业务漏斗诊断与性能优化项目',
    extractedSkills: skillTokens.slice(0, 6),
  }
}

/**
 * Fixed-Prompt & 3-Step Execution Architecture AI Resume Screener (Client Mirror / Offline Guarantee).
 * Extracts `core_project_tags`, `suspicion_gaps`, and dispatches `deep_dive_checklist` to downstream stages.
 */
export function runLocalResumeScreenerAgent({
  position = 'AI 产品经理',
  education = '',
  coreProject = '',
  skillsText = '',
  parsedResume = null,
} = {}) {
  const baseEval = evaluateResumeRelease({
    education,
    coreProject,
    skillsText,
    parsedResume,
  })
  const projClean = String(coreProject || parsedResume?.projects?.[0]?.desc || '').trim()
  const titleMatch = projClean.match(/^(?:主导|负责|参与)?([^：:，。；]{4,22})/)
  const projTitle = titleMatch
    ? titleMatch[1].trim()
    : projClean.slice(0, 18) || `${position}核心业务项目`

  const domainMatches =
    projClean.match(
      /(漏斗转化|A\/B实验|规则引擎|高并发|微服务|推荐算法|大模型|RAG|多Agent|缓存降级|埋点诊断|留存增长|数据驱动|性能优化)/g,
    ) || []
  const coreProjectTags = []
  for (const raw of [projTitle, ...domainMatches, ...(baseEval.extractedSkills || [])]) {
    const clean = String(raw || '').trim().slice(0, 16)
    if (clean && !coreProjectTags.includes(clean)) coreProjectTags.push(clean)
    if (coreProjectTags.length >= 6) break
  }
  if (!coreProjectTags.length) {
    coreProjectTags.push(`${position}核心能力`, '项目细节待深挖')
  }

  const claimMatches =
    projClean.match(
      /(?:提升|降低|压降|增长|缩短|优化|节省)[^，。；\n]{0,10}?\d+(?:\.\d+)?\s*(?:%|倍|万|ms|秒|s|人|天)|\d+(?:\.\d+)?\s*(?:%|倍|万)/g,
    ) || []
  const quantifiedClaims = claimMatches.slice(0, 3)

  const suspicionGaps = []
  if (quantifiedClaims.length > 0) {
    suspicionGaps.push(
      `声称达成「${quantifiedClaims[0]}」，但未披露对照组基线、样本流量规模与置信度归因口径`,
    )
  } else {
    suspicionGaps.push('项目描述缺少硬核量化结果指标，需核实实际交付深度')
  }
  if (!/(独立|亲自|从0到1|唯一负责人)/.test(projClean)) {
    suspicionGaps.push('团队整体产出与个人独立攻坚边界未严格切分，需剥离团队光环核验')
  } else {
    suspicionGaps.push('宣称高比例个人主导推进，需核验跨部门推进阻力与真实取舍')
  }
  if (!/(回滚|熔断|失败|异常|瓶颈|坑|trade-off|取舍)/i.test(projClean)) {
    suspicionGaps.push('仅呈现顺风局正向指标，未交代极端异常兜底或被迫妥协的代价')
  }

  const primaryTag = coreProjectTags[0]
  const techTag =
    baseEval.extractedSkills?.[0] || coreProjectTags[1] || position
  const claimAnchor = quantifiedClaims[0] || '你声称的项目核心产出'

  const deepDiveChecklist = [
    {
      id: 'dd_biz_1_ownership',
      target_stage: 'biz_1',
      stage_label: '业务一面 · 项目真伪深挖',
      tag: primaryTag,
      question: `【AI简历筛选官派发深挖 #1 · 贡献与口径核验】你在第一关释放简历「${projTitle}」中声称达成「${claimAnchor}」并应用了 ${techTag}：请剥离团队功劳，只讲你本人亲手落地的最核心动作是什么？该指标的分母基线与实验归因是怎么验证的？`,
    },
    {
      id: 'dd_biz_2_edgecase',
      target_stage: 'biz_2',
      stage_label: '业务二面 · Leader反例压测',
      tag: techTag,
      question: `【AI简历筛选官派发深挖 #2 · 极端失效压测】沿用你简历「${projTitle}」的方案：若线上峰值流量骤增 3 倍、研发与算力预算砍半，且「${techTag}」出现延迟雪崩，你原方案哪一环会最先击穿？请给出分钟级止损取舍边界！`,
    },
    {
      id: 'dd_hr_resume_gap',
      target_stage: 'hr_final',
      stage_label: 'HR终面 · 简历盲区与动机复核',
      tag: '简历疑点复核',
      question: `你在第一关简历重点展示了「${projTitle}」的亮眼结果（筛选官标注疑点：${suspicionGaps[suspicionGaps.length - 1]}）——请坦诚复盘该项目里你个人犯过最大的一个判断失误或最遗憾的一次妥协是什么？`,
    },
  ]

  return {
    architecture_id: SCREENER_ARCHITECTURE_ID,
    fixed_prompt_digest: 'Principal Resume Screener v1 (3-Step Fixed Pipeline)',
    execution_steps: SCREENER_EXECUTION_STEPS,
    project_title: projTitle,
    core_project_tags: coreProjectTags,
    quantified_claims: quantifiedClaims,
    suspicion_gaps: suspicionGaps,
    deep_dive_checklist: deepDiveChecklist,
    resume_score: baseEval.score,
    valid: baseEval.valid,
  }
}

/**
 * Evaluate Stage-2 LGD Three-Examiner Calibration outcome (`8进3` / Hell `8进2` + One-Vote Veto).
 * Ensures candidates who trigger Observer A's One-Vote Veto or fail to make the Calibration roster
 * are halted before entering downstream single interviews, while promoted scores remain sealed!
 */
export function evaluatePermadeathLgdCalibration(
  rawScore,
  lgdMetrics = null,
  passLine = 70,
  advancementQuota = 3,
) {
  const safeRaw = Number.isFinite(Number(rawScore)) ? Math.round(Number(rawScore)) : 0
  const safeLine = Number(passLine) || 70
  const quota = Math.max(1, Math.min(4, Number(advancementQuota) || 3))
  const cal = lgdMetrics?.calibration || null

  if (cal) {
    const vetoed = Boolean(cal.user_vetoed)
    const promoted = Boolean(cal.user_promoted) && !vetoed
    const effectiveScore = promoted ? safeRaw : Math.min(safeLine - 4, safeRaw)
    const summary =
      cal.summary_verdict ||
      (promoted
        ? `三考官 Calibration 校准通过（第 ${cal.user_rank || 2}/8 名 · 8进${quota} 晋级）`
        : `三考官 Calibration 未通过（${vetoed ? cal.veto_reason || '触发红线一票否决' : `未入围 8进${quota} 晋级名单`}）`)
    return {
      promoted,
      vetoed,
      userRank: cal.user_rank || (promoted ? 2 : 5),
      ratioLabel: cal.ratio_label || `8进${quota}`,
      effectiveScore,
      summary,
    }
  }

  // Deterministic offline fallback when backend `lgd_metrics.calibration` is unavailable
  const cutoff = quota === 2 ? Math.max(safeLine, 78) : safeLine
  const promoted = safeRaw >= cutoff
  return {
    promoted,
    vetoed: safeRaw < 50,
    userRank: promoted ? 2 : 5,
    ratioLabel: `8进${quota}`,
    effectiveScore: promoted ? safeRaw : Math.min(safeLine - 4, safeRaw),
    summary: promoted
      ? `三考官闭门 Calibration 校准通过（8进${quota} 成功入围晋级名单）`
      : `三考官闭门 Calibration 未通过（未能进入 8进${quota} 晋级线）`,
  }
}

/**
 * Analyze Stage-2 LGD behavior so HR Final inherits exact group-discussion actions
 * plus Three-Examiner Calibration notes (explicitly probing compromise/concession).
 */
export function analyzeLgdFootprintForHr(lgdTranscript = [], lgdScore = null, lgdMetrics = null) {
  const userTurns = (lgdTranscript || [])
    .filter((m) => m.isUser || m.role === 'user' || m.senderId === 'user')
    .map((m) => String(m.text || m.content || '').trim())
    .filter(Boolean)
  const joined = userTurns.join(' ')
  const snippet = joined ? `${joined.slice(0, 36)}${joined.length > 36 ? '…' : ''}` : '未充分发声'

  const cal = lgdMetrics?.calibration || null
  const panel = lgdMetrics?.examiner_panel || null
  const milestoneHits = panel?.milestone_scribe_b?.milestone_hits ?? null
  const examinerCalibNote = cal
    ? `三考官闭门校准第 ${cal.user_rank}/8 名（${cal.ratio_label}）` +
      (milestoneHits != null ? `，周PM账本命中 ${milestoneHits} 个关键节点` : '')
    : '三考官（顾总监/苏经理/周PM）闭门校准已归档'

  const hasCompromise = /(折中|妥协|退一步|让步|兼顾|中和|平衡|分两步|先不砍|桥接|融合|各退一步)/.test(
    joined,
  )
  const hasAssertive = /(先确立|评判标准|我建议按|我来汇总|分工|锁定|必须明确|第一.*第二|主导|收敛)/.test(
    joined,
  )
  const hasRigid = /(我坚持必须|绝不退让|别的方案都不行|完全不同意|没得商量|只能选我)/.test(joined)

  if (hasRigid) {
    return {
      style: 'rigid_clashing',
      style_label: '强势死磕 · 抗拒折中',
      utterance_excerpt: snippet,
      lgd_score_sealed: lgdScore,
      examiner_calib_note: examinerCalibNote,
      hr_lgd_probe:
        '刚才第二关群面时，副面试官A（苏经理）在分区盯梢记录中标注你面对不同意见寸步不让——为什么当时拒绝做二阶折中？若入职后跨部门平级同事否决你的方案，你也会这样硬顶吗？',
    }
  }
  if (hasCompromise) {
    return {
      style: 'compromised_bridge',
      style_label: '折中调和 · 方案妥协',
      utterance_excerpt: snippet,
      lgd_score_sealed: lgdScore,
      examiner_calib_note: examinerCalibNote,
      hr_lgd_probe: `刚才群面时你为什么妥协了那个方案（三考官校准纪要记录你提出「${snippet}」来调和3号与5号的分歧），而不是坚持更彻底的单点突破？这是出于时间压力的策略性让步，还是你在冲突下习惯和稀泥？`,
    }
  }
  if (hasAssertive && joined.length >= 45) {
    return {
      style: 'assertive_leader',
      style_label: '主动立标 · 强势控场',
      utterance_excerpt: snippet,
      lgd_score_sealed: lgdScore,
      examiner_calib_note: examinerCalibNote,
      hr_lgd_probe: `刚才第二关群面中，副面试官B（周PM）记录你主动抢过话语权确立评判标准（「${snippet}」）——若入职后你作为新人在项目组没有正式汇报权，资深老员工不买账你的框架，你怎么推进？`,
    }
  }
  return {
    style: 'cautious_follower',
    style_label: '谨慎跟随 · 破局偏弱',
    utterance_excerpt: snippet,
    lgd_score_sealed: lgdScore,
    examiner_calib_note: examinerCalibNote,
    hr_lgd_probe:
      '复盘刚才第二关群面的三考官校准记录，你在高压争论中的控场锋芒偏弱——为什么当时轻易妥协让出了议程主导权？进入高强度业务线后你如何证明独立破局力？',
  }
}

/**
 * Build the HR Final opening question inheriting Stage-1 Resume Gaps + Stage-2 LGD Footprint.
 */
export function buildHrCrossStageOpening({
  position = 'AI 产品经理',
  initOfferK = 20,
  dossier = null,
  lgdFootprint = null,
  pressureMode = true,
} = {}) {
  const checklist = dossier?.deep_dive_checklist || []
  const hrResumeItem =
    checklist.find((c) => c.target_stage === 'hr_final') || checklist[checklist.length - 1]
  const resumeProbe =
    hrResumeItem?.question ||
    `结合你第一关释放的「${position}」简历，请坦诚复盘你过往项目里最大的一次判断失误或妥协。`
  const lgdProbe =
    lgdFootprint?.hr_lgd_probe ||
    '刚才群面时你为什么妥协了那个方案？请复盘你当时的真实权衡逻辑。'
  const calibSuffix = lgdFootprint?.examiner_calib_note
    ? `（${lgdFootprint.examiner_calib_note}）`
    : ''
  const header = pressureMode
    ? `【🔥 终面压力追问模式已开启】我是终面委员会主席林总监，已调阅你第1关简历筛查底稿与第2关群面三考官校准纪要${calibSuffix}。`
    : `欢迎进入【HR / 终面】跨轮综合核验！我已汇总你第1关简历深挖底稿与第2关群面三考官校准表现${calibSuffix}。`

  return [
    header,
    '请正面回应以下跨关交叉核验与录用四要素（切忌模板套话）：',
    `①【继承第1关·简历盲区】${resumeProbe}`,
    `②【继承第2关·群面表现】${lgdProbe}`,
    `③【终面四维底线】请同步明确长期留任稳定性、最快到岗与连续实习时长、团队文化匹配点，以及期望薪资依据（初始 Base 锚点 ${initOfferK}k/月）。`,
  ].join('\n')
}

/**
 * Generate the adversarial Turn-2 HR Pressure Follow-up Probe auditing cross-stage self-consistency.
 */
export function generateHrPressureFollowupProbe({
  candidateAnswer = '',
  dossier = null,
  lgdFootprint = null,
  expectedSalaryK = 26,
  floorK = 20,
} = {}) {
  const txt = String(candidateAnswer || '').trim()
  const projTitle = dossier?.project_title || '核心代表项目'
  const lgdStyle = lgdFootprint?.style || 'compromised_bridge'

  const addressedLgd = /(群面|折中|妥协|队友|共识|3号|5号|时间|让步|框架|主导)/.test(txt)
  const addressedResume = /(项目|简历|复盘|失误|基线|指标|边界|改进|当时|兜底)/.test(txt)
  const addressedStability = /(稳定|长期|深耕|留用|转正|实习|月|到岗)/.test(txt)

  const consistencyScore = Math.max(
    45,
    Math.min(
      96,
      64 +
        (addressedLgd ? 11 : -6) +
        (addressedResume ? 11 : -4) +
        (addressedStability ? 10 : 0),
    ),
  )

  let focus = '人设自洽度与底线抗压测试'
  let probeText = ''
  if (!addressedLgd) {
    focus = '回避群面妥协追问'
    probeText = `【🔥 HR 高压追击 · 严禁回避】你刚才绕开了我对第二关群面的核心质询！请直接回答：刚才群面时你为什么妥协了那个方案（行为画像：${lgdFootprint?.style_label || '折中妥协'}）？这与你第1关简历里宣称强力推动「${projTitle}」的人设是否前后矛盾？`
  } else if (lgdStyle === 'compromised_bridge') {
    probeText = `【🔥 HR 高压追击 · 自洽性极限施压】你把刚才群面里的妥协解释为顾全大局——但结合你第1关简历「${projTitle}」的风险兜底盲区：如果上线前2小时发现严重指标回退，合作方强烈施压要求你像群面一样“折中妥协”带病发版，你到底敢不敢一票否决？此外若核定月薪锁定在 ${Math.max(floorK, expectedSalaryK - 2)}k/月（绑定试用期硬指标），你的底线决定是什么？`
  } else {
    focus = '高压协作摩擦与高薪兑现拷问'
    probeText = `【🔥 HR 高压追击 · 兑现度拷问】你在简历「${projTitle}」与群面中的表现很有侵略性，但你期望的 ${expectedSalaryK}k/月 已触及本岗高阶带宽：若入职首月零额外资源倾斜、且老员工质疑你的推进方式，你如何保证不在三个月内因落差离职？`
  }

  return {
    focus,
    consistency_score: consistencyScore,
    addressed_lgd: addressedLgd,
    addressed_resume: addressedResume,
    probe_text: probeText,
  }
}

/**
 * Grade the 3-item Written Simulation Test + optional brief reasoning note (`0–98`).
 */
export function evaluateWrittenSimulation(selectedAnswers = {}, reasoningNote = '') {
  let correctCount = 0
  WRITTEN_SIMULATION_BANK.forEach((item) => {
    if (Number(selectedAnswers[item.id]) === item.correctIndex) {
      correctCount += 1
    }
  })
  const answeredCount = Object.keys(selectedAnswers).length
  if (answeredCount === 0) {
    return {
      score: 38,
      correctCount: 0,
      totalCount: WRITTEN_SIMULATION_BANK.length,
      summary: '笔试未作答交卷',
    }
  }
  const base = Math.round((correctCount / WRITTEN_SIMULATION_BANK.length) * 78) + 14
  const noteBonus = String(reasoningNote || '').trim().length >= 15 ? 4 : 0
  const finalScore = Math.max(38, Math.min(96, base + noteBonus))
  return {
    score: finalScore,
    correctCount,
    totalCount: WRITTEN_SIMULATION_BANK.length,
    summary: `客观题答对 ${correctCount}/${WRITTEN_SIMULATION_BANK.length} 题${noteBonus ? ' + 解题思路加分' : ''}`,
  }
}

/**
 * Evaluate HR Final Round across the 4 mandatory dimensions:
 * 1. Stability (`稳定性`), 2. Internship Duration / Availability (`实习时长/到岗时间`),
 * 3. Salary Expectation (`薪资预期合理度`), 4. Cultural Fit (`文化匹配度`).
 */
export function evaluateHrFourDimensions({
  answerText = '',
  internshipCommitment = '5days_6months',
  expectedSalaryK = 26,
  floorK = 20,
  backendTurnScore = null,
  consistencyScore = null,
} = {}) {
  const txt = String(answerText || '').trim()
  if (txt.length < 10 && backendTurnScore == null) {
    return {
      score: 46,
      dimensions: { stability: 45, internship: 50, salary: 50, culture: 45 },
      summary: 'HR 终面回应过于简略，稳定性与文化匹配度依据不足',
    }
  }

  const hasStability = /(长期|深耕|稳定|规划|留用|转正|城市|赛道|三年|两年|沉淀)/.test(txt)
  const hasCulture = /(协作|复盘|用户价值|务实|闭环|坦诚|团队|自驱|抗压|拥抱变化|数据驱动)/.test(txt)
  const hasSalaryReason = /(产出|价值|市场|区间|弹性|期权|总包|认可|对齐|\d+\s*k)/i.test(txt)

  const internshipScore =
    internshipCommitment === 'fulltime_immediate' || internshipCommitment === '5days_6months'
      ? 92
      : internshipCommitment === '4days_4months'
        ? 82
        : 64

  const reasonableCeiling = floorK + 12
  const salaryScore =
    expectedSalaryK <= reasonableCeiling && expectedSalaryK >= floorK - 4
      ? hasSalaryReason
        ? 88
        : 80
      : expectedSalaryK > reasonableCeiling + 8
        ? 56
        : 70

  const stabilityScore = hasStability ? 88 : txt.length >= 25 ? 76 : 62
  const cultureScore = hasCulture ? 90 : txt.length >= 25 ? 76 : 62

  const fourDimAvg = Math.round(
    stabilityScore * 0.26 +
      internshipScore * 0.24 +
      salaryScore * 0.25 +
      cultureScore * 0.25,
  )
  let blended =
    typeof backendTurnScore === 'number'
      ? Math.round(fourDimAvg * 0.65 + backendTurnScore * 0.35)
      : fourDimAvg
  if (typeof consistencyScore === 'number') {
    blended = Math.round(blended * 0.72 + consistencyScore * 0.28)
  }

  return {
    score: Math.max(42, Math.min(97, blended)),
    dimensions: {
      stability: stabilityScore,
      internship: internshipScore,
      salary: salaryScore,
      culture: cultureScore,
      consistency: consistencyScore ?? undefined,
    },
    summary: `四维+跨轮自洽终审：稳定性 ${stabilityScore} · 实习/到岗 ${internshipScore} · 薪资预期 ${salaryScore} · 文化匹配 ${cultureScore}${
      consistencyScore != null ? ` · 跨关自洽 ${consistencyScore}` : ''
    }`,
  }
}

/**
 * Pure state-transition gatekeeper enforcing:
 * - Strict score hiding (`scoresRevealed: false`) while advancing;
 * - Immediate pipeline pause & exit (`outcome: 'failed_cutoff'`) if `rawScore < passLine`;
 * - Formal Offer unlock & full score reveal (`outcome: 'offer_issued'`) when final stage >= `passLine`.
 */
export function evaluateStageGateTransition({
  rawScore,
  passLine = 60,
  stageIndex = 0,
  stages = [],
  priorStageRecords = [],
  stageSummary = '',
} = {}) {
  const cleanScore = Math.max(0, Math.min(100, Math.round(Number(rawScore) || 0)))
  const safePassLine = Math.max(40, Math.min(90, Math.round(Number(passLine) || 60)))
  const stageMeta = stages[stageIndex] || { key: `stage_${stageIndex}`, name: `第 ${stageIndex + 1} 关` }
  const passed = cleanScore >= safePassLine

  const newRecord = {
    stageIndex,
    stageKey: stageMeta.key,
    stageName: stageMeta.name,
    fallbackRoute: stageMeta.fallbackRoute || '/interview/lobby',
    score: cleanScore,
    passLine: safePassLine,
    passed,
    summary: stageSummary,
  }
  const nextRecords = [...priorStageRecords, newRecord]

  if (!passed) {
    const pausedStages = stages.slice(stageIndex + 1).map((s) => s.name)
    return {
      outcome: 'failed_cutoff',
      gameState: 'gameover',
      scoresRevealed: true,
      nextStageIndex: stageIndex,
      stageRecords: nextRecords,
      pausedFutureStages: pausedStages,
      publicNotice: `「${stageMeta.name}」未达及格线（得分 ${cleanScore} < 及格线 ${safePassLine}），后续环节（${pausedStages.join(' → ') || '终审'}）已自动暂停，本次流程未通过。`,
    }
  }

  if (stageIndex >= stages.length - 1) {
    return {
      outcome: 'offer_issued',
      gameState: 'victory',
      scoresRevealed: true,
      nextStageIndex: stageIndex,
      stageRecords: nextRecords,
      pausedFutureStages: [],
      publicNotice: `恭喜全链路通关！所有环节均超越及格线（${safePassLine} 分），现正式拆封各轮隐藏评分并签发录用 Offer！`,
    }
  }

  const nextStage = stages[stageIndex + 1]
  return {
    outcome: 'advance_sealed',
    gameState: 'playing',
    scoresRevealed: false,
    nextStageIndex: stageIndex + 1,
    stageRecords: nextRecords,
    pausedFutureStages: [],
    // Strictly ZERO numerical score exposed while playing!
    publicNotice: `🔒「${stageMeta.name}」考官评议已完成并暗中封存 · 达到晋级标准，正式进入下一环节「${nextStage.name}」`,
  }
}

/**
 * Format stage badge text on pipeline header cards respecting blind-scoring mode.
 */
export function formatBlindStageBadge(status, record, scoresRevealed = false) {
  if (record && scoresRevealed) {
    return `${record.score} 分 ${record.passed ? '✓' : '✗'}`
  }
  if (status === 'passed') {
    return '🔒 已封存'
  }
  if (status === 'current') {
    return '进行中'
  }
  if (status === 'paused') {
    return '已暂停'
  }
  if (status === 'failed') {
    return record ? `${record.score} 分 (未过线)` : '未通过'
  }
  return '待解锁'
}
