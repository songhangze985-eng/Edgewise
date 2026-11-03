const LOW_EFFORT_PATTERNS = [
  /^好的?[。.!]?$/,
  /^不知道[。.!]?$/,
  /^没(?:有)?想法[。.!]?$/,
  /^跳过[。.!]?$/,
  /^pass$/i,
]

export function isLowEffortAnswer(text) {
  const trimmed = (text || '').trim()
  if (!trimmed) return { low: true, reason: '未作答或内容为空' }
  if (trimmed.length < 20) {
    return { low: true, reason: `回答过短（${trimmed.length} 字，建议至少 20 字）` }
  }
  if (LOW_EFFORT_PATTERNS.some((re) => re.test(trimmed))) {
    return { low: true, reason: '回答过于简略，缺少具体事例或结构' }
  }
  return { low: false, reason: null }
}

/** Rule-based score estimate for MVP (0–100). */
export function estimateAnswerScore(text) {
  const trimmed = (text || '').trim()
  const check = isLowEffortAnswer(trimmed)
  if (check.low) {
    const len = trimmed.length
    const score = len === 0 ? 0 : Math.min(20, Math.max(5, Math.floor(len / 2) + 5))
    return { score, reason: check.reason, ruleBased: true }
  }
  let score = 55
  if (trimmed.length >= 40) score += 8
  if (trimmed.length >= 80) score += 8
  if (trimmed.length >= 120) score += 6
  if (/因为|所以|首先|其次|最后|例如|比如|结果|STAR/i.test(trimmed)) score += 10
  if (/\d+%|\d+万|\d+人|项目|团队|负责|推动/.test(trimmed)) score += 8
  score = Math.min(92, Math.max(40, score))
  return { score, reason: '评分为规则估算，仅供参考', ruleBased: true }
}

export function aggregateSessionScore(userTexts) {
  const answers = (userTexts || []).map((t) => (t || '').trim()).filter(Boolean)
  const ruleNote = '评分为规则估算，仅供参考'
  if (!answers.length) {
    return {
      overall: null,
      score_status: 'insufficient',
      dimensions: {},
      note: '未检测到有效作答，评分为规则估算，仅供参考',
    }
  }
  const perAnswer = answers.map((t) => {
    const check = isLowEffortAnswer(t)
    const est = estimateAnswerScore(t)
    return { ...est, answer_valid: !check.low }
  })
  const validAnswers = perAnswer.filter((r) => r.answer_valid)
  if (!validAnswers.length) {
    return {
      overall: null,
      score_status: 'insufficient',
      dimensions: {},
      note: ruleNote,
      lowEffort: true,
      perAnswer,
    }
  }
  const overall = Math.round(
    validAnswers.reduce((sum, r) => sum + r.score, 0) / validAnswers.length
  )
  const spread = (base, delta) => Math.min(100, Math.max(0, base + delta))
  return {
    overall,
    score_status: 'ok',
    dimensions: {
      expression: spread(overall, 2),
      logic: spread(overall, -1),
      leadership: spread(overall, -3),
      teamwork: spread(overall, 1),
      adaptability: spread(overall, 0),
    },
    note: ruleNote,
    lowEffort: perAnswer.some((r) => !r.answer_valid || r.score <= 20),
    perAnswer,
  }
}
