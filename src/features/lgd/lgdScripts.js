/** Scripted LGD agent lines (谈锋自编，非企业真题) */

export const USER_ROLES = [
  { id: 'leader', label: '领导者', hint: '适合主动定框架、推动共识' },
  { id: 'timekeeper', label: '计时员', hint: '负责报时与阶段提醒' },
  { id: 'reporter', label: '汇报人', hint: '总结环节代表小组发言' },
  { id: 'member', label: '普通成员', hint: '按序陈述、自由讨论接话' },
]

export const ROLE_LABELS = {
  leader: '领导者',
  timekeeper: '计时员',
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
}

export const DEFAULT_TOPIC = '远程团队协作效率提升方案'
export const DEFAULT_MATERIAL =
  '随着后疫情时代的到来，越来越多的企业采用远程或混合办公模式。然而，远程团队在信息同步、任务协同和团队凝聚力方面面临诸多挑战。据调查显示，68% 的远程员工表示在协作效率上存在明显障碍，42% 的管理者认为远程团队的产出低于预期。请你们团队讨论如何系统性地提升远程团队的协作效率，并给出可落地的解决方案。'

export const PHASE_DEFS = [
  { key: 'reading', label: '阅读材料' },
  { key: 'personal_statement', label: '个人陈述' },
  { key: 'free_discussion', label: '自由讨论' },
  { key: 'summary_report', label: '总结汇报' },
]

export function pickAgentForFreeDiscussion(scriptId = 'standard_flow') {
  const roll = Math.random()
  if (scriptId === 'werewolf_clash') {
    if (roll < 0.35) return AGENTS.find((a) => a.id === 'interrupter')
    if (roll < 0.65) return AGENTS.find((a) => a.id === 'logician')
  } else if (scriptId === 'convergence_sprint') {
    if (roll < 0.35) return AGENTS.find((a) => a.id === 'digresser')
    if (roll < 0.65) return AGENTS.find((a) => a.id === 'timekeeper')
  } else {
    if (roll < 0.22) return AGENTS.find((a) => a.id === 'interrupter')
    if (roll < 0.38) return AGENTS.find((a) => a.id === 'digresser')
  }
  return AGENTS[Math.floor(Math.random() * AGENTS.length)]
}

export function agentById(id) {
  if (id === 'user') {
    return { id: 'user', seat: 4, name: '你', role: '参与者', color: '#9b6fc7', emoji: '👤' }
  }
  return AGENTS.find((a) => a.id === id) || null
}

