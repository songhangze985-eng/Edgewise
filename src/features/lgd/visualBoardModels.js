/**
 * LGD Structured Visual Anchor Models (Three-Column Partition + 4 Topic-Adaptive Templates + Parking Lot)
 *
 * Implements standard LGD visual floor-control methodology:
 * 1. Four Topic-Type -> Visual Model Mappings:
 *    - `ranking`               -> `scoring_matrix`  (量化评分矩阵表: Weight × Score)
 *    - `dilemma` | `case_debate` -> `roi_quadrant`  (2×2 四象限矩阵: P0–P3 ROI取舍)
 *    - `open`                  -> `mece_tree`       (MECE 逻辑归因树: 3正交主干)
 *    - `planning`              -> `swimlane_funnel` (三阶段泳道漏斗: 短/中/长期动作+指标)
 * 2. Iron Law 2 (`2–4` Word Noun/Verb-Object Granularity):
 *    - `auditPhraseGranularity(text)` flags overly verbose verbatim transcription (`>8` chars).
 * 3. Summary Cue Strip & Prompt Tail Serialization (`<160` chars, KV-Cache safe).
 */

export const VISUAL_MODEL_META = [
  {
    id: 'scoring_matrix',
    label: '评分矩阵',
    fullLabel: '量化评分矩阵表',
    fitTypes: ['ranking'],
    solvePain: '权重×打分量化排序，3分钟终结感性争吵',
  },
  {
    id: 'roi_quadrant',
    label: '2×2四象限',
    fullLabel: '成本-收益四象限',
    fitTypes: ['dilemma', 'case_debate'],
    solvePain: '直观划分 P0–P3 梯队，体现商业 ROI 取舍',
  },
  {
    id: 'mece_tree',
    label: 'MECE逻辑树',
    fullLabel: 'MECE 归因逻辑树',
    fitTypes: ['open'],
    solvePain: '正交拆解三大主干，不重不漏防点子零散',
  },
  {
    id: 'swimlane_funnel',
    label: '阶段泳道',
    fullLabel: '短中长期泳道漏斗',
    fitTypes: ['planning'],
    solvePain: '按时间线绑定动作与指标，确保落地闭环',
  },
]

export function resolveVisualModelByTopicType(topicType = 'open') {
  const norm = String(topicType || 'open').trim().toLowerCase()
  if (norm === 'ranking') return 'scoring_matrix'
  if (norm === 'dilemma' || norm === 'case_debate') return 'roi_quadrant'
  if (norm === 'planning') return 'swimlane_funnel'
  return 'mece_tree'
}

/**
 * Extract concise hard-constraint pills (`预算≤2万`, `72小时`, `削减20%`, etc.) from case material.
 */
export function extractConstraintsFromMaterial(topic = '', material = '') {
  const text = `${topic || ''} ${material || ''}`
  const found = []
  const patterns = [
    /(?:预算|经费|总预算|资金)[^，。；\s]{0,6}?\d+(?:\.\d+)?\s*(?:万元|万|亿元|亿|元|%)/g,
    /削减\s*\d+(?:\.\d+)?\s*%/g,
    /\d+\s*(?:小时|天|周|个月)内?/g,
    /(?:仅能|只能|最多|限)\s*[^，。；]{2,10}/g,
    /\d+\s*(?:选)\s*\d+/g,
    /不允许裁员/g,
  ]
  for (const re of patterns) {
    const matches = text.match(re) || []
    for (const raw of matches) {
      const clean = raw.replace(/\s+/g, '').slice(0, 12)
      if (clean && !found.includes(clean)) {
        found.push(clean)
      }
      if (found.length >= 3) break
    }
    if (found.length >= 3) break
  }
  if (!found.length) {
    found.push('限时达成唯一共识', '兼顾成本与可落地性')
  }
  return found.slice(0, 3)
}

function buildDefaultCriteria(modelType) {
  if (modelType === 'scoring_matrix') {
    return [
      { id: 'c1', label: '紧迫生存度', weight: 5 },
      { id: 'c2', label: '不可替代性', weight: 4 },
      { id: 'c3', label: '落地可靠性', weight: 3 },
    ]
  }
  if (modelType === 'roi_quadrant') {
    return [
      { id: 'c1', label: '投入产出ROI', weight: 5 },
      { id: 'c2', label: '业务止损速度', weight: 4 },
      { id: 'c3', label: '合规与士气', weight: 3 },
    ]
  }
  if (modelType === 'swimlane_funnel') {
    return [
      { id: 'c1', label: '获客低成本', weight: 5 },
      { id: 'c2', label: '漏斗转化率', weight: 4 },
      { id: 'c3', label: '执行可控度', weight: 3 },
    ]
  }
  return [
    { id: 'c1', label: '痛点覆盖度', weight: 5 },
    { id: 'c2', label: '落地低成本', weight: 4 },
    { id: 'c3', label: '指标可量化', weight: 3 },
  ]
}

