export function scoreLevel(score) {
  if (score >= 90) return 'excellent'
  if (score >= 80) return 'good'
  if (score >= 70) return 'average'
  return 'low'
}

export function scoreRankFromValue(score) {
  if (score >= 90) return 'A+'
  if (score >= 80) return 'A'
  if (score >= 70) return 'B'
  return 'C'
}

/** Human-readable grade — not color-only. */
export function scoreGradeLabel(score) {
  if (score >= 90) return '优秀'
  if (score >= 80) return '良好'
  if (score >= 70) return '中等'
  return '待提升'
}

export function formatScoreGrade(score) {
  const n = Number(score)
  if (Number.isNaN(n)) return '—'
  return `${scoreGradeLabel(n)} · ${scoreRankFromValue(n)}`
}
