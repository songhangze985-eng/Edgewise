import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Radar, RadarChart, PolarGrid, PolarAngleAxis, ResponsiveContainer } from 'recharts'
import useAuthStore from '../../stores/authStore'
import useSessionStore from '../../stores/sessionStore'
import styles from './Profile.module.css'

const DEFAULT_USER_DATA = {
  name: '元启用户',
  initials: 'YQ',
  email: 'yuanqi@edgewise.ai',
  phone: '138****6789',
  joinDate: '2026-01-15',
  tier: 'Pro',
  tierLabel: '黄金专业版',
  tierExpiry: '2026-06-15',
}

const rankData = {
  current: '铂金',
  icon: '◇',
  exp: 2820,
  nextRank: '钻石',
  nextExp: 3000,
  progress: 94,
}

const memberStats = {
  totalSessions: 47,
  totalHours: 18.5,
  avgScore: 82.4,
  credits: 1280,
  streak: 7,
  bestScore: 96,
}

const radarData = [
  { axis: '表达力', value: 82 },
  { axis: '逻辑力', value: 75 },
  { axis: '领导力', value: 68 },
  { axis: '协作力', value: 88 },
  { axis: '应变力', value: 71 },
]

const achievements = [
  { id: 1, icon: '⚡', name: '初次登场', desc: '完成第一次面试练习', unlocked: true },
  { id: 2, icon: '🔥', name: '连续七天', desc: '连续 7 天登录练习', unlocked: true },
  { id: 3, icon: '⬡', name: '群面达人', desc: '完成 10 次 LGD 群面', unlocked: true },
  { id: 4, icon: '◈', name: '高分选手', desc: '单次练习得分超过 90', unlocked: true },
  { id: 5, icon: '△', name: '全能王者', desc: '五维能力均超过 80', unlocked: false },
  { id: 6, icon: '◇', name: '钻石之路', desc: '晋升钻石段位', unlocked: false },
]

const activityLog = [
  { date: '今天', action: 'LGD 群面练习', detail: '远程团队协作效率', score: 85 },
  { date: '昨天', action: '简历 AI 优化', detail: '产品经理岗位', score: 92 },
  { date: '2 天前', action: 'LGD 群面练习', detail: '新消费品牌增长策略', score: 78 },
  { date: '3 天前', action: '1v1 模拟面试', detail: '战略咨询', score: 81 },
  { date: '4 天前', action: 'LGD 群面练习', detail: '大学生创业时机', score: 88 },
]

