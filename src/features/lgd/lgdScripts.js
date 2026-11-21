/** Scripted LGD agent lines (谈锋自编，非企业真题) */

export const USER_ROLES = [
  { id: 'leader', label: '领导者', hint: '适合主动定框架、推动共识' },
  { id: 'timekeeper', label: '计时员', hint: '负责报时与阶段提醒' },
  { id: 'reporter', label: '汇报人', hint: '总结环节代表小组发言' },
  { id: 'member', label: '普通成员', hint: '按序陈述、自由讨论接话' },
]

export const IDENTITY_MODES = [
  {
    id: 'undetermined',
    label: '身份待定',
    badge: '实战抢位 · 推荐',
    desc: '入场随机 1~8 号席位，全员初始身份「待定」；你与 AI 均可在发言时选择身份，并加入抢发言队列按顺位发言。',
  },
  {
    id: 'random',
    label: '身份随机',
    badge: '入场即定',
    desc: '入场随机 1~8 号席位，同时立即完成全员 8 人职能身份随机分配，落座后直接进入审题。',
  },
]

export const CLAIMABLE_IDENTITIES = [
  { id: 'undetermined', label: '身份待定', short: '待定', icon: '⏳', scorerRole: 'member', hint: '暂不锁定身份，观察局势后再认领' },
  { id: 'leader', label: '控场 Leader', short: '控场者', icon: '👑', scorerRole: 'leader', hint: '统筹议程、拆解框架、推动表决' },
  { id: 'framework', label: '破冰立框者', short: '立框者', icon: '🧭', scorerRole: 'leader', hint: '界定痛点边界与三维分析框架' },
  { id: 'analyst', label: '逻辑分析师', short: '逻辑控', icon: '📐', scorerRole: 'member', hint: '把控因果链、ROI 与量化指标' },
  { id: 'timekeeper', label: '计时控场员', short: '计时员', icon: '⏱️', scorerRole: 'timekeeper', hint: '切分时间节点、预警倒计时防跑题' },
  { id: 'coordinator', label: '协调纪要员', short: '协调纪要', icon: '🤝', scorerRole: 'member', hint: '桥接对立分歧、沉淀阶段共识' },
  { id: 'challenger', label: '风险质询者', short: '质询者', icon: '⚡', scorerRole: 'member', hint: '审视执行盲区、追问责任红线' },
  { id: 'reporter', label: '总结汇报人', short: '汇报人', icon: '📋', scorerRole: 'reporter', hint: '汇总全组结论、理由与分歧陈词' },
  { id: 'member', label: '核心建言者', short: '建言者', icon: '💡', scorerRole: 'member', hint: '贡献创新抓手与落地执行细节' },
]

export const ROLE_LABELS = {
  undetermined: '待定',
  leader: '领导者',
  framework: '立框者',
  analyst: '逻辑控',
  timekeeper: '计时员',
  coordinator: '协调纪要',
  challenger: '质询者',
  reporter: '汇报人',
  member: '成员',
}

export const AGENTS = [
  { id: 'ice_breaker', seat: 1, name: '小林', role: '破冰者', color: '#5a8ac4', emoji: '🧊', behavior: 'normal', contextLimit: 4 },
  { id: 'idea_king', seat: 2, name: '陈思', role: '点子王', color: '#FFB020', emoji: '💡', behavior: 'normal', contextLimit: 5 },
  { id: 'logician', seat: 3, name: '李理', role: '逻辑王', color: '#9b6fc7', emoji: '🧠', behavior: 'normal', contextLimit: 6 },
  { id: 'interrupter', seat: 5, name: '韩抢', role: '抢话者', color: '#d45c5c', emoji: '⚡', behavior: 'interrupt', contextLimit: 3 },
  { id: 'digresser', seat: 6, name: '孙偏', role: '跑题者', color: '#87CEEB', emoji: '🌀', behavior: 'digress', contextLimit: 3 },
  { id: 'mediator', seat: 7, name: '王和', role: '和事佬', color: '#00C48C', emoji: '🕊️', behavior: 'normal', contextLimit: 5 },
  { id: 'timekeeper', seat: 8, name: '刘时', role: '计时员', color: '#FF8C00', emoji: '⏱️', behavior: 'normal', contextLimit: 4 },
]

export const STATEMENT_ORDER = [
  'ice_breaker',
  'idea_king',
  'logician',
  'user',
  'interrupter',
  'digresser',
  'mediator',
  'timekeeper',
]

export const FAST_TRAINING_SCRIPTS = [
  {
    id: 'standard_flow',
    name: '标准群面快训脚本（经典全流程）',
    badge: 'AUTO-SCRIPT · 标准流',
    description: '1号破冰定框 → 狼人杀式按号轮流陈述 → 5号抢话与6号跑题自动触发 → 8号控时收敛。',
    turnOrder: ['ice_breaker', 'idea_king', 'logician', 'user', 'interrupter', 'digresser', 'mediator', 'timekeeper'],
  },
  {
    id: 'werewolf_clash',
    name: '狼人杀式高压对抗脚本（观点交锋）',
    badge: 'AUTO-SCRIPT · 高压对抗',
    description: '单模型多Agent沙箱隔离隐藏任务卡：3号逻辑王与5号抢话者形成对立阵营，轮番向4号（你）施压质询。',
    turnOrder: ['ice_breaker', 'interrupter', 'logician', 'user', 'idea_king', 'mediator', 'digresser', 'timekeeper'],
  },
  {
    id: 'convergence_sprint',
    name: '极限控时收敛脚本（防跑题急救）',
    badge: 'AUTO-SCRIPT · 极限收敛',
    description: '6号跑题者与2号点子王连续发散议题，8号计时员高频倒计时预警，专练快速拉回主线与定稿。',
    turnOrder: ['idea_king', 'digresser', 'ice_breaker', 'user', 'timekeeper', 'logician', 'interrupter', 'mediator'],
  },
  {
    id: 'memory_adaptive',
    name: '记忆模式弱项强化脚本（自适应追击）',
    badge: 'MEMORY · 弱项追击',
    description: '读取上一次训练保存的设定与薄弱项（如发言占比低、少承接他人、缺推进话术），在讨论中定向点名触发。',
    turnOrder: ['ice_breaker', 'logician', 'mediator', 'user', 'interrupter', 'idea_king', 'digresser', 'timekeeper'],
  },
  {
    id: 'anti_teleprompter_probe',
    name: '反提词器追问压力脚本（防背稿/防AI作弊质询）',
    badge: 'ANTI-SCRIPT · 反套话追问',
    description: '针对市面上AI提词器常见空泛套话，3号逻辑王与5号抢话者对4号（你）发起即席参数追问，强制检验现场倾听与真实逻辑。',
    turnOrder: ['ice_breaker', 'logician', 'interrupter', 'user', 'idea_king', 'mediator', 'digresser', 'timekeeper'],
  },
  {
    id: 'leader_vacancy_brawl',
    name: '双雄争霸破局脚本（隐形Leader争夺战）',
    badge: 'BRAWL · 双雄争霸',
    description: '1号破冰者与5号抢话者同时争夺隐形Leader控场权，场面陷入分裂，考验4号（你）如何通过二阶框架整合实现破局夺权。',
    turnOrder: ['ice_breaker', 'interrupter', 'idea_king', 'user', 'logician', 'digresser', 'mediator', 'timekeeper'],
  },
]

export function getScriptById(scriptId) {
  return FAST_TRAINING_SCRIPTS.find((s) => s.id === scriptId) || FAST_TRAINING_SCRIPTS[0]
}

