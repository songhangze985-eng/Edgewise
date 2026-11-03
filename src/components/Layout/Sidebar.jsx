import { useState, useRef, useEffect, useMemo } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import useAuthStore from '../../stores/authStore'
import useSessionStore from '../../stores/sessionStore'
import { formatAvgScore, rankFromAvgScore } from '../../utils/userStats'
import SettingsModal from '../SettingsModal/SettingsModal'
import styles from './Sidebar.module.css'

import iconDashboard from '../../assets/icons/dashboard.svg'
import iconLgd from '../../assets/icons/lgd.svg'
import iconInterview from '../../assets/icons/interview.svg'
import iconQuestions from '../../assets/icons/questions.svg'
import iconResume from '../../assets/icons/resume.svg'
import iconAnalytics from '../../assets/icons/analytics.svg'
import iconSchedule from '../../assets/icons/schedule.svg'
import iconManagement from '../../assets/icons/management.svg'
import iconStudio from '../../assets/icons/studio.svg'
import iconChallenge from '../../assets/icons/challenge.svg'

function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    const update = () => setReduced(mq.matches)
    update()
    mq.addEventListener('change', update)
    return () => mq.removeEventListener('change', update)
  }, [])
  return reduced
}

const BRAND_CHAR_MS = { EW: 120, EDGEWISE: 65 }

function BrandHeading({ collapsed }) {
  const text = collapsed ? 'EW' : 'EDGEWISE'
  const reducedMotion = usePrefersReducedMotion()
  const [visible, setVisible] = useState('')

  useEffect(() => {
    if (reducedMotion) {
      setVisible(text)
      return
    }
    setVisible('')
    let i = 0
    const delay = BRAND_CHAR_MS[collapsed ? 'EW' : 'EDGEWISE']
    const timer = window.setInterval(() => {
      i += 1
      setVisible(text.slice(0, i))
      if (i >= text.length) window.clearInterval(timer)
    }, delay)
    return () => window.clearInterval(timer)
  }, [text, collapsed, reducedMotion])

  const showCursor = !reducedMotion && visible.length > 0 && visible.length < text.length

  return (
    <h1 className={styles['brand-title']} aria-label={text}>
      {visible.split('').map((ch, idx) => (
        <span
          key={`${text}-${idx}-${ch}`}
          className={styles['brand-char']}
          style={reducedMotion ? undefined : { animationDelay: `${idx * 0.04}s` }}
        >
          {ch}
        </span>
      ))}
      {showCursor && <span className={styles['brand-cursor']} aria-hidden="true" />}
    </h1>
  )
}

const navItems = [
  { to: '/', icon: iconDashboard, label: '概览', id: 'N-01' },
  { to: '/resume', icon: iconResume, label: '简历', id: 'N-02' },
  { to: '/questions', icon: iconQuestions, label: '题库', id: 'N-03' },
  { to: '/interview/lobby', icon: iconInterview, label: '1v1 模拟面试', id: 'N-04' },
  { to: '/lgd/lobby', icon: iconLgd, label: '群面', id: 'N-05' },
  { to: '/challenge', icon: iconChallenge, label: '一血通关', id: 'N-06' },
  { to: '/studio', icon: iconStudio, label: '定制工坊', id: 'N-07' },
  { to: '/analytics', icon: iconAnalytics, label: '复盘中心', id: 'N-08' },
  { to: '/schedule', icon: iconSchedule, label: '面试日程', id: 'N-08b' },
  { to: '/assessment', icon: iconQuestions, label: '在线测评', id: 'N-08c' },
  { to: '/management', icon: iconManagement, label: '管理后台', id: 'N-09', adminOnly: true },
]