export function createInitialVisualBoard({ topic = '', material = '', topicType = 'open' } = {}) {
  const modelType = resolveVisualModelByTopicType(topicType)
  const shortTarget = String(topic || '达成唯一可执行共识').trim().slice(0, 22)
  const constraints = extractConstraintsFromMaterial(topic, material)
  const criteria = buildDefaultCriteria(modelType)

  return {
    modelType,
    topicType: topicType || 'open',
    target: shortTarget,
    constraints,
    stageChecks: {
      criteria: false,
      debate: false,
      converge: false,
    },
    criteria,
    matrix: {
      rows: [
        { id: 'm1', label: '备选方案A', scores: [5, 4, 4] },
        { id: 'm2', label: '备选方案B', scores: [4, 5, 3] },
        { id: 'm3', label: '备选方案C', scores: [3, 3, 4] },
      ],
    },
    quadrant: {
      p0: ['核心止血动作'],
      p1: ['中期机制升级'],
      p2: ['低本工具试水'],
      p3: ['高耗低效暂缓'],
    },
    tree: [
      { id: 't1', branch: '流程机制', items: ['异步站会', '明确Owner'] },
      { id: 't2', branch: '工具标准', items: ['共享看板', '文档沉淀'] },
      { id: 't3', branch: '考核兜底', items: ['量化KPI', '双周复盘'] },
    ],
    swimlane: [
      { id: 's1', stage: '短期引流', action: '种子裂变破局', metric: '首周激活≥25%' },
      { id: 's2', stage: '中期转化', action: '场景标杆深耕', metric: '转化率≥18%' },
      { id: 's3', stage: '长期留存', action: '复盘机制固化', metric: '次月留存≥40%' },
    ],
    parkingLot: [],
    consensusLocked: false,
    focusHeadline: '',
  }
}

/**
 * Compute weighted total & rank for `scoring_matrix` rows (`∑ weight_i × score_i`).
 */
export function computeMatrixRankings(matrix, criteria = []) {
  const rows = matrix?.rows || []
  const weights = [0, 1, 2].map((idx) => Math.max(1, Math.min(5, Number(criteria[idx]?.weight) || 3)))
  const computed = rows.map((row) => {
    const sc = Array.isArray(row.scores) ? row.scores : [3, 3, 3]
    const weightedTotal = weights.reduce(
      (acc, w, idx) => acc + w * Math.max(1, Math.min(5, Number(sc[idx]) || 0)),
      0,
    )
    return {
      ...row,
      scores: [0, 1, 2].map((idx) => Math.max(1, Math.min(5, Number(sc[idx]) || 3))),
      weightedTotal,
    }
  })
  const sortedIds = [...computed]
    .sort((a, b) => b.weightedTotal - a.weightedTotal)
    .map((r) => r.id)
  return computed.map((item) => ({
    ...item,
    rank: sortedIds.indexOf(item.id) + 1,
  }))
}

/**
 * Iron Law 2: Enforce `2–4` (up to 6) character noun/verb-object granularity, warning against verbatim dictation.
 */
export function auditPhraseGranularity(text = '') {
  const trimmed = String(text || '').trim()
  const chars = trimmed.length
  if (chars === 0) {
    return { status: 'empty', chars: 0, badge: '待填', hint: '' }
  }
  if (chars <= 6) {
    return { status: 'optimal', chars, badge: '短词锚点', hint: '' }
  }
  if (chars <= 8) {
    return { status: 'acceptable', chars, badge: '精炼可用', hint: '' }
  }
  return {
    status: 'verbose',
    chars,
    badge: `${chars}字偏长`,
    hint: '铁律2：建议浓缩为2–6字动宾/名词短语，拒绝逐字默写',
  }
}

/**
 * Extract crisp 2–6 char candidate phrases from recent teammate utterances for 1-click capture.
 */
