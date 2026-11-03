import { memo, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer } from 'recharts'
import useSessionStore from '../../stores/sessionStore'
import useAuthStore from '../../stores/authStore'
import useResumeStore from '../../stores/resumeStore'
import { formatAvgScore, rankFromAvgScore, findWeakestDimension, dimKeyFromAxisLabel } from '../../utils/userStats'
import styles from './Dashboard.module.css'
import iconLgd from '../../assets/icons/feature-lgd.svg'
import iconResume from '../../assets/icons/feature-resume.svg'
import iconInterview from '../../assets/icons/feature-interview.svg'
import ResearchDashboardBanners from '../../components/ResearchDashboardBanners/ResearchDashboardBanners'
import PageBar from '../../components/ui/PageBar'
import ScheduleCountdownCard from './ScheduleCountdownCard'

function getPageTitle(user) {
  const h = new Date().getHours()
  const name = user?.name?.trim() || '用户'
  let period = '你好'
  if (h < 6) period = '夜深了'
  else if (h < 12) period = '早上好'
  else if (h < 14) period = '中午好'
  else if (h < 18) period = '下午好'
  else period = '晚上好'
  return `${period}，${name}`
}

function getScoreColor(score) {
  if (score >= 90) return 'excellent'
  if (score >= 80) return 'good'
  if (score >= 70) return 'average'
  return 'low'
}

function Dashboard() {
  const user = useAuthStore((s) => s.user)
  const stats = useSessionStore((s) => s.stats)
  const radarData = useSessionStore((s) => s.radarData)
  const refresh = useSessionStore((s) => s.refresh)
  const loading = useSessionStore((s) => s.loading)
  const error = useSessionStore((s) => s.error)
  const getRecentSessions = useSessionStore((s) => s.getRecentSessions)
  const savedSessions = getRecentSessions(4)
  const resumeId = useResumeStore((s) => s.resumeId)
  const resumeParsed = useResumeStore((s) => s.parsedData)
  const rank = rankFromAvgScore(stats.avgScore || 0)
  const credits = stats.credits || user?.credits || 0

  useEffect(() => {
    refresh().catch(() => {})
  }, [refresh])

  const displayStats = [
    {
      label: '练习总次数',
      id: 'M-01',
      value: String(stats.totalSessions || 0),
      delta: stats.streak ? `连续 ${stats.streak} 天` : '开始第一次练习',
      icon: '⬡',
      color: '',
    },
    {
      label: '综合评分',
      id: 'M-02',
      value: formatAvgScore(stats.avgScore || 0),
      delta: stats.avgScore ? '基于历史会话' : '暂无评分',
      icon: '◈',
      color: 'purple',
    },
    {
      label: '当前段位',
      id: 'M-03',
      value: rank.name,
      delta: rank.next,
      icon: '◇',
      color: 'blue',
    },
    {
      label: '积分余额',
      id: 'M-04',
      value: Number(credits).toLocaleString(),
      delta: user?.tierLabel || '会员积分',
      icon: '△',
      color: 'red',
    },
  ]

  const weakest = findWeakestDimension(radarData)
  const weakestKey = weakest ? dimKeyFromAxisLabel(weakest.axis) : 'logic'
  let nextStep = {
    title: '上传简历，开启个性化练习',
    desc: 'AI 将基于你的经历匹配岗位与面试题。',
    to: '/resume',
    cta: '去上传简历',
  }
  if (resumeId || resumeParsed) {
    if (!stats.totalSessions) {
      nextStep = {
        title: '开始第一次 1v1 模拟面试',
        desc: '结构化问答 + 五维评分，建立你的能力基线。',
        to: resumeId ? `/interview/lobby?resume=${resumeId}` : '/interview/lobby',
        cta: '进入面试大厅',
      }
    } else if (weakest) {
      const prefill = new URLSearchParams({
        type: 'behavioral',
        difficulty: 'medium',
        focus: weakestKey,
      })
      nextStep = {
        title: `下一步：强化「${weakest.axis}」`,
        desc: `当前 ${weakest.value} 分，建议针对薄弱维度加练（已预填面试大厅）。`,
        to: `/interview/lobby?${prefill.toString()}`,
        cta: '开始针对性练习',
      }
    }
  }

  if (loading && savedSessions.length === 0 && !stats.totalSessions) {
    return (
      <div className={styles.dashboard}>
        <p style={{ padding: '2rem', color: 'var(--chalk-dim)', fontFamily: 'var(--font-mono)' }}>
          正在加载工作台数据…
        </p>
      </div>
    )
  }

  return (
    <div className={styles.dashboard}>
      <PageBar
        title={getPageTitle(user)}
        actions={
          <>
            <span className={styles['header-date']}>
              {new Date().toLocaleDateString('zh-CN', { month: 'long', day: 'numeric', weekday: 'long' })}
            </span>
            <div className={styles['hero-streak']}>
              <span className={styles['streak-value']}>{stats.streak || 0}</span>
              <span className={styles['streak-label']}>连续天数</span>
            </div>
          </>
        }
      />

      <ResearchDashboardBanners />

      <ScheduleCountdownCard />

      {error && (
        <div className={styles['error-banner']}>
          <span>概览数据加载失败</span>
          <button type="button" onClick={() => refresh().catch(() => {})}>重试</button>
        </div>
      )}

      <Link to={nextStep.to} className={styles['next-card']}>
        <div className={styles['next-kicker']}>下一步推荐</div>
        <div className={styles['next-title']}>{nextStep.title}</div>
        <div className={styles['next-desc']}>{nextStep.desc}</div>
        <span className={styles['next-cta']}>{nextStep.cta} →</span>
      </Link>

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
              <div className={styles['stat-value']}>{s.value}</div>
              <div className={styles['stat-delta']}>{s.delta}</div>
            </div>
          </div>
        ))}
      </div>

      <div className={styles['main-grid']}>
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

        <div className={styles['right-col']}>
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

          <div className={`hw-panel ${styles.panel}`}>
            <div className={styles['panel-header']}>
              <span className={styles['panel-title']}>最近练习</span>
              <span className={styles['panel-id']}>[LOG-01]</span>
            </div>
            <div className={styles['sessions-list']}>
              {savedSessions.length === 0 ? (
                <div className={styles['session-item']}>
                  <div className={styles['session-info']}>
                    <div className={styles['session-topic']}>暂无练习记录</div>
                    <div className={styles['session-meta']}>从快速启动开始第一次训练</div>
                  </div>
                </div>
              ) : (
                savedSessions.map((s) => (
                  <Link key={s.id} to={`/analytics/report/${s.id}`} className={styles['session-item']}>
                    <div className={styles['session-left']}>
                      <span className={`${styles['session-type']} ${styles[s.type]}`}>{s.type}</span>
                      <div className={styles['session-info']}>
                        <div className={styles['session-topic']}>{s.topic}</div>
                        <div className={styles['session-meta']}>
                          {s.date} · {s.durationMinutes ? `${s.durationMinutes}min` : '--'}
                        </div>
                      </div>
                    </div>
                    <div className={styles['session-right']}>
                      <div className={`${styles['session-score']} ${styles[getScoreColor(s.score || 0)]}`}>
                        {s.score ?? '--'}
                      </div>
                      <div className={styles['score-bar']}>
                        <div
                          className={`${styles['score-fill']} ${styles[getScoreColor(s.score || 0)]}`}
                          style={{ width: `${s.score || 0}%` }}
                        />
                      </div>
                    </div>
                  </Link>
                ))
              )}
            </div>
          </div>
        </div>
      </div>

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
