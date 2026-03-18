import { useState } from 'react'
import { createPortal } from 'react-dom'
import useAuthStore from '../../stores/authStore'
import styles from './SettingsModal.module.css'

const TABS = [
  { id: 'general', icon: '⚙', label: '常规' },
  { id: 'account', icon: '◎', label: '账户' },
  { id: 'subscription', icon: '◇', label: '订阅' },
  { id: 'preference', icon: '◈', label: '偏好设置' },
  { id: 'data', icon: '▣', label: '数据管理' },
]

export default function SettingsModal({ onClose }) {
  const user = useAuthStore((s) => s.user)
  const [activeTab, setActiveTab] = useState('general')

  // Preferences state
  const [prefs, setPrefs] = useState({
    aiCopilot: true,
    practiceReminder: true,
    emailNotify: false,
    soundEffect: false,
    language: 'zh-CN',
    theme: '深色',
  })

  const togglePref = (key) => setPrefs((p) => ({ ...p, [key]: !p[key] }))

  return createPortal(
    <div className={styles.overlay} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className={styles.modal} role="dialog" aria-modal="true" aria-label="设置">
        {/* Left sidebar */}
        <div className={styles.sidebar}>
          <button className={styles['close-btn']} onClick={onClose} aria-label="关闭">
            ✕
          </button>
          <nav className={styles.nav}>
            {TABS.map((tab) => (
              <button
                key={tab.id}
                className={`${styles['nav-item']} ${activeTab === tab.id ? styles.active : ''}`}
                onClick={() => setActiveTab(tab.id)}
              >
                <span className={styles['nav-icon']}>{tab.icon}</span>
                {tab.label}
              </button>
            ))}
          </nav>
        </div>

        {/* Right content */}
        <div className={styles.content}>
          {/* ===== 常规 ===== */}
          {activeTab === 'general' && (
            <div className={styles.panel}>
              <h2>常规</h2>
              <div className={styles['setting-list']}>
                <div className={styles['setting-row']}>
                  <div className={styles['setting-label']}>外观</div>
                  <select
                    className={styles['setting-select']}
                    value={prefs.theme}
                    onChange={(e) => setPrefs((p) => ({ ...p, theme: e.target.value }))}
                  >
                    <option>深色</option>
                    <option>浅色</option>
                    <option>跟随系统</option>
                  </select>
                </div>
                <div className={styles['setting-row']}>
                  <div className={styles['setting-label']}>语言</div>
                  <select
                    className={styles['setting-select']}
                    value={prefs.language}
                    onChange={(e) => setPrefs((p) => ({ ...p, language: e.target.value }))}
                  >
                    <option value="zh-CN">中文 (简体)</option>
                    <option value="en">English</option>
                  </select>
                </div>
                <div className={styles['setting-row']}>
                  <div>
                    <div className={styles['setting-label']}>AI Copilot 助手</div>
                    <div className={styles['setting-desc']}>在页面中显示 AI 引导助手</div>
                  </div>
                  <button
                    className={`${styles.toggle} ${prefs.aiCopilot ? styles['toggle-on'] : ''}`}
                    onClick={() => togglePref('aiCopilot')}
                    role="switch"
                    aria-checked={prefs.aiCopilot}
                  >
                    <div className={styles['toggle-dot']} />
                  </button>
                </div>
                <div className={styles['setting-row']}>
                  <div>
                    <div className={styles['setting-label']}>音效</div>
                    <div className={styles['setting-desc']}>面试和群面中的提示音</div>
                  </div>
                  <button
                    className={`${styles.toggle} ${prefs.soundEffect ? styles['toggle-on'] : ''}`}
                    onClick={() => togglePref('soundEffect')}
                    role="switch"
                    aria-checked={prefs.soundEffect}
                  >
                    <div className={styles['toggle-dot']} />
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ===== 账户 ===== */}
          {activeTab === 'account' && (
            <div className={styles.panel}>
              <h2>账户</h2>
              <div className={styles['setting-list']}>
                <div className={styles['setting-row']}>
                  <div className={styles['setting-label']}>用户名</div>
                  <div className={styles['setting-value']}>{user?.name || '元启用户'}</div>
                </div>
                <div className={styles['setting-row']}>
                  <div className={styles['setting-label']}>邮箱</div>
                  <div className={styles['setting-value']}>{user?.email || 'user@edgewise.ai'}</div>
                </div>
                <div className={styles['setting-row']}>
                  <div className={styles['setting-label']}>加入时间</div>
                  <div className={styles['setting-value']}>{user?.joinDate || '2026-01-15'}</div>
                </div>
                <div className={styles['setting-row']}>
                  <div className={styles['setting-label']}>修改密码</div>
                  <button className={styles['setting-action']}>更改</button>
                </div>
              </div>
            </div>
          )}

          {/* ===== 订阅 ===== */}
          {activeTab === 'subscription' && (
            <div className={styles.panel}>
              <h2>订阅</h2>
              <div className={styles['sub-card']}>
                <div className={styles['sub-tier']}>{user?.tierLabel || '黄金专业版'}</div>
                <div className={styles['sub-info']}>
                  <div className={styles['sub-row']}>
                    <span>当前积分</span>
                    <span className={styles['sub-value']}>{user?.credits || 1280}</span>
                  </div>
                  <div className={styles['sub-row']}>
                    <span>会员等级</span>
                    <span className={styles['sub-value']}>{user?.tier || 'Pro'}</span>
                  </div>
                </div>
                <button className={styles['sub-btn']}>管理订阅</button>
              </div>
            </div>
          )}

          {/* ===== 偏好设置 ===== */}
          {activeTab === 'preference' && (
            <div className={styles.panel}>
              <h2>偏好设置</h2>
              <div className={styles['setting-list']}>
                <div className={styles['setting-row']}>
                  <div>
                    <div className={styles['setting-label']}>每日练习提醒</div>
                    <div className={styles['setting-desc']}>每天 20:00 推送练习提醒</div>
                  </div>
                  <button
                    className={`${styles.toggle} ${prefs.practiceReminder ? styles['toggle-on'] : ''}`}
                    onClick={() => togglePref('practiceReminder')}
                    role="switch"
                    aria-checked={prefs.practiceReminder}
                  >
                    <div className={styles['toggle-dot']} />
                  </button>
                </div>
                <div className={styles['setting-row']}>
                  <div>
                    <div className={styles['setting-label']}>邮件通知</div>
                    <div className={styles['setting-desc']}>接收复盘报告和系统通知</div>
                  </div>
                  <button
                    className={`${styles.toggle} ${prefs.emailNotify ? styles['toggle-on'] : ''}`}
                    onClick={() => togglePref('emailNotify')}
                    role="switch"
                    aria-checked={prefs.emailNotify}
                  >
                    <div className={styles['toggle-dot']} />
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ===== 数据管理 ===== */}
          {activeTab === 'data' && (
            <div className={styles.panel}>
              <h2>数据管理</h2>
              <div className={styles['setting-list']}>
                <div className={styles['setting-row']}>
                  <div>
                    <div className={styles['setting-label']}>导出练习数据</div>
                    <div className={styles['setting-desc']}>下载所有练习记录和复盘报告</div>
                  </div>
                  <button className={styles['setting-action']}>导出</button>
                </div>
                <div className={styles['setting-row']}>
                  <div>
                    <div className={styles['setting-label']}>清除本地缓存</div>
                    <div className={styles['setting-desc']}>清除浏览器中保存的临时数据</div>
                  </div>
                  <button className={styles['setting-action']}>清除</button>
                </div>
                <div className={`${styles['setting-row']} ${styles['setting-danger']}`}>
                  <div>
                    <div className={styles['setting-label']}>删除账户</div>
                    <div className={styles['setting-desc']}>永久删除账户和所有数据，不可恢复</div>
                  </div>
                  <button className={`${styles['setting-action']} ${styles['action-danger']}`}>删除</button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  )
}