export function extractTeammateShortPhrases(messages = [], limit = 6) {
  const out = []
  const seen = new Set()
  const nonSys = (messages || []).filter((m) => !m.isSystem && m.role !== 'system' && (m.content || m.text))
  const tokenRe = /(异步站会|三行日志|无会日|量化看板|ROI核算|分阶段试点|首月试运行|双周复盘|淘汰红线|责任到人|私域裂变|阶梯补贴|风险兜底|卫星信标|压缩军粮|急救箱|低本止血|核心留存)/g

  for (let i = nonSys.length - 1; i >= 0 && out.length < limit; i -= 1) {
    const msg = nonSys[i]
    const txt = String(msg.content || msg.text || '')
    const matches = txt.match(tokenRe) || []
    for (const m of matches) {
      if (!seen.has(m)) {
        seen.add(m)
        out.push({
          phrase: m,
          fromSpeaker: msg.senderName || msg.speaker || '队友',
          isDigression: msg.senderId === 'digresser',
        })
      }
      if (out.length >= limit) break
    }
    if (out.length < limit && msg.senderId === 'digresser' && txt.length >= 4) {
      const tag = /(纪录片|元宇宙|VR|游戏化)/.exec(txt)?.[1]
      if (tag && !seen.has(`${tag}展望`)) {
        seen.add(`${tag}展望`)
        out.push({
          phrase: `${tag}展望`,
          fromSpeaker: msg.senderName || '孙偏',
          isDigression: true,
        })
      }
    }
  }
  return out
}

/**
 * Derive primary conclusions from whichever visual model is active.
 */
export function extractPrimaryConclusions(board) {
  if (!board) return []
  if (board.modelType === 'scoring_matrix') {
    const ranked = computeMatrixRankings(board.matrix, board.criteria)
      .sort((a, b) => a.rank - b.rank)
      .slice(0, 3)
    return ranked.map((r) => `TOP${r.rank}:${r.label}(${r.weightedTotal}分)`)
  }
  if (board.modelType === 'roi_quadrant') {
    const p0 = (board.quadrant?.p0 || []).slice(0, 2).join('/')
    const p1 = (board.quadrant?.p1 || []).slice(0, 2).join('/')
    return [p0 ? `P0必保:${p0}` : null, p1 ? `P1攻坚:${p1}` : null].filter(Boolean)
  }
  if (board.modelType === 'swimlane_funnel') {
    return (board.swimlane || []).map((s) => `${s.stage}:${s.action}(${s.metric})`).slice(0, 3)
  }
  return (board.tree || [])
    .map((b) => `${b.branch}:${(b.items || []).slice(0, 2).join('/')}`)
    .slice(0, 3)
}

/**
 * Build single-line Cue Strip items for `summary_report` (`铁律3：打通可视化 → 总结陈词最后一公里`).
 */
export function buildSummaryCueItems(board) {
  if (!board) return []
  const critText = (board.criteria || [])
    .map((c) => c.label)
    .filter(Boolean)
    .slice(0, 3)
    .join('·')
  const conclusions = extractPrimaryConclusions(board)
  const parking = (board.parkingLot || [])
    .map((p) => p.text)
    .filter(Boolean)
    .slice(0, 2)
    .join('·')

  const cues = []
  if (critText) {
    cues.push({ id: 'cue-criteria', badge: '标准', text: critText })
  }
  conclusions.slice(0, 2).forEach((conc, idx) => {
    cues.push({ id: `cue-main-${idx}`, badge: `结论${idx + 1}`, text: conc })
  })
  if (parking) {
    cues.push({ id: 'cue-parking', badge: '长期展望', text: parking })
  } else if (board.constraints?.[0]) {
    cues.push({ id: 'cue-bound', badge: '风控边界', text: board.constraints[0] })
  }
  return cues
}

/**
 * Compact `<160` char tail context summary for AI sandboxes (preserves KV-Cache static prefix!).
 */
export function serializeBoardForPrompt(board, authorized = false) {
  if (!board || !authorized) return ''
  const modelMeta = VISUAL_MODEL_META.find((m) => m.id === board.modelType) || VISUAL_MODEL_META[0]
  const crit = (board.criteria || [])
    .map((c) => c.label)
    .filter(Boolean)
    .slice(0, 3)
    .join('、')
  const main = extractPrimaryConclusions(board).slice(0, 2).join('；')
  const park = (board.parkingLot || [])
    .map((p) => p.text)
    .filter(Boolean)
    .slice(0, 2)
    .join('、')
  const parts = [`[${modelMeta.label}]`, crit ? `标准:${crit}` : '', main ? `主线:${main}` : '', park ? `暂存:${park}` : '']
    .filter(Boolean)
    .join(' | ')
  return parts.slice(0, 160)
}