export default function Profile() {
  const navigate = useNavigate()
  const user = useAuthStore((s) => s.user)
  const { stats: sessionStats } = useSessionStore()
  const [activeTab, setActiveTab] = useState('overview')

  const userData = {
    ...DEFAULT_USER_DATA,
    name: user?.name || DEFAULT_USER_DATA.name,
    initials: user?.initials || DEFAULT_USER_DATA.initials,
    email: user?.email || DEFAULT_USER_DATA.email,
    tier: user?.tier || DEFAULT_USER_DATA.tier,
    tierLabel: user?.tierLabel || DEFAULT_USER_DATA.tierLabel,
  }

  const dynamicMemberStats = {
    ...memberStats,
    totalSessions: sessionStats.totalSessions || memberStats.totalSessions,
    avgScore: sessionStats.avgScore || memberStats.avgScore,
    streak: sessionStats.streak || memberStats.streak,
  }

  return (
    <div className={styles.profile}>
      {/* Profile Header */}
      <div className={styles.header}>
        <div className={styles['header-left']}>
          <div className={styles.avatar}>
            <span>{userData.initials}</span>
          </div>
          <div className={styles['header-info']}>
            <h1>{userData.name}</h1>
            <div className={styles['header-meta']}>
              <span className={styles['tier-badge']}>{userData.tier}</span>
              <span className={styles['header-email']}>{userData.email}</span>
            </div>
            <div className={styles['header-join']}>
              加入于 {userData.joinDate} · {userData.tierLabel}（有效期至 {userData.tierExpiry}）
            </div>
          </div>
        </div>
        <div className={styles['header-right']}>
          <div className={styles['rank-display']}>
            <div className={styles['rank-icon']}>{rankData.icon}</div>
            <div className={styles['rank-info']}>
              <div className={styles['rank-name']}>{rankData.current}</div>
              <div className={styles['rank-exp']}>{rankData.exp} / {rankData.nextExp} EXP</div>
              <div className={styles['rank-bar']}>
                <div className={styles['rank-fill']} style={{ width: `${rankData.progress}%` }} />
              </div>
              <div className={styles['rank-next']}>距 {rankData.nextRank} 还需 {rankData.nextExp - rankData.exp} EXP</div>
            </div>
          </div>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className={styles['tab-bar']}>
        {[
          { id: 'overview', label: '总览' },
          { id: 'achievements', label: '成就' },
          { id: 'settings', label: '设置' },
        ].map((tab) => (
          <button
            key={tab.id}
            className={`${styles['tab-btn']} ${activeTab === tab.id ? styles.active : ''}`}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === 'overview' && (
        <div className={styles['tab-content']}>
          {/* Stats Grid */}
          <div className={styles['mini-stats']}>
            {[
              { label: '练习次数', value: dynamicMemberStats.totalSessions, unit: '次' },
              { label: '练习时长', value: dynamicMemberStats.totalHours, unit: 'h' },
              { label: '平均得分', value: dynamicMemberStats.avgScore, unit: '' },
              { label: '最高得分', value: dynamicMemberStats.bestScore, unit: '' },
              { label: '积分余额', value: dynamicMemberStats.credits.toLocaleString(), unit: '' },
              { label: '连续天数', value: dynamicMemberStats.streak, unit: '天' },
            ].map((s) => (
              <div key={s.label} className={styles['mini-stat']}>
                <div className={styles['mini-stat-value']}>
                  {s.value}<span className={styles['mini-stat-unit']}>{s.unit}</span>
                </div>
                <div className={styles['mini-stat-label']}>{s.label}</div>
              </div>
            ))}
          </div>

          {/* Radar + Activity */}
          <div className={styles['overview-grid']}>
            {/* Ability Radar */}
            <div className={styles.panel}>
              <div className={styles['panel-title']}>能力画像</div>
              <div className={styles['radar-wrap']}>
                <ResponsiveContainer width="100%" height={220}>
                  <RadarChart data={radarData} outerRadius="72%">
                    <PolarGrid stroke="rgba(226,224,229,0.08)" />
                    <PolarAngleAxis
                      dataKey="axis"
                      tick={{ fill: 'rgba(226,224,229,0.6)', fontSize: 11, fontFamily: "'Space Mono', monospace" }}
                    />
                    <Radar
                      dataKey="value"
                      stroke="#9b6fc7"
                      fill="#9b6fc7"
                      fillOpacity={0.15}
                      strokeWidth={2}
                      dot={{ r: 3, fill: '#9b6fc7', strokeWidth: 0 }}
                    />
                  </RadarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Recent Activity */}
            <div className={styles.panel}>
              <div className={styles['panel-title']}>最近动态</div>
              <div className={styles['activity-list']}>
                {activityLog.map((a, i) => (
                  <div key={i} className={styles['activity-row']}>
                    <div className={styles['activity-date']}>{a.date}</div>
                    <div className={styles['activity-body']}>
                      <div className={styles['activity-action']}>{a.action}</div>
                      <div className={styles['activity-detail']}>{a.detail}</div>
                    </div>
                    <div className={styles['activity-score']}>{a.score}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'achievements' && (
        <div className={styles['tab-content']}>
          <div className={styles['achieve-grid']}>
            {achievements.map((a) => (
              <div key={a.id} className={`${styles['achieve-card']} ${!a.unlocked ? styles.locked : ''}`}>
                <div className={styles['achieve-icon']}>{a.icon}</div>
                <div className={styles['achieve-info']}>
                  <div className={styles['achieve-name']}>{a.name}</div>
                  <div className={styles['achieve-desc']}>{a.desc}</div>
                </div>
                {a.unlocked
                  ? <div className={styles['achieve-check']}>✓</div>
                  : <div className={styles['achieve-lock']}>🔒</div>
                }
              </div>
            ))}
          </div>
        </div>
      )}

      {activeTab === 'settings' && (
        <div className={styles['tab-content']}>
          <div className={styles['settings-grid']}>
            {/* Account Info */}
            <div className={styles.panel}>
              <div className={styles['panel-title']}>账户信息</div>
              <div className={styles['settings-list']}>
                <div className={styles['setting-row']}>
                  <span className={styles['setting-label']}>用户名</span>
                  <span className={styles['setting-value']}>{userData.name}</span>
                </div>
                <div className={styles['setting-row']}>
                  <span className={styles['setting-label']}>邮箱</span>
                  <span className={styles['setting-value']}>{userData.email}</span>
                </div>
                <div className={styles['setting-row']}>
                  <span className={styles['setting-label']}>手机</span>
                  <span className={styles['setting-value']}>{userData.phone}</span>
                </div>
                <div className={styles['setting-row']}>
                  <span className={styles['setting-label']}>注册日期</span>
                  <span className={styles['setting-value']}>{userData.joinDate}</span>
                </div>
              </div>
            </div>

            {/* Subscription */}
            <div className={styles.panel}>
              <div className={styles['panel-title']}>订阅管理</div>
              <div className={styles['sub-card']}>
                <div className={styles['sub-tier']}>
                  <span className={styles['sub-badge']}>PRO</span>
                  <span className={styles['sub-name']}>{userData.tierLabel}</span>
                </div>
                <div className={styles['sub-detail']}>
                  有效期至 {userData.tierExpiry} · 月发 100,000 积分
                </div>
                <div className={styles['sub-features']}>
                  <span>✓ LGD 群面</span>
                  <span>✓ 深度话术重构</span>
                  <span>✓ 双轨评估</span>
                  <span>✓ 模拟面试</span>
                </div>
                <button className={styles['sub-btn']}>管理订阅</button>
              </div>
            </div>

            {/* Preferences */}
            <div className={styles.panel}>
              <div className={styles['panel-title']}>偏好设置</div>
              <div className={styles['settings-list']}>
                <div className={styles['setting-row']}>
                  <span className={styles['setting-label']}>练习提醒</span>
                  <div className={`${styles.toggle} ${styles.on}`}><div className={styles['toggle-dot']} /></div>
                </div>
                <div className={styles['setting-row']}>
                  <span className={styles['setting-label']}>邮件通知</span>
                  <div className={`${styles.toggle} ${styles.on}`}><div className={styles['toggle-dot']} /></div>
                </div>
                <div className={styles['setting-row']}>
                  <span className={styles['setting-label']}>AI Copilot</span>
                  <div className={`${styles.toggle} ${styles.on}`}><div className={styles['toggle-dot']} /></div>
                </div>
                <div className={styles['setting-row']}>
                  <span className={styles['setting-label']}>音效反馈</span>
                  <div className={styles.toggle}><div className={styles['toggle-dot']} /></div>
                </div>
              </div>
            </div>

            {/* Danger Zone */}
            <div className={styles.panel}>
              <div className={styles['panel-title']}>账户操作</div>
              <div className={styles['actions-list']}>
                <button className={styles['action-btn']}>修改密码</button>
                <button className={styles['action-btn']} onClick={() => { useAuthStore.getState().logout(); navigate('/login') }}>退出登录</button>
                <button className={`${styles['action-btn']} ${styles.danger}`}>注销账户</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
