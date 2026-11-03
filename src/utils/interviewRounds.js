export const DEFAULT_ROUND_NAMES = [
  '初面 · 综合',
  '二面 · 专业',
  '终面 · 综合',
  '加面 · 深度',
  '终面 · 决策',
]

export const DEFAULT_MIX = { general: 1, resume_specific: 1, professional: 1 }

export const ROUND_TYPE_OPTIONS = [
  { id: 'standard', label: '综合/专业题' },
  { id: 'hr', label: 'HR 面' },
  { id: 'negotiation', label: '谈薪模拟' },
  { id: 'case', label: 'Case 分析' },
  { id: 'system_design', label: '系统设计' },
]

export function isCaseOnlyRounds(rounds) {
  if (!rounds?.length) return false
  return rounds.every((r) => r.type === 'case' || r.type === 'system_design')
}

export function buildDefaultRounds(count = 3) {
  return Array.from({ length: count }, (_, i) => ({
    name: DEFAULT_ROUND_NAMES[i] || `第 ${i + 1} 轮`,
    question_count: 3,
    mix: { ...DEFAULT_MIX },
    type: 'standard',
    reverse_qa: false,
  }))
}

/** Weighted final score from completed rounds (equal weights by default). */
export function computeWeightedRoundScore(rounds, weights = [1, 1, 1, 1, 1]) {
  if (!rounds?.length) return null
  let totalW = 0
  let weighted = 0
  rounds.forEach((r, i) => {
    if (typeof r.score !== 'number') return
    const w = weights[i] ?? weights[weights.length - 1] ?? 1
    totalW += w
    weighted += w * r.score
  })
  if (!totalW) return null
  return Math.round((weighted / totalW) * 10) / 10
}

export function averageLogicalityFromRounds(rounds) {
  const totals = []
  for (const rnd of rounds || []) {
    for (const q of rnd.questions || []) {
      const t = q.logic_score?.total
      if (typeof t === 'number') totals.push(t)
    }
  }
  if (!totals.length) return 0
  return Math.round(totals.reduce((a, b) => a + b, 0) / totals.length)
}

export const LOGIC_DIMENSION_LABELS = {
  structure: '结构完整',
  contribution: '个人贡献',
  evidence: '证据具体',
  causality: '因果连贯',
  relevance: '切题程度',
}
