/** Rule-based signals for coding approach explanation (口述思路). */

const APPROACH_SIGNALS = [
  '思路', '首先', '然后', '因此', '因为', '所以', '步骤', '策略', '递归', '迭代',
  '双指针', '哈希', '栈', '队列', '分治', '动态规划', '贪心', '排序', '遍历',
]

const COMPLEXITY_SIGNALS = [
  '复杂度', 'O(', 'O（', '时间', '空间', '线性', '对数', '平方', '常数',
  '最坏', '平均', '均摊',
]

const EDGE_SIGNALS = [
  '边界', '空', 'null', 'None', '溢出', '重复', '负数', '极端', '特殊情况',
  '越界', '长度为 0', '长度为0', '单元素',
]

function countHits(text, signals) {
  if (!text?.trim()) return 0
  let n = 0
  for (const s of signals) {
    if (text.includes(s)) n += 1
  }
  return n
}

export function analyzeCodingExplain(text) {
  const trimmed = (text || '').trim()
  const chars = trimmed.replace(/\s/g, '').length
  const approach_hits = countHits(trimmed, APPROACH_SIGNALS)
  const complexity_hits = countHits(trimmed, COMPLEXITY_SIGNALS)
  const edge_hits = countHits(trimmed, EDGE_SIGNALS)

  return {
    char_count: chars,
    word_segments: trimmed ? trimmed.split(/\s+/).length : 0,
    approach_score: Math.min(100, approach_hits * 12),
    complexity_mentioned: complexity_hits > 0,
    edge_cases_mentioned: edge_hits > 0,
    approach_hits,
    complexity_hits,
    edge_hits,
  }
}

export function formatCodingExplainHints(metrics) {
  const tips = []
  if (!metrics?.approach_hits) tips.push('建议先口述整体思路与关键步骤')
  if (!metrics?.complexity_mentioned) tips.push('可补充时间/空间复杂度')
  if (!metrics?.edge_cases_mentioned) tips.push('可提及边界或异常输入如何处理')
  return tips
}