export const RESPONSES = {
  personal_statement: {
    ice_breaker: [
      '我先抛砖引玉。这道题的关键是先把问题边界定清楚：我们讨论的是全远程还是混合办公？我建议用「信息同步、任务协同、团队凝聚力」三个维度来拆解，后面每位同学可以选一个维度展开。',
    ],
    idea_king: [
      '我同意先定框架。补充一点：除了工具和流程，我觉得可以大胆考虑「异步优先」——用录屏和文档减少同步会议，这可能是成本最低的切入点。',
    ],
    logician: [
      '我从逻辑链说一下：效率低往往来自信息不对称和反馈延迟。个人陈述阶段我先强调：任何方案都要可衡量，比如响应时延、会议时长、任务准时率。',
    ],
    interrupter: [
      '等一下，我觉得不能一上来就谈工具！很多团队效率差是管理者不会异步写作规范——我先把这个观点放这里，后面自由讨论再展开。',
    ],
    digresser: [
      '说到远程，我上周看了一个纪录片讲南极科考站也是远程协作，他们用每日三行日志同步，跟我们话题可能有点远，但我觉得「极简同步模板」值得借鉴。',
    ],
    mediator: [
      '前面几位角度不同但都提到「同步机制」。我陈述时的立场是：工具和制度要配套，我们可以先求共识再收敛方案。',
    ],
    timekeeper: [
      '我负责看时间。个人陈述里我提醒：自由讨论阶段建议每 10 分钟做一次 30 秒小结，避免跑题；我会主动报时。',
    ],
  },
  free_discussion: {
    ice_breaker: [
      '回到正题，短期最容易落地的是「每日异步站会」：每人 1 分钟语音汇报，比长文字快，也比开会轻。',
    ],
    idea_king: [
      '我又想到一个点：设立「无会日」，每周一天不安排会议，让大家有完整专注时间，和异步文化配套。',
    ],
    logician: [
      '归纳一下：目前方案可以分三类——工具、流程、文化。我建议按落地难度从低到高排序，先做异步站会和写作规范。',
    ],
    interrupter: [
      '打断一下！你们说的都太理想了——没有 KPI 的远程团队就是摸鱼团队，必须先定可见产出，再谈工具！',
      '先听我说完：不同意「减少开会」这种绝对化说法，决策会必须同步，只是通报会可以异步化。',
    ],
    digresser: [
      '对了，我想到游戏化的积分换弹性假期，跟远程正反馈有关……不过也许跑题了，还是先回到异步站会吧。',
      '突然想到元宇宙办公室，Meta 那个项目失败说明不能模拟线下，但 VR 破冰也许有用——算了，回到效率指标。',
    ],
    mediator: [
      '韩抢和陈思都有道理。折中一下：产出可见性和异步规范不矛盾，可以并行推进，我来做个桥接总结。',
    ],
    timekeeper: [
      '提醒：自由讨论已过半，建议接下来 5 分钟内确定 2 个优先方案和一个汇报结构。',
    ],
  },
  summary_report: {
    logician: [
      '我代表小组汇报：共识是「异步为主、同步为辅」。优先落地异步站会与写作规范，中期推进无会日与可见产出看板；仍存分歧是 KPI 强度。以上供参考。',
    ],
    timekeeper: [
      '总结：我们同意先低成本改变——异步站会、三行日志、无会日；汇报人需向考官说明理由与分工，并坦诚 KPI 分歧尚未完全解决。',
    ],
  },
  examiner_followup: {
    mediator: [
      '我补充救援一点：刚才我们并非忽略执行阻力，而是将高成本项放入了长期展望池，首月聚焦零预算机制验证。',
    ],
    logician: [
      '补充量化兜底口径：即便预算或人手砍半，只要保住核心P0动作与双周转化率红线，整体ROI依然为正。',
    ],
  },
}

export const DEFAULT_TOPIC = '远程团队协作效率提升方案'
export const DEFAULT_MATERIAL =
  '随着后疫情时代的到来，越来越多的企业采用远程或混合办公模式。然而，远程团队在信息同步、任务协同和团队凝聚力方面面临诸多挑战。据调查显示，68% 的远程员工表示在协作效率上存在明显障碍，42% 的管理者认为远程团队的产出低于预期。请你们团队讨论如何系统性地提升远程团队的协作效率，并给出可落地的解决方案。'

export const PHASE_DEFS = [
  { key: 'reading', label: '阅读材料' },
  { key: 'personal_statement', label: '个人陈述' },
  { key: 'free_discussion', label: '自由讨论' },
  { key: 'summary_report', label: '总结汇报' },
  { key: 'examiner_followup', label: '考官追问' },
]

/**
 * Compute 2:6:2 Golden Time Ratio stage inside `free_discussion`:
 * - First 20%: `criteria` (统一审题边界与评判标准)
 * - Middle 60%: `debate` (填充模块方案并消弭分歧)
 * - Final 20%: `converge` (核对逻辑漏洞并选定汇报代表)
 */
export function computeFreeDiscussionGoldenStage(remainingSeconds = 420, totalSeconds = 600) {
  const total = Math.max(60, Number(totalSeconds) || 600)
  const rem = Math.max(0, Math.min(total, Number(remainingSeconds) || 0))
  const elapsedRatio = 1 - rem / total
  if (elapsedRatio < 0.2) {
    return {
      key: 'criteria',
      index: 0,
      elapsedRatio,
      label: '立标定框',
      shortBadge: '立标 20%',
      ratioLabel: '黄金2:6:2 · 前20%',
      hint: '先确立评判标准与硬约束边界，切忌直跳选项',
    }
  }
  if (elapsedRatio < 0.8) {
    return {
      key: 'debate',
      index: 1,
      elapsedRatio,
      label: '方案博弈',
      shortBadge: '博弈 60%',
      ratioLabel: '黄金2:6:2 · 中60%',
      hint: '围绕标准填充核心模块，用 Parking Lot 收纳超纲点子',
    }
  }
  return {
    key: 'converge',
    index: 2,
    elapsedRatio,
    label: '收敛推选',
    shortBadge: '收敛 20%',
    ratioLabel: '黄金2:6:2 · 后20%',
    hint: '核对逻辑漏洞、锁定唯一共识并推选汇报代表',
  }
}

/**
 * Three-Examiner Panel Definitions (主面试官·顾总监 + 副面试官A·苏经理 + 副面试官B·周PM)
 */
export const EXAMINER_PANEL_DEFS = [
  {
    id: 'lead',
    name: '主面试官 · 顾总监',
    shortName: '顾总监',
    roleTitle: '主持人 / 业务骨干',
    focus: '宣读规则 · 把控总时间 · 逻辑架构与破局点 (30%)',
    weightLabel: '逻辑 30%',
    color: '#f59e0b',
  },
  {
    id: 'observer_a',
    name: '副面试官A · 苏经理',
    shortName: '苏经理',
    roleTitle: '分区观察员 / HRBP',
    focus: '分区盯人 · 情绪稳定与倾听态度 · 霸麦/攻击一票否决 (50%)',
    weightLabel: '协作/表达/抗压 50%',
    color: '#ec4899',
  },
  {
    id: 'scribe_b',
    name: '副面试官B · 周PM',
    shortName: '周PM',
    roleTitle: '里程碑记录员 / 资深PM',
    focus: '[MM:SS] 贡献账本 · 破冰/立框/拉回主线 · Timer&Reporter履职 (20%)',
    weightLabel: '角色贡献 20%',
    color: '#38bdf8',
  },
]

export function computeZoneWatchSeats(userSeat = 4) {
  const safe = Math.max(1, Math.min(8, Number(userSeat) || 4))
  return safe <= 4 ? [1, 2, 3, 4] : [5, 6, 7, 8]
}

