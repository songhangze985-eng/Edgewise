import { memo, useEffect, useState, useRef } from 'react'
import { Link } from 'react-router-dom'
import { Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer, Tooltip } from 'recharts'
import useSessionStore from '../../stores/sessionStore'
import useAuthStore from '../../stores/authStore'
import { formatAvgScore, rankFromAvgScore } from '../../utils/userStats'
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

const RADAR_DIMENSION_TIPS = {
  逻辑思维: '结构化拆解问题，善用 MECE 与总分总框架支撑论点。',
  表达能力: '精简开场结论，控制语速在 180–240 字/分，减少口头禅。',
  团队协作: '群面中主动承接他人观点，促进分歧收敛而非单向输出。',
  专业知识: '结合岗位核心能力模型，用具体技术/业务指标佐证方案。',
  应变抗压: '面对高频追问先定性回应核心矛盾，再补充边界条件。',
  领导推动: '关注讨论时间轴与阶段目标，适时推动共识与总结陈词。',
}

function FlipUnit({ value, label }) {
  const prevRef = useRef(value)
  const [prevValue, setPrevValue] = useState(value)
  const [flipping, setFlipping] = useState(false)

  useEffect(() => {
    if (prevRef.current !== value) {
      setPrevValue(prevRef.current)
      prevRef.current = value
      setFlipping(true)
      const timer = window.setTimeout(() => {
        setFlipping(false)
        setPrevValue(value)
      }, 460)
      return () => window.clearTimeout(timer)
    }
    return undefined
  }, [value])

  return (
    <div className={styles['flip-unit']} aria-label={label}>
      <div className={`${styles['flip-card']} ${flipping ? styles['flip-card-active'] : ''}`}>
        <div className={styles['flip-upper']}>
          <span>{value}</span>
        </div>
        <div className={styles['flip-lower']}>
          <span>{flipping ? prevValue : value}</span>
        </div>
        {flipping && (
          <>
            <div className={`${styles['flip-upper']} ${styles['flip-leaf-front']}`} aria-hidden="true">
              <span>{prevValue}</span>
            </div>
            <div className={`${styles['flip-lower']} ${styles['flip-leaf-back']}`} aria-hidden="true">
              <span>{value}</span>
            </div>
          </>
        )}
        <div className={styles['flip-hinge']} aria-hidden="true">
          <span className={styles['flip-notch-left']} />
          <span className={styles['flip-notch-right']} />
        </div>
      </div>
    </div>
  )
}

function MechanicalFlipClock() {
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 1000)
    return () => window.clearInterval(id)
  }, [])

  const hh = String(now.getHours()).padStart(2, '0')
  const mm = String(now.getMinutes()).padStart(2, '0')
  const ss = String(now.getSeconds()).padStart(2, '0')
  const dateStr = now.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric', weekday: 'short' })

  return (
    <div className={styles['flip-clock-shell']} role="timer" aria-label={`当前时间 ${hh}:${mm}:${ss}`}>
      <span className={styles['flip-date-tag']}>{dateStr}</span>
      <div className={styles['flip-clock-group']}>
        <FlipUnit value={hh} label="时" />
        <span className={styles['flip-colon']} aria-hidden="true">:</span>
        <FlipUnit value={mm} label="分" />
        <span className={styles['flip-colon']} aria-hidden="true">:</span>
        <FlipUnit value={ss} label="秒" />
      </div>
    </div>
  )
}

function RadarCornerTick({ payload, x, y, cx, cy, onHoverAxis }) {
  const dx = x - cx
  const dy = y - cy
  const dist = Math.hypot(dx, dy) || 1
  const offset = 20
  const nx = x + (dx / dist) * offset
  const ny = y + (dy / dist) * offset
  let textAnchor = 'middle'
  if (dx > 16) textAnchor = 'start'
  else if (dx < -16) textAnchor = 'end'

  return (
    <g
      transform={`translate(${nx},${ny})`}
      className={styles['radar-corner-tick-group']}
      onMouseEnter={() => onHoverAxis?.(payload.value)}
      onMouseLeave={() => onHoverAxis?.(null)}
    >
      <text
        x={0}
        y={0}
        dy="0.35em"
        textAnchor={textAnchor}
        className={styles['radar-corner-label']}
      >
        {payload.value}
      </text>
    </g>
  )
}

