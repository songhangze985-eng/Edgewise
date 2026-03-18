import { useState, useRef, useEffect } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import useAuthStore from '../../stores/authStore'
import SettingsModal from '../SettingsModal/SettingsModal'
import styles from './Sidebar.module.css'

import iconDashboard from '../../assets/icons/dashboard.svg'
import iconLgd from '../../assets/icons/lgd.svg'
import iconInterview from '../../assets/icons/interview.svg'
import iconQuestions from '../../assets/icons/questions.svg'
import iconResume from '../../assets/icons/resume.svg'
import iconAnalytics from '../../assets/icons/analytics.svg'
import iconManagement from '../../assets/icons/management.svg'
import iconStudio from '../../assets/icons/studio.svg'

const navItems = [
  { to: '/', icon: iconDashboard, label: 'Dashboard', id: 'N-01' },
  { to: '/lgd/lobby', icon: iconLgd, label: 'LGD 群面', id: 'N-02' },
  { to: '/interview/lobby', icon: iconInterview, label: '模拟面试', id: 'N-03' },
  { to: '/questions', icon: iconQuestions, label: '面试题库', id: 'N-04' },
  { to: '/resume', icon: iconResume, label: '简历优化', id: 'N-05' },
  { to: '/analytics', icon: iconAnalytics, label: '复盘中心', id: 'N-06' },
  { to: '/challenge', icon: iconInterview, label: '一血通关', id: 'N-07' },
  { to: '/studio', icon: iconStudio, label: '定制工坊', id: 'N-08' },
  { to: '/management', icon: iconManagement, label: '管理后台', id: 'N-09' },
]

export default function Sidebar() {
  const navigate = useNavigate()
  const user = useAuthStore((s) => s.user)
  const [menuOpen, setMenuOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const menuRef = useRef(null)

  // Close menu on outside click
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
      useAuthStore.getState().logout()
      navigate('/login')
    }
  }

  return (
    <aside className={styles.sidebar}>
      <div className={styles['sidebar-brand']}>
        <h1>EDGEWISE</h1>
        <div className={styles['brand-sub']}>谈锋 · AI 面试助手</div>
      </div>

      <nav className={styles['sidebar-nav']}>
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/'}
            className={({ isActive }) => isActive ? `${styles.active} active` : ''}
          >
            <img src={item.icon} className={styles['nav-icon-svg']} alt="" aria-hidden="true" />
            {item.label}
            <span className={styles['nav-id']}>[{item.id}]</span>
          </NavLink>
        ))}
      </nav>

      <div className={styles['sidebar-footer']} ref={menuRef}>
        {/* User popup menu (ChatGPT style) */}
        {menuOpen && (
          <div className={styles['user-menu']}>
            {/* User info header */}
            <div className={styles['menu-header']}>
              <div className={styles['menu-avatar']}>{user?.initials || 'YQ'}</div>
              <div className={styles['menu-user-info']}>
                <div className={styles['menu-user-name']}>{user?.name || '元启用户'}</div>
                <div className={styles['menu-user-email']}>{user?.email || 'user@edgewise.ai'}</div>
              </div>
            </div>
            <div className={styles['menu-divider']} />
            {/* Menu items */}
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

        {/* User button trigger */}
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
            <div className={styles['sidebar-user-tier']}>{user?.tierLabel || 'Pro Member'}</div>
          </div>
        </div>
      </div>
      {/* Settings Modal */}
      {settingsOpen && <SettingsModal onClose={() => setSettingsOpen(false)} />}
    </aside>
  )
}