export function buildClientMilestoneLedger(messages = [], seatMap = null, participantRoles = {}) {
  const smap = { ...DEFAULT_SEAT_MAP, ...(seatMap || {}) }
  const nonSys = (messages || []).filter((m) => !m.isSystem && m.role !== 'system' && String(m.text || m.content || '').trim())
  const ledger = []
  let brokeIce = false
  let prevWasDigress = false

  nonSys.forEach((msg, idx) => {
    const txt = String(msg.text || msg.content || '').trim()
    const isUser = Boolean(msg.isUser || msg.role === 'user' || msg.senderId === 'user')
    const sid = isUser ? 'user' : String(msg.senderId || '')
    const seatNo = smap[sid] || (isUser ? 4 : 1)
    const speakerName = isUser ? '你' : String(msg.senderName || msg.speaker || '队友')
    const estSec = Number.isFinite(msg.elapsed_seconds) ? Math.max(0, Math.round(msg.elapsed_seconds)) : Math.max(5, (idx + 1) * 18)
    const tsLabel = `${String(Math.floor(estSec / 60)).padStart(2, '0')}:${String(estSec % 60).padStart(2, '0')}`
    const phase = msg.phase || 'free_discussion'
    const quote = txt.length > 36 ? `${txt.slice(0, 36)}…` : txt

    if (!brokeIce && (phase === 'personal_statement' || phase === 'free_discussion')) {
      brokeIce = true
      ledger.push({ ts_label: tsLabel, seat: seatNo, participant_id: sid || speakerName, speaker: `${seatNo}号·${speakerName}`, milestone: '首轮破冰开场', impact: 2, detail: quote })
    }
    if (/(维度|框架|三层|三点|分两步|分阶段|第一.*第二|评判标准|筛选标准|排序标准|权重)/.test(txt)) {
      ledger.push({ ts_label: tsLabel, seat: seatNo, participant_id: sid || speakerName, speaker: `${seatNo}号·${speakerName}`, milestone: '核心框架/标准确立', impact: 3, detail: quote })
    }
    if (prevWasDigress && /(拉回|回到主线|回到正题|暂存区|Parking\s*Lot|集中火力|收敛)/i.test(txt)) {
      ledger.push({ ts_label: tsLabel, seat: seatNo, participant_id: sid || speakerName, speaker: `${seatNo}号·${speakerName}`, milestone: '偏题拉回主线', impact: 3, detail: quote })
    }
    if (/(还剩\s*\d+\s*(分钟|秒)|注意时间|时间不多|倒计时)/.test(txt) && /(收敛|表决|排序|优先级|分工|汇报人|提纲|小结)/.test(txt)) {
      ledger.push({ ts_label: tsLabel, seat: seatNo, participant_id: sid || speakerName, speaker: `${seatNo}号·${speakerName}`, milestone: '关键时间节点控场', impact: 2, detail: quote })
    }
    if (phase === 'summary_report' || msg.meta?.summary) {
      ledger.push({ ts_label: tsLabel, seat: seatNo, participant_id: sid || speakerName, speaker: `${seatNo}号·${speakerName}`, milestone: '全组总结陈词汇报', impact: 3, detail: quote })
    }
    prevWasDigress = sid === 'digresser' || /(纪录片|南极|元宇宙|VR)/.test(txt)
  })

  if (participantRoles?.user === 'timekeeper' && nonSys.some((m) => m.isUser || m.role === 'user')) {
    const checkedClock = nonSys.some(
      (m) => (m.isUser || m.role === 'user') && /(还剩\s*\d+\s*(分钟|秒)|注意时间|时间不多|看下时间|倒计时)/.test(String(m.text || m.content || '')),
    )
    if (!checkedClock) {
      const uSeat = smap.user || 4
      ledger.push({
        ts_label: '履职预警',
        seat: uSeat,
        participant_id: 'user',
        speaker: `${uSeat}号·你`,
        milestone: '认领Timer尚未报时',
        impact: -3,
        detail: '已选计时员角色，注意结合2:6:2节点主动报时推进',
      })
    }
  }
  return ledger.slice(-10)
}

export function buildExaminerFollowupPrompts({
  topicType = 'open',
  topic = DEFAULT_TOPIC,
  userSeat = 4,
  visualBoard = null,
} = {}) {
  const shortTopic = String(topic || DEFAULT_TOPIC).slice(0, 18)
  const hasParking = (visualBoard?.parkingLot || []).length > 0
  const zoneSeats = computeZoneWatchSeats(userSeat)
  const bizQuestion =
    topicType === 'ranking'
      ? `【主面试官·顾总监】点名 ${userSeat}号同学追问：如果现场救援/执行资源再砍掉一半，只能保留唯一 1 项最核心选择，基于你们刚才确立的评判标准你会保哪一项？如何应对放弃其余项的连锁风险？`
      : topicType === 'dilemma' || topicType === 'case_debate'
        ? `【主面试官·顾总监】追问 ${userSeat}号同学：若下季度核心预算或现金流窗口再压缩 50%，你们针对「${shortTopic}」定的首选路径还能成立吗？请给出底线止损指标。`
        : `【主面试官·顾总监】追问 ${userSeat}号同学：刚才汇报的「${shortTopic}」方案听起来较理想，若业务一线以增加负担为由抵触配合，你们最硬核的最小可行闭环（MVP）是什么？`

  const hrQuestion = hasParking
    ? `【副面试官B·周PM】翻看时间戳贡献账本追问 ${userSeat}号同学：我记录到你们把争议想法放入了暂存区（Parking Lot）。请客观评价今天哪位队友的破局贡献最关键？你如何看待未采纳观点的价值？`
    : `【副面试官A·苏经理】针对重点观察半区（${zoneSeats.join('/')}号）追问 ${userSeat}号同学：复盘刚才整场自由讨论，面对队友质疑或分歧拉扯时你是如何平衡个人主张与团队共识收敛的？`

  return [
    {
      step: 0,
      examiner: 'business',
      panelId: 'lead',
      examinerName: '主面试官 · 顾总监',
      emoji: '🎯',
      color: '#f59e0b',
      prompt: bizQuestion,
    },
    {
      step: 1,
      examiner: 'hr',
      panelId: hasParking ? 'scribe_b' : 'observer_a',
      examinerName: hasParking ? '副面试官B · 周PM' : '副面试官A · 苏经理',
      emoji: '🧭',
      color: hasParking ? '#38bdf8' : '#ec4899',
      prompt: hrQuestion,
    },
  ]
}

export function pickAgentForFreeDiscussion(scriptId = 'standard_flow') {
  const roll = Math.random()
  if (scriptId === 'werewolf_clash' || scriptId === 'anti_teleprompter_probe') {
    if (roll < 0.38) return AGENTS.find((a) => a.id === 'interrupter')
    if (roll < 0.72) return AGENTS.find((a) => a.id === 'logician')
  } else if (scriptId === 'leader_vacancy_brawl') {
    if (roll < 0.36) return AGENTS.find((a) => a.id === 'ice_breaker')
    if (roll < 0.72) return AGENTS.find((a) => a.id === 'interrupter')
  } else if (scriptId === 'convergence_sprint') {
    if (roll < 0.35) return AGENTS.find((a) => a.id === 'digresser')
    if (roll < 0.65) return AGENTS.find((a) => a.id === 'timekeeper')
  } else {
    if (roll < 0.22) return AGENTS.find((a) => a.id === 'interrupter')
    if (roll < 0.38) return AGENTS.find((a) => a.id === 'digresser')
  }
  return AGENTS[Math.floor(Math.random() * AGENTS.length)]
}

export const DEFAULT_SEAT_MAP = {
  ice_breaker: 1,
  idea_king: 2,
  logician: 3,
  user: 4,
  interrupter: 5,
  digresser: 6,
  mediator: 7,
  timekeeper: 8,
}

const AGENT_CLAIM_PREFS = {
  ice_breaker: ['framework', 'leader', 'member'],
  idea_king: ['member', 'framework', 'coordinator'],
  logician: ['analyst', 'reporter', 'leader'],
  interrupter: ['challenger', 'leader', 'analyst'],
  digresser: ['member', 'challenger'],
  mediator: ['coordinator', 'reporter', 'member'],
  timekeeper: ['timekeeper', 'coordinator', 'reporter'],
}

