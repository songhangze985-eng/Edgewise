export const SCHEDULE_STAGES = [
  '测评',
  'AI面试',
  '笔试',
  '一面',
  '二面',
  '主管面',
  'HR面',
  '谈薪',
]

export const SCHEDULE_RESULTS = ['待定', '通过', '未通过', '放弃']

const THREE_DAYS_MS = 3 * 24 * 60 * 60 * 1000

export function parseScheduleAt(at) {
  const d = new Date(at)
  return Number.isNaN(d.getTime()) ? null : d
}

export function formatScheduleWhen(at) {
  const d = parseScheduleAt(at)
  if (!d) return '—'
  return d.toLocaleString('zh-CN', {
    month: 'long',
    day: 'numeric',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/** Days / hours until interview; past entries marked. */
export function getCountdown(at) {
  const target = parseScheduleAt(at)
  if (!target) return { past: true, label: '—' }
  const diffMs = target.getTime() - Date.now()
  if (diffMs <= 0) {
    return { past: true, label: '已开始或已结束' }
  }
  const days = Math.floor(diffMs / (24 * 60 * 60 * 1000))
  const hours = Math.floor((diffMs % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000))
  if (days > 0) {
    return { past: false, days, hours, label: `还有 ${days} 天 ${hours} 小时` }
  }
  return { past: false, days: 0, hours, label: `还有 ${hours} 小时` }
}

export function isWithinThreeDays(at) {
  const target = parseScheduleAt(at)
  if (!target) return false
  const diffMs = target.getTime() - Date.now()
  return diffMs > 0 && diffMs <= THREE_DAYS_MS
}

/**
 * Map interview stage → practice mode (one_way | jd_pro | hr_reverse | lgd).
 */
export function recommendPracticeForStage(stage, jobId) {
  const params = new URLSearchParams()
  switch (stage) {
    case 'AI面试':
    case '测评':
      params.set('type', 'one_way')
      return {
        kind: 'one_way',
        title: 'AI 初面模拟（单向）',
        desc: '准备倒计时与限时作答，贴近企业 AI 初面形式。',
        to: `/interview/lobby?${params.toString()}`,
      }
    case 'HR面':
    case '谈薪':
      params.set('type', 'behavioral')
      return {
        kind: 'hr_reverse',
        title: 'HR 面与反问练习',
        desc: '在轮次配置中选择 HR 面 / 谈薪，并开启结尾反问环节。',
        to: `/interview/lobby?${params.toString()}`,
      }
    case '二面':
      return {
        kind: 'lgd',
        title: 'LGD 群面模拟',
        desc: '练习无领导小组讨论中的发言、推进与总结。',
        to: '/lgd/lobby',
      }
    case '笔试':
      return {
        kind: 'jd_pro',
        title: '编程题练习',
        desc: '在线编辑器与口述思路，贴近技术笔试与手撕代码。',
        to: '/coding/lobby',
      }
    case '一面':
    case '主管面':
    default: {
      params.set('type', 'semi')
      if (jobId) params.set('job', jobId)
      return {
        kind: 'jd_pro',
        title: jobId ? '关联 JD 的专业轮练习' : '专业轮模拟面试',
        desc: jobId
          ? '已关联目标岗位 JD，建议提高题库专业题比例。'
          : '可在面试大厅关联 JD，生成更贴近岗位的题目。',
        to: `/interview/lobby?${params.toString()}`,
      }
    }
  }
}

export function findNearestUpcoming(entries) {
  const now = Date.now()
  return (entries || [])
    .map((e) => ({ entry: e, at: parseScheduleAt(e.at)?.getTime() }))
    .filter((row) => row.at && row.at > now)
    .sort((a, b) => a.at - b.at)[0]?.entry ?? null
}

export function splitUpcomingPast(entries) {
  const now = Date.now()
  const upcoming = []
  const past = []
  for (const e of entries || []) {
    const t = parseScheduleAt(e.at)?.getTime()
    if (!t || t <= now) past.push(e)
    else upcoming.push(e)
  }
  past.sort((a, b) => (parseScheduleAt(b.at)?.getTime() || 0) - (parseScheduleAt(a.at)?.getTime() || 0))
  return { upcoming, past }
}