function RadarHoverPopup({ active, payload }) {
  if (!active || !payload || !payload.length) return null
  const item = payload[0]?.payload
  if (!item) return null
  const score = Number(item.value ?? 0)
  const tier = score >= 85 ? '精通优势项' : score >= 70 ? '稳健进阶项' : '重点突破项'
  const tip = RADAR_DIMENSION_TIPS[item.axis] || '结合模拟面试与群面实战持续迭代该维度表现。'

  return (
    <div className={styles['radar-tooltip-popup']} role="status">
      <div className={styles['radar-tooltip-head']}>
        <span className={styles['radar-tooltip-axis']}>{item.axis}</span>
        <span className={styles['radar-tooltip-tier']}>{tier}</span>
      </div>
      <div className={styles['radar-tooltip-score-row']}>
        <span className={styles['radar-tooltip-score']}>{score}</span>
        <span className={styles['radar-tooltip-max']}>/ 100 PTS</span>
      </div>
      <div className={styles['radar-tooltip-bar']}>
        <div className={styles['radar-tooltip-fill']} style={{ width: `${Math.min(100, Math.max(0, score))}%` }} />
      </div>
      <p className={styles['radar-tooltip-tip']}>{tip}</p>
    </div>
  )
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
  const rank = rankFromAvgScore(stats.avgScore || 0)
  const credits = stats.credits || user?.credits || 0
  const [hoveredCornerAxis, setHoveredCornerAxis] = useState(null)
  const hoveredCornerItem = hoveredCornerAxis
    ? radarData.find((d) => d.axis === hoveredCornerAxis) || null
    : null

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
          <div className={styles['header-actions-group']}>
            <MechanicalFlipClock />
            <div className={styles['hero-streak']}>
              <span className={styles['streak-value']}>{stats.streak || 0}</span>
              <span className={styles['streak-label']}>连续天数</span>
            </div>
          </div>
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
            <span className={styles['panel-id']}>[RADAR-01 · 悬浮查看维度详情]</span>
          </div>
          <div className={styles['radar-container']}>
            <ResponsiveContainer width="100%" height={360}>
              <RadarChart
                data={radarData}
                outerRadius="64%"
                margin={{ top: 28, right: 52, bottom: 28, left: 52 }}
              >
                <PolarGrid stroke="var(--line)" />
                <PolarAngleAxis
                  dataKey="axis"
                  tick={(props) => <RadarCornerTick {...props} onHoverAxis={setHoveredCornerAxis} />}
                />
                <PolarRadiusAxis
                  angle={90}
                  domain={[0, 100]}
                  tick={{ fill: 'var(--muted)', fontSize: 9 }}
                  axisLine={false}
                />
                <Tooltip
                  content={<RadarHoverPopup />}
                  cursor={{ stroke: 'rgba(155, 111, 199, 0.45)', strokeWidth: 1.5 }}
                />
                <Radar
                  name="能力"
                  dataKey="value"
                  stroke="#9b6fc7"
                  fill="#9b6fc7"
                  fillOpacity={0.22}
                  strokeWidth={2.4}
                  dot={{ r: 4, fill: '#9b6fc7', strokeWidth: 0 }}
                  activeDot={{ r: 6, fill: 'var(--accent)', stroke: '#fff', strokeWidth: 2 }}
                />
              </RadarChart>
            </ResponsiveContainer>
            {hoveredCornerItem && (
              <div className={styles['radar-corner-popup-overlay']}>
                <RadarHoverPopup active={true} payload={[{ payload: hoveredCornerItem }]} />
              </div>
            )}
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