export function getIdentityMeta(roleId) {
  const norm = String(roleId || 'member').trim().toLowerCase()
  return CLAIMABLE_IDENTITIES.find((item) => item.id === norm) || CLAIMABLE_IDENTITIES[CLAIMABLE_IDENTITIES.length - 1]
}

export function mapIdentityToScorerRole(roleId) {
  return getIdentityMeta(roleId).scorerRole || 'member'
}

export function resolveParticipantSeat(id, seatMap = null) {
  if (seatMap && Number.isInteger(Number(seatMap[id]))) {
    const val = Number(seatMap[id])
    if (val >= 1 && val <= 8) return val
  }
  return DEFAULT_SEAT_MAP[id] ?? 4
}

/**
 * Fisher-Yates 8-seat randomization across `user` + 7 AI candidates (`1号 ~ 8号`).
 */
export function generateShuffledSeats(rng = Math.random) {
  const participantIds = ['user', ...AGENTS.map((a) => a.id)]
  const seats = [1, 2, 3, 4, 5, 6, 7, 8]
  for (let i = seats.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1))
    const tmp = seats[i]
    seats[i] = seats[j]
    seats[j] = tmp
  }
  const seatMap = {}
  participantIds.forEach((pid, idx) => {
    seatMap[pid] = seats[idx]
  })
  const orderedBySeat = [...participantIds].sort((a, b) => seatMap[a] - seatMap[b])
  return {
    seatMap,
    orderedBySeat,
    userSeat: seatMap.user,
  }
}

/**
 * Assign initial functional identities according to `identityMode`:
 * - `'undetermined'`: all 8 seats start as `'undetermined'` (`待定`)
 * - `'random'`: balanced 8-role pool randomly distributed across all 8 seats immediately
 * - `'pick'`: user keeps `pickedUserRole`, remaining 7 roles distributed across AI seats
 */
export function generateInitialParticipantRoles(
  identityMode = 'undetermined',
  seatMap = DEFAULT_SEAT_MAP,
  pickedUserRole = 'member',
  rng = Math.random,
) {
  const allIds = ['user', ...AGENTS.map((a) => a.id)].sort(
    (a, b) => resolveParticipantSeat(a, seatMap) - resolveParticipantSeat(b, seatMap),
  )
  if (identityMode === 'undetermined') {
    const map = {}
    allIds.forEach((id) => {
      map[id] = 'undetermined'
    })
    return map
  }

  const pool = ['leader', 'framework', 'analyst', 'timekeeper', 'coordinator', 'challenger', 'reporter', 'member']
  if (identityMode === 'pick') {
    const userChoice = CLAIMABLE_IDENTITIES.some((c) => c.id === pickedUserRole) ? pickedUserRole : 'member'
    const remaining = pool.filter((r) => r !== userChoice)
    while (remaining.length < AGENTS.length) remaining.push('member')
    for (let i = remaining.length - 1; i > 0; i -= 1) {
      const j = Math.floor(rng() * (i + 1))
      const t = remaining[i]
      remaining[i] = remaining[j]
      remaining[j] = t
    }
    const map = { user: userChoice }
    AGENTS.forEach((ag, idx) => {
      map[ag.id] = remaining[idx] || 'member'
    })
    return map
  }

  // `random` mode: shuffle all 8 distinct functional identities across the 8 seats
  const shuffledRoles = [...pool]
  for (let i = shuffledRoles.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1))
    const t = shuffledRoles[i]
    shuffledRoles[i] = shuffledRoles[j]
    shuffledRoles[j] = t
  }
  const map = {}
  allIds.forEach((id, idx) => {
    map[id] = shuffledRoles[idx] || 'member'
  })
  return map
}

/**
 * When `identityMode === 'undetermined'`, let an AI candidate claim an unclaimed/fitting
 * functional identity right when it speaks!
 */
export function inferAgentClaimedIdentity(agentId, participantRoles = {}, phase = 'free_discussion') {
  const current = participantRoles?.[agentId]
  if (current && current !== 'undetermined') {
    return getIdentityMeta(current)
  }
  if (phase === 'summary_report') {
    return getIdentityMeta('reporter')
  }
  const alreadyClaimed = new Set(
    Object.entries(participantRoles || {})
      .filter(([k, v]) => k !== agentId && v && v !== 'undetermined')
      .map(([, v]) => v),
  )
  const prefs = AGENT_CLAIM_PREFS[agentId] || ['member']
  for (const cand of prefs) {
    if (cand === 'member' || !alreadyClaimed.has(cand)) {
      return getIdentityMeta(cand)
    }
  }
  return getIdentityMeta(prefs[0] || 'member')
}

export function getOrderedStatementTurnIds(scriptId = 'standard_flow', seatMap = null) {
  if (seatMap && Object.keys(seatMap).length >= 8) {
    return ['user', ...AGENTS.map((a) => a.id)].sort(
      (a, b) => resolveParticipantSeat(a, seatMap) - resolveParticipantSeat(b, seatMap),
    )
  }
  const script = getScriptById(scriptId)
  return script.turnOrder || STATEMENT_ORDER
}

/**
 * Build sorted grab-to-speak `speakerQueue` combining human priority queue + AI urgency bids.
 */
export function buildSortedSpeakerQueue({
  bids = [],
  existingQueue = [],
  activeSpeakerId = null,
  seatMap = DEFAULT_SEAT_MAP,
  participantRoles = {},
  identityMode = 'undetermined',
  maxAiQueued = 3,
} = {}) {
  const result = []
  const userExisting = (existingQueue || []).find((item) => item.id === 'user')
  if (userExisting && activeSpeakerId !== 'user') {
    const uRole = participantRoles?.user || 'undetermined'
    const uMeta = getIdentityMeta(uRole)
    result.push({
      ...userExisting,
      id: 'user',
      seat: resolveParticipantSeat('user', seatMap),
      name: '你',
      emoji: '👤',
      color: '#9b6fc7',
      roleId: uMeta.id,
      roleShort: uMeta.short,
      source: 'user_grab',
    })
  }

  const sortedBids = [...(bids || [])]
    .filter((b) => b.agent_id && b.agent_id !== activeSpeakerId)
    .sort((a, b) => (b.urgency || 0) - (a.urgency || 0))

  for (const bid of sortedBids.slice(0, maxAiQueued)) {
    const ag = AGENTS.find((a) => a.id === bid.agent_id)
    if (!ag) continue
    const curRole = participantRoles?.[ag.id]
    let roleShort = ag.role
    let plannedClaim = null
    if (identityMode === 'undetermined' && (!curRole || curRole === 'undetermined')) {
      const claimMeta = inferAgentClaimedIdentity(ag.id, participantRoles, 'free_discussion')
      plannedClaim = claimMeta.id
      roleShort = `待定→${claimMeta.short}`
    } else if (curRole) {
      roleShort = getIdentityMeta(curRole).short
    }
    result.push({
      id: ag.id,
      seat: resolveParticipantSeat(ag.id, seatMap),
      name: ag.name,
      emoji: ag.emoji,
      color: ag.color,
      roleId: curRole || 'undetermined',
      roleShort,
      plannedClaim,
      urgency: bid.urgency,
      intent: bid.intent,
      source: 'ai_bid',
    })
  }

  return result.map((entry, index) => ({
    ...entry,
    rank: index + 1,
  }))
}

export function agentById(id, seatMap = null, participantRoles = null) {
  if (id === 'user') {
    const rKey = participantRoles?.user
    return {
      id: 'user',
      seat: resolveParticipantSeat('user', seatMap),
      name: '你',
      role: rKey ? getIdentityMeta(rKey).short : '参与者',
      color: '#9b6fc7',
      emoji: '👤',
    }
  }
  const found = AGENTS.find((a) => a.id === id)
  if (!found) return null
  if (!seatMap && !participantRoles) return found
  const rKey = participantRoles?.[found.id]
  return {
    ...found,
    seat: resolveParticipantSeat(found.id, seatMap),
    role: rKey ? getIdentityMeta(rKey).short : found.role,
  }
}