export default function Sidebar({ collapsed = false, onToggleCollapse }) {
  const navigate = useNavigate()
  const user = useAuthStore((s) => s.user)
  const avgScore = useSessionStore((s) => s.stats.avgScore)
  const refresh = useSessionStore((s) => s.refresh)
  const [menuOpen, setMenuOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const menuRef = useRef(null)

  useEffect(() => {
    refresh().catch(() => {})
  }, [refresh])

  const rank = useMemo(() => rankFromAvgScore(avgScore || 0), [avgScore])
  const scoreLabel = formatAvgScore(avgScore || 0)

  const visibleNavItems = navItems.filter((item) => !item.adminOnly || user?.isAdmin)

  useEffect(() => {
    if (!menuOpen) return
    const handleClick = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [menuOpen])

  const handleMenuAction = (action) => {
    setMenuOpen(false)
    if (action === 'profile') navigate('/profile')
    if (action === 'settings') setSettingsOpen(true)
    if (action === 'logout') {
      useAuthStore.getState().logout().finally(() => navigate('/login'))
    }
  }

  return (
    <aside
      className={`${styles.sidebar} ${collapsed ? styles['sidebar-collapsed'] : ''} ${
        menuOpen ? styles['sidebar-menu-open'] : ''
      }`}
      aria-expanded={!collapsed}
    >
      <button
        type="button"
        className={styles['sidebar-brand']}
        onClick={onToggleCollapse}
        aria-label={collapsed ? '展开侧边栏' : '收起侧边栏'}
        title={collapsed ? '展开侧边栏' : '收起侧边栏'}
      >
        <BrandHeading collapsed={collapsed} />
        <div className={styles['brand-sub']}>谈锋 · AI 面试助手</div>
      </button>

      <nav className={styles['sidebar-nav']}>
        {visibleNavItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/'}
            title={collapsed ? item.label : undefined}
            className={({ isActive }) => (isActive ? `${styles.active} active` : '')}
          >
            <img src={item.icon} className={styles['nav-icon-svg']} alt="" aria-hidden="true" />
            <span className={styles['nav-label']}>{item.label}</span>
            <span className={styles['nav-id']}>[{item.id}]</span>
          </NavLink>
        ))}
      </nav>

      <div className={styles['sidebar-footer']} ref={menuRef}>
        {menuOpen && (
          <div className={styles['user-menu']}>
            <div className={styles['menu-header']}>
              <div className={styles['menu-avatar']}>{user?.initials || 'YQ'}</div>
              <div className={styles['menu-user-info']}>
                <div className={styles['menu-user-name']}>{user?.name || '元启用户'}</div>
                <div className={styles['menu-user-email']}>{user?.email || 'user@edgewise.ai'}</div>
              </div>
            </div>
            <div className={styles['menu-divider']} />
            <button className={styles['menu-item']} onClick={() => handleMenuAction('profile')}>
              <span className={styles['menu-icon']}>◇</span>
              我的主页
            </button>
            <button className={styles['menu-item']} onClick={() => handleMenuAction('settings')}>
              <span className={styles['menu-icon']}>⚙</span>
              设置
            </button>
            <div className={styles['menu-divider']} />
            <button className={`${styles['menu-item']} ${styles['menu-danger']}`} onClick={() => handleMenuAction('logout')}>
              <span className={styles['menu-icon']}>→</span>
              退出登录
            </button>
          </div>
        )}

        <div
          className={styles['sidebar-user']}
          onClick={() => setMenuOpen(!menuOpen)}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => e.key === 'Enter' && setMenuOpen(!menuOpen)}
        >
          <div className={styles['sidebar-avatar']}>{user?.initials || 'YQ'}</div>
          <div className={styles['sidebar-user-info']}>
            <div className={styles['sidebar-user-name']}>{user?.name || '元启用户'}</div>
            <div className={styles['sidebar-user-tier']}>
              {rank.name} · {scoreLabel} 分
            </div>
          </div>
        </div>
      </div>
      {settingsOpen && <SettingsModal onClose={() => setSettingsOpen(false)} />}
    </aside>
  )
}
