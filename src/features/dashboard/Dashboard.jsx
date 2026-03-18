import { memo } from 'react'
import { Link } from 'react-router-dom'
import { Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer } from 'recharts'
import useSessionStore from '../../stores/sessionStore'
import styles from './Dashboard.module.css'
import iconLgd from '../../assets/icons/feature-lgd.svg'
import iconResume from '../../assets/icons/feature-resume.svg'
import iconInterview from '../../assets/icons/feature-interview.svg'

const radarData = [
  { axis: '表达力', value: 82, fullMark: 100 },
  { axis: '逻辑力', value: 75, fullMark: 100 },
  { axis: '领导力', value: 68, fullMark: 100 },
  { axis: '协作力', value: 88, fullMark: 100 },
  { axis: '应变力', value: 71, fullMark: 100 },
]

const recentSessions = [
  { id: 1, type: 'lgd', topic: '如何提升远程团队的协作效率', score: 85, date: '3 小时前', duration: '45min' },
  { id: 2, type: 'resume', topic: '简历 AI 优化 · 产品经理岗位', score: 92, date: '昨天', duration: '12min' },
  { id: 3, type: 'lgd', topic: '新消费品牌的增长策略讨论', score: 78, date: '2 天前', duration: '40min' },
  { id: 4, type: 'interview', topic: '1v1 模拟面试 · 战略咨询', score: 81, date: '3 天前', duration: '30min' },
]

const MOCK_STATS = [
  { label: '练习总次数', id: 'M-01', value: '47', delta: '+5 本周', icon: '⬡', color: '' },
  { label: '综合评分', id: 'M-02', value: '82', delta: '+3.2 较上月', icon: '◈', color: 'purple' },
  { label: '当前段位', id: 'M-03', value: '铂金', delta: '距钻石差 180 分', icon: '◇', color: 'blue' },
  { label: '积分余额', id: 'M-04', value: '1,280', delta: '+120 本周', icon: '△', color: 'red' },
]

function getGreeting() {
  const h = new Date().getHours()
  if (h < 6) return '夜深了，注意休息'
  if (h < 12) return '早安，新的一天开始了'
  if (h < 14) return '中午好，稍事休息'
  if (h < 18) return '下午好，保持专注'
  return '晚上好，继续加油'
}

function getScoreColor(score) {
  if (score >= 90) return 'excellent'
  if (score >= 80) return 'good'
  if (score >= 70) return 'average'
  return 'low'
}

