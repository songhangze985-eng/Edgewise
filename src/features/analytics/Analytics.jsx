import { useEffect, useState, memo } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Line,
  LineChart,
  Radar,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import useSessionStore from '../../stores/sessionStore'
import PageBar from '../../components/ui/PageBar'
import { scoreLevel as getScoreLevel, scoreGradeLabel } from '../../utils/scoreGrades'
import styles from './Analytics.module.css'

const typeLabels = { lgd: 'LGD 群面', resume: '简历优化', interview: '模拟面试' }
const filterOptions = ['全部', 'lgd', 'resume', 'interview']

function Analytics() {
  const navigate = useNavigate()
  const [filter, setFilter] = useState('全部')
  const refresh = useSessionStore((s) => s.refresh)
  const loading = useSessionStore((s) => s.loading)
  const sessions = useSessionStore((s) => s.sessions)
  const stats = useSessionStore((s) => s.stats)
  const radarData = useSessionStore((s) => s.radarData)

  useEffect(() => {
    refresh().catch(() => {})
  }, [refresh])

  const filtered = filter === '全部'
    ? sessions
    : sessions.filter((s) => s.type === filter)

  const scores = sessions.filter((s) => typeof s.score === 'number').map((s) => s.score)
  const bestScore = scores.length ? Math.max(...scores) : 0
  const hours = ((stats.totalDuration || 0) / 60).toFixed(1)

  const overviewStats = [
    { label: '总练习次数', value: String(stats.totalSessions || 0), delta: `连续 ${stats.streak || 0} 天`, icon: '⬡' },
    { label: '平均得分', value: String(Math.round(stats.avgScore || 0)), delta: '历史均值', icon: '◈' },
    { label: '最高得分', value: String(bestScore || '--'), delta: '近期会话', icon: '△' },
    { label: '练习时长', value: `${hours}h`, delta: '累计', icon: '◇' },
  ]

  const chartData = radarData.map((d) => ({
    ...d,
    prev: Math.max(0, d.value - 5),
  }))

  const deliveryTrend = sessions
    .filter((s) => s.type === 'interview')
    .slice(0, 10)
    .reverse()
    .map((s, idx) => ({
      label: s.date || `#${idx + 1}`,
      cpm: s.deliverySummary?.avg_cpm ?? null,
      filler: s.deliverySummary?.avg_filler_per_100 ?? null,
    }))
    .filter((row) => row.cpm != null || row.filler != null)

  if (loading && sessions.length === 0) {
    return (
      <div className={styles.analytics}>
        <p style={{ padding: '2rem', color: 'var(--chalk-dim)', fontFamily: 'var(--font-mono)' }}>
          正在加载复盘数据…
        </p>
      </div>
    )
  }

  return (
    <div className={styles.analytics}>
      <PageBar title="深度复盘中心" />

      <div className={styles['stats-row']}>
        {overviewStats.map((s) => (
          <div key={s.label} className={styles['stat-card']}>
            <div className={styles['stat-icon']}>{s.icon}</div>
            <div className={styles['stat-body']}>
              <div className={styles['stat-label']}>{s.label}</div>
              <div className={styles['stat-value']}>{s.value}</div>
              <div className={styles['stat-delta']}>{s.delta}</div>
            </div>
          </div>
        ))}
      </div>

      <div className={styles['main-grid']}>
        <div className={`hw-panel ${styles.panel}`}>
          <div className={styles['panel-header']}>
            <span className={styles['panel-title']}>能力趋势</span>
            <span className={styles['panel-badge']}>来自会话维度</span>
          </div>
          <div className={styles['radar-container']}>
            <ResponsiveContainer width="100%" height={280}>
              <RadarChart data={chartData} outerRadius="72%">
                <PolarGrid stroke="rgba(226,224,229,0.08)" />
                <PolarAngleAxis
                  dataKey="axis"
                  tick={{ fill: 'rgba(226,224,229,0.6)', fontSize: 11, fontFamily: "'Space Mono', monospace" }}
                />
                <PolarRadiusAxis angle={90} domain={[0, 100]} tick={false} axisLine={false} />
                <Radar
                  name="参考"
                  dataKey="prev"
                  stroke="rgba(226,224,229,0.2)"
                  fill="rgba(226,224,229,0.05)"
                  strokeWidth={1}
                  strokeDasharray="4 4"
                />
                <Radar
                  name="当前"
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
          <div className={styles['dimension-list']}>
            {chartData.map((d) => (
              <div key={d.axis} className={styles['dimension-row']}>
                <span className={styles['dim-name']}>{d.axis}</span>
                <div className={styles['dim-bar-track']}>
                  <div className={styles['dim-bar-fill']} style={{ width: `${d.value}%` }} />
                </div>
                <span className={styles['dim-value']}>{d.value}</span>
              </div>
            ))}
          </div>
        </div>

        <div className={`hw-panel ${styles.panel}`}>
          <div className={styles['panel-header']}>
            <span className={styles['panel-title']}>表达趋势（近 10 场）</span>
            <span className={styles['panel-badge']}>语速 · 填充词</span>
          </div>
          {deliveryTrend.length === 0 ? (
            <p className={styles['delivery-trend-empty']}>完成带语音作答的模拟面试后，这里会显示语速与填充词趋势。</p>
          ) : (
            <div className={styles['delivery-trend-chart']}>
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={deliveryTrend} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                  <XAxis dataKey="label" tick={{ fill: 'rgba(226,224,229,0.5)', fontSize: 10 }} />
                  <YAxis tick={{ fill: 'rgba(226,224,229,0.45)', fontSize: 10 }} />
                  <Tooltip
                    contentStyle={{
                      background: '#14121c',
                      border: '1px solid rgba(155,111,199,0.35)',
                      fontSize: 12,
                    }}
                  />
                  <Line
                    type="monotone"
                    dataKey="cpm"
                    name="语速 (字/分)"
                    stroke="#9b6fc7"
                    strokeWidth={2}
                    dot={{ r: 3 }}
                    connectNulls
                  />
                  <Line
                    type="monotone"
                    dataKey="filler"
                    name="填充词/百字"
                    stroke="#6fc7a8"
                    strokeWidth={2}
                    dot={{ r: 3 }}
                    connectNulls
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        <div className={`hw-panel ${styles.panel}`}>
          <div className={styles['panel-header']}>
            <span className={styles['panel-title']}>练习记录</span>
            <div className={styles['filter-row']}>
              {filterOptions.map((f) => (
                <button
                  key={f}
                  className={`${styles['filter-chip']} ${filter === f ? styles.active : ''}`}
                  onClick={() => setFilter(f)}
                >
                  {f === '全部' ? '全部' : typeLabels[f]}
                </button>
              ))}
            </div>
          </div>
          <div className={styles['sessions-list']}>
            {filtered.length === 0 && (
              <div className={styles['session-card']}>
                <div className={styles['session-topic']}>暂无练习记录</div>
              </div>
            )}
            {filtered.map((s) => (
              <div
                key={s.id}
                className={styles['session-card']}
                onClick={() => navigate(`/analytics/report/${s.id}`)}
                role="button"
                tabIndex={0}
                aria-label={`查看 ${s.topic} 报告`}
                onKeyDown={(e) => e.key === 'Enter' && navigate(`/analytics/report/${s.id}`)}
              >
                <div className={styles['session-top']}>
                  <span className={`${styles['session-type']} ${styles[s.type]}`}>
                    {typeLabels[s.type] || s.type}
                  </span>
                  <span className={styles['session-date']}>{s.date}</span>
                </div>
                <div className={styles['session-topic']}>{s.topic}</div>
                <div className={styles['session-bottom']}>
                  <span className={styles['session-duration']}>
                    {s.durationMinutes ? `${s.durationMinutes}min` : '--'}
                  </span>
                  <div className={styles['session-score-wrap']}>
                    <span className={`${styles['session-score']} ${styles[getScoreLevel(s.score || 0)]}`}>
                      {s.score ?? '--'}
                      {s.score != null && (
                        <span className={styles['session-grade-label']}>{scoreGradeLabel(s.score)}</span>
                      )}
                    </span>
                    <div className={styles['score-bar']}>
                      <div
                        className={`${styles['score-fill']} ${styles[getScoreLevel(s.score || 0)]}`}
                        style={{ width: `${s.score || 0}%` }}
                      />
                    </div>
                  </div>
                </div>
                <div className={styles['session-arrow']}>查看报告 →</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

export default memo(Analytics)