/**
 * 3-Tier De-Cheatified Tactical Scaffolding Levels (渐进脱敏训练脚手架)
 * Unlike commercial cheating teleprompters that give full answers to read verbatim,
 * Edgewise provides structured cognitive cues that fade out as mastery improves.
 */
export const LGD_SCAFFOLD_LEVELS = [
  { id: 'keywords', label: 'L1 关键词胶囊', hint: '仅提示核心破局切入点' },
  { id: 'skeleton', label: 'L2 话术骨架', hint: '提供承接+推进填空句式' },
  { id: 'blind', label: 'L3 实战脱稿', hint: '隐藏提示，全真抗压盲测' },
]

export function getTacticalCuesForContext(
  phase = 'free_discussion',
  userRole = 'member',
  scaffoldLevel = 'keywords',
  seatMap = null,
) {
  if (scaffoldLevel === 'blind') return []

  const sIce = resolveParticipantSeat('ice_breaker', seatMap)
  const sIdea = resolveParticipantSeat('idea_king', seatMap)
  const sLog = resolveParticipantSeat('logician', seatMap)
  const sInt = resolveParticipantSeat('interrupter', seatMap)
  const sDig = resolveParticipantSeat('digresser', seatMap)

  if (phase === 'personal_statement') {
    if (scaffoldLevel === 'keywords') {
      return [
        { tag: '定边界', text: '定义核心矛盾 + 拆解 3 个评估维度', template: '我先补充界定一下本题的核心矛盾：建议从【短期落地成本、中期协同效率、长期风控指标】三个维度来拆解。' },
        { tag: '锚点承接', text: `引用 ${sIce}号/${sIdea}号 观点并给出量化指标`, template: `我非常认同前面 ${sIce}号小林 提到的框架，在此基础上我补充一个可量化的抓手：建议将【响应时延与交付准时率】作为核心验收指标。` },
      ]
    }
    return [
      { tag: '破冰立框', text: '「承接前序 + 三维拆解 + 落地抓手」', template: `在 ${sIce}号小林 和 ${sLog}号李理 的基础上，我从【工具标准、流程闭环、考核激励】三层补充个人观点：第一，优先解决低成本同步；第二，明确边界与验收标准。` },
      { tag: '角色卡位', text: `「${ROLE_LABELS[userRole] || '成员'}视角 + 时间/共识建议」`, template: '个人陈述最后我提议：进入自由讨论后我们先用 5 分钟对齐筛选标准，再花 8 分钟敲定前二优先级方案。' },
    ]
  }

  if (phase === 'summary_report') {
    if (scaffoldLevel === 'keywords') {
      return [
        { tag: '金字塔汇报', text: '核心结论 → 三大支柱 → 风险与分歧备案', template: '各位考官好，我代表本组做总结汇报。我们达成的核心共识是「分阶段稳健落地」，具体拆解为以下三个执行动作与风险预案：' },
        { tag: '坦诚分歧', text: '点明已达成共识 + 保留弹性试点指标', template: '在讨论中我们针对考核强度曾有交锋，最终商定以「首月试运行+双周复盘」作为折中闭环方案。' },
      ]
    }
    return [
      { tag: '标准汇报模板', text: '「结论先行 + 1/2/3分级举措 + 致谢队友」', template: `代表小组汇报最终方案：第一，核心原则是先低成本止血再系统升级；第二，短期落地每日异步站会与三行日志（${sIce}号/${sIdea}号贡献），中期建立量化看板（${sLog}号/${sInt}号建议）；第三，针对尚存分歧采用小步试点。汇报完毕，感谢各位。` },
    ]
  }

  if (phase === 'examiner_followup') {
    if (scaffoldLevel === 'keywords') {
      return [
        { tag: '极限兜底', text: '捍卫团队评判标准 + 保 P0 砍非核心 + 量化红线', template: '感谢考官追问。若预算或资源直接砍半，依据全组确立的「ROI与紧迫度」标准，我们将坚决保住 P0 零成本止血动作，暂缓中长期系统投入，以首月转化率≥15%作为底线验证。' },
        { tag: '团队复盘', text: '维护团队共识 + 肯定队友贡献 + 客观复盘节奏', template: `复盘整场讨论，${sLog}号同学的量化标准与 ${sDig}号同学放入长期展望的创新视角都很有价值；若重来一次，我们会在前 20% 时间更快锁定权重矩阵以留出更充裕的推演时间。` },
      ]
    }
    return [
      { tag: '压力追问应对', text: '「锚定共同标准 + 最小可行闭环 + 归功团队协作」', template: `回答考官：即便外部资源减半，我们全组锁定的核心评判标准不变——优先保住最小可行闭环（MVP），将高成本项转入二期展望池；这一结论凝聚了 ${sIce}号立框与 ${sLog}号算分的共同贡献。` },
    ]
  }

  // Default: free_discussion
  if (scaffoldLevel === 'keywords') {
    return [
      { tag: '先立标准', text: '先确立 3 个评判标准再讨论具体选项', template: '各位，在争论具体选项之前，我建议按 2:6:2 节奏先对齐三个评判标准：【投入产出ROI、落地见效速度、风险可控度】，大家认可吗？' },
      { tag: '授权投屏', text: '用服务型话术征得团队同意开启共享看板', template: '为了方便大家对齐进度、不遗漏好观点，我帮大家开启共享结构化看板实时记录标准与分支，大家看可以吗？' },
      { tag: '二阶整合', text: `桥接 ${sLog}号李理 与 ${sInt}号韩抢 的对立点`, template: `我来桥接一下 ${sLog}号李理 和 ${sInt}号韩抢 的观点：两位的诉求其实分别对应「短期止损」与「长期机制」，我们可以按时间轴分两步走。` },
      { tag: '暂存纠偏', text: `温和将 ${sDig}号孙偏 点子收入 Parking Lot`, template: `${sDig}号孙偏 提到的跨界视角很有启发，我先把它记入看板右侧的 Parking Lot 作为长期展望，眼下我们先集中敲定 P0 主方案好吗？` },
    ]
  }

  return [
    { tag: '抗打断夺麦', text: '「肯定对方痛点 + 升维合并 + 推进议程」', template: `${sInt}号韩抢 提到的执行风险确实关键，这正好和 ${sIdea}号陈思 的低成本方案形成互补：我们不妨把【产出可见性】作为底线约束，现在先敲定第一阶段具体动作，大家看可行吗？` },
    { tag: '控时收敛', text: '「盘点已有共识 + 锁定剩余分歧 + 确认汇报人」', template: '看了一下倒计时，我们已经就【核心框架与首期动作】达成一致；接下来 3 分钟我们集中收敛唯一分歧点，并推选本组汇报人整理一二三点。' },
  ]
}

/**
 * Compute live Progressive Consensus Whiteboard state from current room messages.
 */
export function computeLiveProgressiveSummary(messages = [], topic = DEFAULT_TOPIC, userSeat = 4) {
  const nonSystem = messages.filter((m) => !m.isSystem && m.content)
  const agreedPoints = []
  const activeClashes = []
  const userContributions = []
  const effSeat = Number.isInteger(Number(userSeat)) && userSeat >= 1 && userSeat <= 8 ? Number(userSeat) : 4

  for (const msg of nonSystem) {
    const text = String(msg.content || '').trim()
    const speaker = msg.isUser ? `${effSeat}号·你` : `${msg.senderName || '队友'}`
    const snippet = text.length > 42 ? `${text.slice(0, 42)}…` : text

    if (msg.isUser) {
      userContributions.push(`${effSeat}号·你：${snippet}`)
    }
    if (/(同意|赞同|共识|先定框架|归纳一下|折中一下|一致|总结|优先落地|三类)/.test(text)) {
      agreedPoints.push(`${speaker}：${snippet}`)
    }
    if (/(不同意|打断一下|太理想|等一下|跑题|分歧|争论|反驳|质疑)/.test(text)) {
      activeClashes.push(`${speaker}：${snippet}`)
    }
  }

  return {
    topic,
    totalTurns: nonSystem.length,
    agreedPoints: agreedPoints.slice(-3),
    activeClashes: activeClashes.slice(-2),
    userContributions: userContributions.slice(-3),
  }
}