function Dashboard() {
  const { stats: sessionStats, getRecentSessions } = useSessionStore()
  const savedSessions = getRecentSessions(4)

  const displayStats = [
    { label: '练习总次数', id: 'M-01', value: String(sessionStats.totalSessions || 47), delta: `+${sessionStats.totalSessions > 0 ? Math.min(sessionStats.totalSessions, 5) : 5} 本周`, icon: '⬡', color: '' },
    { label: '综合评分', id: 'M-02', value: String(sessionStats.avgScore || 82), delta: '+3.2 较上月', icon: '◈', color: 'purple' },
    { label: '当前段位', id: 'M-03', value: '铂金', delta: '距钻石差 180 分', icon: '◇', color: 'blue' },
    { label: '积分余额', id: 'M-04', value: '1,280', delta: '+120 本周', icon: '△', color: 'red' },
  ]

  return (
    <div className={styles.dashboard}>
      {/* Hero Header */}
      <div className={styles.hero}>
        <div className={styles['hero-text']}>
          <h1>DASHBOARD</h1>
          <div className={styles['hero-greeting']}>{getGreeting()}</div>
          <div className={styles['hero-sub']}>
            智启工作台 · {new Date().toLocaleDateString('zh-CN', { month: 'long', day: 'numeric', weekday: 'long' })}
          </div>
        </div>
        <div className={styles['hero-streak']}>
          <span className={styles['streak-value']}>{sessionStats.streak || 7}</span>
          <span className={styles['streak-label']}>连续天数</span>
        </div>
      </div>

      {/* Stats Cards */}
      <div className={styles['stats-grid']}>
        {displayStats.map((s) => (
          <div key={s.id} className={`${styles['stat-card']} ${s.color ? styles[`stat-${s.color}`] : ''}`}>
            <div className={`hw-inset ${styles['stat-icon-bg']}`}>
              <span className={styles['stat-icon']} aria-hidden="true">{s.icon}</span>
            </div>
            <div className={styles['stat-body']}>
              <div className={styles['stat-label']}>
                {s.label}
                <span className={styles['stat-id']}>[{s.id}]</span>
              </div>
              <div className={styles['stat-value']}>
                {s.value}
              </div>
              <div className={styles['stat-delta']}>{s.delta}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Main Content: 3-column layout */}
      <div className={styles['main-grid']}>
        {/* Radar Chart Panel */}
        <div className={`hw-panel ${styles.panel} ${styles['panel-radar']}`}>
          <div className={styles['panel-header']}>
            <span className={styles['panel-title']}>能力雷达</span>
            <span className={styles['panel-id']}>[RADAR-01]</span>
          </div>
          <div className={styles['radar-container']}>
            <ResponsiveContainer width="100%" height={340}>
              <RadarChart data={radarData} outerRadius="85%">
                <PolarGrid stroke="rgba(226,224,229,0.08)" />
                <PolarAngleAxis
                  dataKey="axis"
                  tick={{ fill: 'rgba(226,224,229,0.6)', fontSize: 11, fontFamily: "'Space Mono', monospace" }}
                />
                <PolarRadiusAxis
                  angle={90}
                  domain={[0, 100]}
                  tick={{ fill: 'rgba(226,224,229,0.25)', fontSize: 9 }}
                  axisLine={false}
                />
                <Radar
                  name="能力"
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
          <div className={styles['radar-legend']}>
            {radarData.map((d) => (
              <div key={d.axis} className={styles['radar-tag']}>
                <span className={styles['radar-tag-name']}>{d.axis}</span>
                <span className={styles['radar-tag-val']}>{d.value}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Right Column: Quick Actions + Recent */}
        <div className={styles['right-col']}>
          {/* Quick Actions */}
          <div className={`hw-panel ${styles.panel}`}>
            <div className={styles['panel-header']}>
              <span className={styles['panel-title']}>快速启动</span>
              <span className={styles['panel-id']}>[ACT-01]</span>
            </div>
            <div className={styles['actions-grid']}>
              <Link to="/lgd/lobby" className={`${styles['action-card']} ${styles['action-lgd']}`} aria-label="进入 LGD 群面模拟">
                <div className={styles['action-icon']}><img src={iconLgd} className={styles['action-icon-svg']} alt="" /></div>
                <div className={styles['action-text']}>
                  <h3>LGD 群面模拟</h3>
                  <p>AI 角色 · 实战训练</p>
                </div>
                <span className={styles['action-arrow']} aria-hidden="true">→</span>
              </Link>
              <Link to="/resume" className={`${styles['action-card']} ${styles['action-resume']}`} aria-label="进入简历优化">
                <div className={styles['action-icon']}><img src={iconResume} className={styles['action-icon-svg']} alt="" /></div>
                <div className={styles['action-text']}>
                  <h3>简历优化</h3>
                  <p>AI 精准优化建议</p>
                </div>
                <span className={styles['action-arrow']} aria-hidden="true">→</span>
              </Link>
              <Link to="/interview/lobby" className={`${styles['action-card']} ${styles['action-interview']}`} aria-label="进入模拟面试">
                <div className={styles['action-icon']}><img src={iconInterview} className={styles['action-icon-svg']} alt="" /></div>
                <div className={styles['action-text']}>
                  <h3>模拟面试</h3>
                  <p>1v1 结构化 · 高压追问</p>
                </div>
                <span className={styles['action-arrow']} aria-hidden="true">→</span>
              </Link>
            </div>
          </div>

          {/* Recent Sessions */}
          <div className={`hw-panel ${styles.panel}`}>
            <div className={styles['panel-header']}>
              <span className={styles['panel-title']}>最近练习</span>
              <span className={styles['panel-id']}>[LOG-01]</span>
            </div>
            <div className={styles['sessions-list']}>
              {(savedSessions.length > 0 ? savedSessions : recentSessions).map((s) => (
                <div key={s.id} className={styles['session-item']}>
                  <div className={styles['session-left']}>
                    <span className={`${styles['session-type']} ${styles[s.type]}`}>{s.type}</span>
                    <div className={styles['session-info']}>
                      <div className={styles['session-topic']}>{s.topic}</div>
                      <div className={styles['session-meta']}>{s.date} · {s.durationMinutes ? `${s.durationMinutes}min` : s.duration}</div>
                    </div>
                  </div>
                  <div className={styles['session-right']}>
                    <div className={`${styles['session-score']} ${styles[getScoreColor(s.score)]}`}>
                      {s.score}
                    </div>
                    <div className={styles['score-bar']}>
                      <div
                        className={`${styles['score-fill']} ${styles[getScoreColor(s.score)]}`}
                        style={{ width: `${s.score}%` }}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Skill Spectrum */}
      <div className={styles['bottom-scale']}>
        <span className={styles['scale-label']}>SKILL SPECTRUM</span>
        <div className={styles['scale-track']}>
          <div className={styles['scale-point']}>
            <div className={`${styles['scale-dot']} ${styles.red}`} />
            <span>初级</span>
          </div>
          <div className={styles['scale-line']} />
          <div className={styles['scale-point']}>
            <div className={`${styles['scale-dot']} ${styles.blue}`} />
            <span>进阶</span>
          </div>
          <div className={styles['scale-line']} />
          <div className={styles['scale-point']}>
            <div className={`${styles['scale-dot']} ${styles.purple}`} />
            <span>精通</span>
          </div>
        </div>
      </div>
    </div>
  )
}

export default memo(Dashboard)
