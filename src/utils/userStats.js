const DIM_KEY_BY_LABEL = {
  表达力: 'expression',
  逻辑力: 'logic',
  逻辑性: 'logicality',
  领导力: 'leadership',
  协作力: 'teamwork',
  应变力: 'adaptability',
}

/** Display average score as integer or one decimal (unified across UI). */
export function formatAvgScore(score) {
  if (score == null || Number.isNaN(Number(score))) return '0'
  const n = Number(score)
  if (Math.abs(n - Math.round(n)) < 1e-6) return String(Math.round(n))
  return n.toFixed(1)
}

export function rankFromAvgScore(avg) {
  const n = Number(avg) || 0
  if (n >= 90) return { name: '钻石', next: '满级', min: 90, max: 100 }
  if (n >= 80) return { name: '铂金', next: '距钻石差约 10 分', min: 80, max: 90 }
  if (n >= 70) return { name: '黄金', next: '距铂金差约 10 分', min: 70, max: 80 }
  if (n >= 60) return { name: '白银', next: '距黄金差约 10 分', min: 60, max: 70 }
  return { name: '青铜', next: '继续练习提升', min: 0, max: 60 }
}

/** Simple EXP bar derived from avg score (same source as rank). */
export function rankProgressFromScore(avg) {
  const n = Number(avg) || 0
  const rank = rankFromAvgScore(n)
  const span = rank.max - rank.min || 1
  const progress = Math.min(100, Math.max(0, ((n - rank.min) / span) * 100))
  const exp = Math.round(n * 30)
  const nextExp = Math.round(rank.max * 30)
  return { progress: Math.round(progress), exp, nextExp, rankName: rank.name, nextRank: rank.max >= 100 ? null : rankFromAvgScore(rank.max).name }
}

export function findWeakestDimension(radarData) {
  if (!radarData?.length) return null
  let weakest = radarData[0]
  for (const row of radarData) {
    if ((row.value ?? 0) < (weakest.value ?? 0)) weakest = row
  }
  return weakest
}

export function dimKeyFromAxisLabel(axisLabel) {
  return DIM_KEY_BY_LABEL[axisLabel] || 'logic'
}