const SCRIPT_URGENCY_PRIORS = {
  standard_flow: { ice_breaker: 5.4, idea_king: 5.2, logician: 5.5, interrupter: 5.6, digresser: 4.8, mediator: 5.3, timekeeper: 4.9 },
  werewolf_clash: { interrupter: 6.6, logician: 6.4, mediator: 5.8, ice_breaker: 5.1, idea_king: 4.9, digresser: 4.5, timekeeper: 5.0 },
  convergence_sprint: { digresser: 6.3, timekeeper: 6.5, idea_king: 5.9, ice_breaker: 5.4, logician: 5.3, mediator: 5.0, interrupter: 4.8 },
  memory_adaptive: { mediator: 6.3, logician: 5.9, interrupter: 5.8, ice_breaker: 5.4, timekeeper: 5.3, idea_king: 5.0, digresser: 4.6 },
  anti_teleprompter_probe: { logician: 6.5, interrupter: 6.6, ice_breaker: 5.2, mediator: 5.3, idea_king: 4.8, timekeeper: 5.0, digresser: 4.4 },
  leader_vacancy_brawl: { ice_breaker: 6.4, interrupter: 6.5, logician: 6.1, idea_king: 5.7, mediator: 5.2, timekeeper: 5.0, digresser: 4.5 },
}

export function buildLocalReadingWarmupStances(
  topic = DEFAULT_TOPIC,
  seatMap = null,
  identityMode = 'random',
  participantRoles = null,
) {
  const shortTopic = String(topic || DEFAULT_TOPIC).slice(0, 16)
  const notes = {
    ice_breaker: `正在拆解「${shortTopic}」边界，准备立三层框架…`,
    idea_king: `正在构思「${shortTopic}」低成本异步创新抓手…`,
    logician: '正在梳理投入产出比（ROI）与量化验收口径…',
    interrupter: '正在审视理想化盲区，准备质询刚性责任红线…',
    digresser: '正在联想跨界极端协同案例…',
    mediator: '正在预判效率与成本分歧，准备分阶段折中桥…',
    timekeeper: '正在规划陈述与自由讨论的时间切分节点…',
  }
  return AGENTS.map((ag) => {
    const rKey = participantRoles?.[ag.id]
    const roleLabel =
      identityMode === 'undetermined' && (!rKey || rKey === 'undetermined')
        ? '待定'
        : rKey
          ? getIdentityMeta(rKey).short
          : ag.role
    return {
      agent_id: ag.id,
      seat: resolveParticipantSeat(ag.id, seatMap),
      name: ag.name,
      role: roleLabel,
      ui_state: 'reading',
      thought: notes[ag.id] || '正在审题记笔记…',
    }
  })
}

/**
 * Zero-LLM `<1ms` client-side mirror of backend `compute_urgency_bids`.
 * Ensures offline / `fast_script_only` sessions exhibit identical urgency bidding intelligence.
 */
export function computeLocalUrgencyBids({
  messages = [],
  scriptId = 'standard_flow',
  remainingSeconds = 420,
  totalPhaseSeconds = 600,
  memorySnapshot = null,
  turnIndex = 0,
  seatMap = null,
  identityMode = 'random',
  participantRoles = null,
  visualBoardSummary = '',
} = {}) {
  const publicMsgs = (messages || []).filter((m) => !m.isSystem && m.role !== 'system' && (m.content || m.text))
  const priors = SCRIPT_URGENCY_PRIORS[scriptId] || SCRIPT_URGENCY_PRIORS.standard_flow
  const userSeat = resolveParticipantSeat('user', seatMap)
  const digresserSeat = resolveParticipantSeat('digresser', seatMap)
  const lastMsg = publicMsgs[publicMsgs.length - 1] || null
  const lastText = String(lastMsg?.content || lastMsg?.text || '').trim()
  const lastSenderId = lastMsg?.senderId || ''
  const lastIsUser = Boolean(lastMsg?.isUser || lastMsg?.role === 'user' || lastSenderId === 'user')
  const lastSpeakerName = lastIsUser ? `${userSeat}号同学` : (lastMsg?.senderName || lastMsg?.speaker || null)

  const speakCounts = {}
  AGENTS.forEach((a) => { speakCounts[a.id] = 0 })
  let recentClashHits = 0
  let anyCriteriaEstablished = Boolean(visualBoardSummary && visualBoardSummary.includes('标准:'))
  publicMsgs.slice().reverse().forEach((m, idx) => {
    const sid = m.senderId || ''
    const txt = String(m.content || m.text || '')
    if (sid in speakCounts) speakCounts[sid] += 1
    if (idx < 2 && /(打断|不同意|反对|太理想|流于形式|摸鱼|一刀切|分歧|争论)/.test(txt)) {
      recentClashHits += 1
    }
    if (/(标准|权重|维度|原则|先定)/.test(txt)) {
      anyCriteriaEstablished = true
    }
  })

  let turnsSinceUser = 0
  for (let i = publicMsgs.length - 1; i >= 0; i -= 1) {
    if (publicMsgs[i].isUser || publicMsgs[i].role === 'user' || publicMsgs[i].senderId === 'user') break
    turnsSinceUser += 1
  }
  let turnsSinceTimekeeper = 0
  for (let i = publicMsgs.length - 1; i >= 0; i -= 1) {
    if (publicMsgs[i].senderId === 'timekeeper') break
    turnsSinceTimekeeper += 1
  }

  const totalSec = Math.max(60, Number(totalPhaseSeconds) || 600)
  const remRatio = Math.max(0, Math.min(1, Number(remainingSeconds) / totalSec))
  const goldenStage = computeFreeDiscussionGoldenStage(remainingSeconds, totalSec)
  const weakDims = memorySnapshot?.memory_enabled !== false ? (memorySnapshot?.weak_dimensions || []) : []

  const hasMetric = /(\d+(?:\.\d+)?(?:\s*%|\s*倍|\s*万|\s*天|\s*周|\s*分钟|\s*项)|ROI|准时率|转化率|时延)/.test(lastText)
  const isIdealistic = /(理想|弹性|自觉|文化|愿景|赋能|抓手|闭环|全靠|柔性)/.test(lastText)
  const hasCost = /(预算|成本|采购|补贴|系统改造|外包|激励|奖金|VR|元宇宙)/.test(lastText)
  const isDigressing = lastSenderId === 'digresser' || /(纪录片|南极|科考|元宇宙|VR|游戏化公会|跑题)/.test(lastText)

  const bids = AGENTS.map((ag) => {
    const seatNum = resolveParticipantSeat(ag.id, seatMap)
    let score = priors[ag.id] ?? 5.0
    let intent = '顺承讨论脉络补充核心抓手'

    score -= Math.min(1.8, (speakCounts[ag.id] || 0) * 0.38)
    score += ((turnIndex * 3 + seatNum) % 5) * 0.07

    // 2:6:2 Golden Ratio Front 20%: Propose evaluation criteria before jumping to options
    if (goldenStage.key === 'criteria' && !anyCriteriaEstablished && (ag.id === 'ice_breaker' || ag.id === 'logician')) {
      score += 0.65
      intent = '黄金2:6:2前20%·提议先确立评判标准再筛选项'
    }

    if ((publicMsgs.length === 0 || (turnIndex === 0 && lastSenderId !== 'ice_breaker' && !lastIsUser)) && ag.id === 'ice_breaker' && scriptId !== 'leader_vacancy_brawl') {
      score += 2.6
      intent = '自由讨论开场立框·对齐优先级标准'
    }

    if (ag.id === 'timekeeper') {
      if (remRatio <= 0.25 && turnsSinceTimekeeper >= 1) {
        score += 3.9
        intent = '剩余时间不足25%·紧急催促收敛定稿'
      } else if (remRatio <= 0.5 && turnsSinceTimekeeper >= 3) {
        score += 2.6
        intent = '半场时间节点预警·推进阶段小结'
      }
    }

    if (lastText) {
      if (ag.id === 'interrupter' && (isIdealistic || hasCost || (lastIsUser && !hasMetric))) {
        score += lastIsUser ? 2.9 : 2.2
        intent = '抓住理想化/成本漏洞·质询刚性责任与淘汰红线'
      }
      if (ag.id === 'logician' && ((!hasMetric && lastText.length > 12) || hasCost)) {
        score += 2.6
        intent = '审计逻辑因果链·追问ROI与可量化验收指标'
      }
    }

    if (ag.id === 'mediator') {
      if (recentClashHits >= 1 && (lastSenderId === 'interrupter' || lastSenderId === 'logician')) {
        score += 3.1
        intent = '调解场上刚性冲突·搭建短期试点与长期机制折中桥'
      } else if (turnsSinceUser >= 3 || (weakDims.length > 0 && turnsSinceUser >= 2)) {
        score += 2.7
        intent = `察觉${userSeat}号发言空窗·主动桥接并点名邀请${userSeat}号破局`
      }
    }

    if (isDigressing && (ag.id === 'ice_breaker' || ag.id === 'logician' || ag.id === 'timekeeper')) {
      score += 2.4
      intent = `识别${digresserSeat}号边缘发散·温和拉回核心讨论主线`
    }

    if (remRatio > 0.4 && turnIndex > 0 && turnIndex % 3 === 2) {
      if (ag.id === 'digresser' && speakCounts.digresser === 0) {
        score += 2.3
        intent = '抛出跨界边缘类比·测试小组纠偏控场力'
      } else if (ag.id === 'idea_king' && speakCounts.idea_king <= 1) {
        score += 1.9
        intent = '注入反常规创新抓手·激活方案差异化'
      }
    }

    if (ag.id === lastSenderId) {
      score = 0.25
      intent = '刚完成发言·静默倾听队友回应'
    }

    const urgency = Math.round(Math.max(0.1, Math.min(9.9, score)) * 100) / 100
    const refPrefix = lastSpeakerName ? `听完${lastSpeakerName}的发言，` : ''
    const rKey = participantRoles?.[ag.id]
    let roleDisplay = ag.role
    let plannedClaim = null
    if (identityMode === 'undetermined' && (!rKey || rKey === 'undetermined')) {
      const cMeta = inferAgentClaimedIdentity(ag.id, participantRoles || {}, 'free_discussion')
      plannedClaim = cMeta.id
      roleDisplay = `待定→${cMeta.short}`
    } else if (rKey) {
      roleDisplay = getIdentityMeta(rKey).short
    }
    return {
      agent_id: ag.id,
      seat: seatNum,
      name: ag.name,
      role: roleDisplay,
      planned_claim_role: plannedClaim,
      urgency,
      intent,
      thought_preview: `${refPrefix}${intent}，准备切入发言…`,
    }
  })

  return bids.sort((a, b) => b.urgency - a.urgency)
}

