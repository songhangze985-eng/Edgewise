import iconDashboard from '../../assets/icons/dashboard.svg'
import iconInterview from '../../assets/icons/interview.svg'
import iconQuestions from '../../assets/icons/questions.svg'
import iconAnalytics from '../../assets/icons/analytics.svg'
import iconResume from '../../assets/icons/resume.svg'
import iconLgd from '../../assets/icons/lgd.svg'
import iconSchedule from '../../assets/icons/schedule.svg'
import iconManagement from '../../assets/icons/management.svg'
import iconStudio from '../../assets/icons/studio.svg'
import iconChallenge from '../../assets/icons/challenge.svg'

export const mobileTabItems = [
  { id: 'overview', to: '/', label: '概览', icon: iconDashboard, end: true },
  { id: 'practice', to: '/interview/lobby', label: '练习', icon: iconInterview, end: false },
  { id: 'questions', to: '/questions', label: '题库', icon: iconQuestions, end: false },
  { id: 'analytics', to: '/analytics', label: '复盘', icon: iconAnalytics, end: false },
  { id: 'mine', to: '/profile', label: '我的', icon: iconResume, end: false },
]

/** Sidebar entries not shown in the bottom tab bar — linked from「我的」. */
export const mobileMoreLinks = [
  { to: '/resume', icon: iconResume, label: '简历' },
  { to: '/interview/lobby', icon: iconInterview, label: '1v1 模拟面试' },
  { to: '/interview/structured/lobby', icon: iconInterview, label: '结构化面试' },
  { to: '/lgd/lobby', icon: iconLgd, label: '群面' },
  { to: '/coding/lobby', icon: iconInterview, label: '编程练习' },
  { to: '/case/lobby', icon: iconInterview, label: 'Case / 系统设计' },
  { to: '/assessment', icon: iconQuestions, label: '在线测评' },
  { to: '/challenge', icon: iconChallenge, label: '一血通关' },
  { to: '/studio', icon: iconStudio, label: '定制工坊' },
  { to: '/schedule', icon: iconSchedule, label: '面试日程' },
  { to: '/tasks', icon: iconQuestions, label: '准备任务' },
  { to: '/experiences', icon: iconQuestions, label: '面经库' },
  { to: '/stories', icon: iconResume, label: 'STAR 故事库' },
  { to: '/management', icon: iconManagement, label: '管理后台', adminOnly: true },
]

const PRACTICE_PREFIXES = [
  '/interview/lobby',
  '/interview/structured/lobby',
  '/interview/room/',
  '/interview/oneway/',
  '/interview/structured/',
  '/lgd/',
  '/coding/',
  '/case/lobby',
  '/case/room/',
  '/challenge',
]

export function isPracticeRoute(pathname) {
  return PRACTICE_PREFIXES.some((p) => {
    if (p.endsWith('/')) return pathname.startsWith(p)
    return pathname === p || pathname.startsWith(`${p}/`)
  })
}

export function isImmersiveRoute(pathname) {
  return (
    pathname.startsWith('/interview/room/')
    || pathname.startsWith('/interview/oneway/')
    || (pathname.startsWith('/interview/structured/') && !pathname.includes('/lobby'))
    || pathname.startsWith('/lgd/room/')
    || (pathname.startsWith('/coding/') && !pathname.startsWith('/coding/lobby'))
    || (pathname.startsWith('/case/room/'))
  )
}

export function isMobileTabActive(tabId, pathname) {
  switch (tabId) {
    case 'overview':
      return pathname === '/'
    case 'practice':
      return isPracticeRoute(pathname)
    case 'questions':
      return pathname.startsWith('/questions')
    case 'analytics':
      return pathname.startsWith('/analytics')
    case 'mine':
      return pathname.startsWith('/profile')
    default:
      return false
  }
}