/**
 * Client-side fallback mirror for Side-Channel Invisible Dual Examiners.
 */
export function evaluateLocalObserverTags(utterance, priorMessages = [], userRole = 'member', phase = 'free_discussion', elapsedSeconds = 0) {
  const text = String(utterance?.content || utterance?.text || '').trim()
  if (!text) return []
  const mm = String(Math.floor(Math.max(0, elapsedSeconds) / 60)).padStart(2, '0')
  const ss = String(Math.floor(Math.max(0, elapsedSeconds) % 60)).padStart(2, '0')
  const ts_label = `${mm}:${ss}`
  const quote = text.length > 46 ? `${text.slice(0, 46)}…` : text
  const nonSystemPrior = (priorMessages || []).filter((m) => !m.isSystem && m.role !== 'system')
  const prev = nonSystemPrior[nonSystemPrior.length - 1]
  const prevId = prev?.senderId || ''

  const teammateHits = text.match(/([1-8]号|小林|陈思|李理|韩抢|孙偏|王和|刘时)/g) || []
  const uniqueTeammates = [...new Set(teammateHits)]
  const hasMetric = /(\d+(?:\.\d+)?(?:\s*%|\s*倍|\s*万|\s*人|\s*天|\s*周|\s*分钟|\s*项)|指标|ROI|成本|准时率|时延)/.test(text)
  const hasFramework = /(维度|框架|三层|三点|分两步|分阶段|第一.*第二|边界|拆解)/.test(text)
  const hasCriteria = /(评判标准|筛选标准|排序标准|权重|先定标准|先对齐标准|按.*标准|三个标准)/.test(text)
  const hasDirectOptionJump = /(我直接选|直接排|必须选[①②③④⑤⑥⑦⑧1234]|答案就是[①②③ABC])/i.test(text)
  const priorHadCriteria = nonSystemPrior.some((m) => /(标准|权重|维度|原则)/.test(String(m.content || m.text || '')))
  const hasBoardAuth = /(共享看板|结构记录|投屏|实时整理|大家看可以吗|对齐进度.*看板)/.test(text)
  const hasParkingLot = /(暂存区|Parking\s*Lot|长期展望|备选池|二期展望)/i.test(text)
  const hasSynthesis = /(折中|桥接|融合|并行|分两步|短期.*长期|短期.*中期|兼顾|不矛盾|互补)/.test(text)
    || (uniqueTeammates.length >= 2 && /(同意|赞同|认同|承接|补充|顺着|结合|串联)/.test(text))
  const hasTimeMention = /(还剩\s*\d+\s*(?:分钟|秒)|注意时间|时间不多|看下时间|倒计时)/.test(text)
  const hasActionablePush = /(收敛|表决|排序|优先级|分工|汇报人|提纲|小结|总结一下|先定|敲定)/.test(text)
  const hasProgress = hasActionablePush || (hasTimeMention && hasFramework)
  const isMechanicalTimeOnly = hasTimeMention && !hasActionablePush && !hasFramework && !hasSynthesis
  const isStubbornRigid = /(我坚持必须|必须按我的|只能选我|绝不退让|别的方案都不行|不用听别人|只有我的方案|没得商量|我绝不同意妥协)/.test(text) && !hasSynthesis
  const isTimeDragging = /(先别急着收敛|再多聊一会儿|不用管时间|慢慢讨论不急|先重新讨论审题|推倒重来再聊)/.test(text)
    || (text.length >= 165 && !hasMetric && uniqueTeammates.length === 0 && !hasActionablePush)
  const hasConclusionFirst = /^(我的核心结论是|结论先行|我先亮结论|总的来说|一句话总结|核心观点就三点|直接给结论|我主张优先)/.test(text)
  const isDefensiveAgitated = /(你懂不懂|别乱扣帽子|根本不是你说的那样|凭什么否定我|有完没完|莫名其妙)/.test(text)
  const clicheHits = text.match(/(赋能|抓手|闭环|组合拳|底层逻辑|顶层设计|生态化反|全链路拉通|对齐颗粒度)/g) || []

  const tags = []
  const stamp = `${Date.now().toString(36)}`

  if (hasConclusionFirst) {
    tags.push({
      id: `obs-concl-${stamp}`,
      ts_label,
      phase,
      panel_id: 'observer_a',
      examiner: 'hr',
      examiner_name: '副面试官A · 苏经理',
      tag: '结论先行表达',
      delta: 2,
      polarity: 'positive',
      quote,
      reason: '采用“结论先行（总-分）”结构开门见山，说服力与听感清晰度高。',
    })
  }
  if (hasBoardAuth) {
    tags.push({
      id: `obs-auth-${stamp}`,
      ts_label,
      phase,
      panel_id: 'observer_a',
      examiner: 'hr',
      examiner_name: '副面试官A · 苏经理',
      tag: '团队授权控屏',
      delta: 2,
      polarity: 'positive',
      quote,
      reason: '遵循可视化铁律1：先用服务型话术征得队友授权再开启共享看板，掌握柔性主导权。',
    })
  }
  if (hasCriteria && nonSystemPrior.length <= 6) {
    tags.push({
      id: `obs-crit-${stamp}`,
      ts_label,
      phase,
      panel_id: 'scribe_b',
      examiner: 'business',
      examiner_name: '副面试官B · 周PM',
      tag: '先立评判标准',
      delta: 2,
      polarity: 'positive',
      quote,
      reason: '在争论具体选项前先行确立量化评判标准与权重，有效终结主观拉扯。',
    })
  } else if (hasDirectOptionJump && !hasCriteria && !priorHadCriteria && phase === 'free_discussion') {
    tags.push({
      id: `obs-optjump-${stamp}`,
      ts_label,
      phase,
      panel_id: 'lead',
      examiner: 'business',
      examiner_name: '主面试官 · 顾总监',
      tag: '未立标准直跳选项',
      delta: -1,
      polarity: 'warning',
      quote,
      reason: '尚未对齐评判标准便直接争执选项结论，易引发低效拉锯。',
    })
  }
  if (hasParkingLot) {
    tags.push({
      id: `obs-park-${stamp}`,
      ts_label,
      phase,
      panel_id: 'scribe_b',
      examiner: 'hr',
      examiner_name: '副面试官B · 周PM',
      tag: 'Parking Lot收纳',
      delta: 2,
      polarity: 'positive',
      quote,
      reason: '将偏离主线或超期亮点温和收入暂存区作为长期展望，既尊重队友又稳住节奏。',
    })
  }
  if (hasFramework && (phase === 'personal_statement' || nonSystemPrior.length <= 4)) {
    tags.push({
      id: `obs-fw-${stamp}`,
      ts_label,
      phase,
      panel_id: 'lead',
      examiner: 'business',
      examiner_name: '主面试官 · 顾总监',
      tag: '破冰立框',
      delta: 2,
      polarity: 'positive',
      quote,
      reason: '主动界定讨论维度与结构化拆解框架，建立隐形控场锚点。',
    })
  }
  if (hasSynthesis) {
    tags.push({
      id: `obs-syn-${stamp}`,
      ts_label,
      phase,
      panel_id: 'observer_a',
      examiner: 'hr',
      examiner_name: '副面试官A · 苏经理',
      tag: '二阶折中破局',
      delta: 2,
      polarity: 'positive',
      quote,
      reason: '将场上对立诉求按时间轴或底线/赋能融合，展现高阶团队整合力。',
    })
  } else if (uniqueTeammates.length > 0 && /(同意|赞同|认同|承接|补充|顺着|结合)/.test(text)) {
    tags.push({
      id: `obs-bld-${stamp}`,
      ts_label,
      phase,
      panel_id: 'observer_a',
      examiner: 'hr',
      examiner_name: '副面试官A · 苏经理',
      tag: '点名有效承接',
      delta: 1,
      polarity: 'positive',
      quote,
      reason: `明确锚定队友（${uniqueTeammates.join('/')}）观点并做增量延伸。`,
    })
  }
  if (prevId === 'digresser' && (/(拉回|回到主线|回到正题|备选池|集中火力|核心)/.test(text) || hasProgress)) {
    tags.push({
      id: `obs-red-${stamp}`,
      ts_label,
      phase,
      panel_id: 'scribe_b',
      examiner: 'business',
      examiner_name: '副面试官B · 周PM',
      tag: '温和纠偏控场',
      delta: 2,
      polarity: 'positive',
      quote,
      reason: '在6号跑题发散后第一时间温和收束并拉回主线。',
    })
  }
  if (prevId === 'interrupter' && (hasMetric || hasSynthesis || /(责任人|Owner|刚性|红线|先让我说完)/.test(text))) {
    tags.push({
      id: `obs-res-${stamp}`,
      ts_label,
      phase,
      panel_id: 'observer_a',
      examiner: 'hr',
      examiner_name: '副面试官A · 苏经理',
      tag: '高压接招稳场',
      delta: 1,
      polarity: 'positive',
      quote,
      reason: '面对5号高压质询未情绪化对抗，用执行边界或指标正面回应。',
    })
  }
  if (hasMetric && !isMechanicalTimeOnly) {
    tags.push({
      id: `obs-met-${stamp}`,
      ts_label,
      phase,
      panel_id: 'lead',
      examiner: 'business',
      examiner_name: '主面试官 · 顾总监',
      tag: '量化指标支撑',
      delta: 1,
      polarity: 'positive',
      quote,
      reason: '包含具体量化数字、时间窗口或ROI验收口径。',
    })
  }
  if (isMechanicalTimeOnly && phase === 'free_discussion') {
    tags.push({
      id: `obs-mechtime-${stamp}`,
      ts_label,
      phase,
      panel_id: 'scribe_b',
      examiner: 'hr',
      examiner_name: '副面试官B · 周PM',
      tag: '机械报时预警',
      delta: -1,
      polarity: 'warning',
      quote,
      reason: '失分红线：仅机械播报剩余时间却未给出阶段收敛或分工建议。',
    })
  } else if (hasProgress && phase === 'free_discussion') {
    tags.push({
      id: `obs-prg-${stamp}`,
      ts_label,
      phase,
      panel_id: 'scribe_b',
      examiner: 'business',
      examiner_name: '副面试官B · 周PM',
      tag: '议程推进收敛',
      delta: userRole === 'leader' || userRole === 'timekeeper' ? 2 : 1,
      polarity: 'positive',
      quote,
      reason: '主动结合剩余时间推动优先级排序、分工或提纲收敛。',
    })
  }
  if (isDefensiveAgitated) {
    tags.push({
      id: `obs-defag-${stamp}`,
      ts_label,
      phase,
      panel_id: 'observer_a',
      examiner: 'hr',
      examiner_name: '副面试官A · 苏经理',
      tag: '防御激动预警',
      delta: -2,
      polarity: 'warning',
      quote,
      reason: '分区盯人预警：面对分歧出现情绪化反呛或防御姿态过重，损害说服力与抗压分。',
    })
  }
  if (isStubbornRigid) {
    tags.push({
      id: `obs-stubborn-${stamp}`,
      ts_label,
      phase,
      panel_id: 'observer_a',
      examiner: 'hr',
      examiner_name: '副面试官A · 苏经理',
      tag: '固执己见拉扯',
      delta: -2,
      polarity: 'warning',
      quote,
      reason: '一票否决雷区：固执己见拒绝折中，若拖垮全组共识将担负首要扣分责任。',
    })
  }
  if (isTimeDragging) {
    tags.push({
      id: `obs-drag-${stamp}`,
      ts_label,
      phase,
      panel_id: 'lead',
      examiner: 'business',
      examiner_name: '主面试官 · 顾总监',
      tag: '拖延空转预警',
      delta: -2,
      polarity: 'warning',
      quote,
      reason: '冗长空转或阻挠收敛，消耗团队宝贵时间窗口却无增量推进。',
    })
  }
  if (clicheHits.length >= 2 && uniqueTeammates.length === 0 && !hasMetric) {
    tags.push({
      id: `obs-cli-${stamp}`,
      ts_label,
      phase,
      panel_id: 'lead',
      examiner: 'hr',
      examiner_name: '主面试官 · 顾总监',
      tag: '套话背稿预警',
      delta: -1,
      polarity: 'warning',
      quote,
      reason: '只喊互联网黑话口号而缺少可落地路径与队友咬合，触发逻辑雷区。',
    })
  }

  return tags.slice(0, 3)
}


