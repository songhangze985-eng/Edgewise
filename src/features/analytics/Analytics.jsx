import { useState, memo } from 'react'
import { useNavigate } from 'react-router-dom'
import { Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer } from 'recharts'
import styles from './Analytics.module.css'

const overviewStats = [
  { label: '总练习次数', value: '47', delta: '+5', icon: '⬡' },
  { label: '平均得分', value: '82.4', delta: '+3.2', icon: '◈' },
  { label: '最高得分', value: '96', delta: 'LGD', icon: '△' },
  { label: '练习时长', value: '18.5h', delta: '本月', icon: '◇' },
]

const radarData = [
  { axis: '表达力', value: 82, prev: 76 },
  { axis: '逻辑力', value: 75, prev: 70 },
  { axis: '领导力', value: 68, prev: 62 },
  { axis: '协作力', value: 88, prev: 85 },
  { axis: '应变力', value: 71, prev: 65 },
]

const sessions = [
  { id: 1, type: 'lgd', topic: '如何提升远程团队的协作效率', score: 85, date: '2026-03-16', duration: '45min', dimensions: { expression: 88, logic: 82, leadership: 78, teamwork: 90, adaptability: 80 } },
  { id: 2, type: 'resume', topic: '简历 AI 优化 · 产品经理岗位', score: 92, date: '2026-03-15', duration: '12min', dimensions: { expression: 95, logic: 90, leadership: 85, teamwork: 92, adaptability: 88 } },
  { id: 3, type: 'lgd', topic: '新消费品牌的增长策略讨论', score: 78, date: '2026-03-14', duration: '40min', dimensions: { expression: 80, logic: 75, leadership: 72, teamwork: 82, adaptability: 76 } },
  { id: 4, type: 'interview', topic: '1v1 模拟面试 · 战略咨询', score: 81, date: '2026-03-13', duration: '30min', dimensions: { expression: 84, logic: 80, leadership: 75, teamwork: 78, adaptability: 82 } },
  { id: 5, type: 'lgd', topic: '大学生创业的时机选择', score: 88, date: '2026-03-12', duration: '42min', dimensions: { expression: 90, logic: 86, leadership: 82, teamwork: 91, adaptability: 85 } },
  { id: 6, type: 'interview', topic: '1v1 模拟面试 · 产品经理', score: 76, date: '2026-03-11', duration: '25min', dimensions: { expression: 78, logic: 74, leadership: 70, teamwork: 80, adaptability: 72 } },
]

const typeLabels = { lgd: 'LGD 群面', resume: '简历优化', interview: '模拟面试' }
const filterOptions = ['全部', 'lgd', 'resume', 'interview']

function getScoreLevel(score) {
  if (score >= 90) return 'excellent'
  if (score >= 80) return 'good'
  if (score >= 70) return 'average'
  return 'low'
}

function Analytics() {
  const navigate = useNavigate()
  const [filter, setFilter] = useState('全部')

  const filtered = filter === '全部'
    ? sessions
    : sessions.filter((s) => s.type === filter)

  return (
    <div className={styles.analytics}>
      <div className={styles['page-header']}>
        <h1>深度复盘中心</h1>
        <div className={styles['header-sub']}>Deep Analytics · Performance Review</div>
      </div>

      {/* Overview Stats */}
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

      {/* Main Content */}
      <div className={styles['main-grid']}>
        {/* Left: Trend Radar */}
        <div className={`hw-panel ${styles.panel}`}>
          <div className={styles['panel-header']}>
            <span className={styles['panel-title']}>能力趋势</span>
            <span className={styles['panel-badge']}>对比上月</span>
          </div>
          <div className={styles['radar-container']}>
            <ResponsiveContainer width="100%" height={280}>
              <RadarChart data={radarData} outerRadius="72%">
                <PolarGrid stroke="rgba(226,224,229,0.08)" />
                <PolarAngleAxis
                  dataKey="axis"
                  tick={{ fill: 'rgba(226,224,229,0.6)', fontSize: 11, fontFamily: "'Space Mono', monospace" }}
                />
                <PolarRadiusAxis
                  angle={90}
                  domain={[0, 100]}
                  tick={false}
                  axisLine={false}
                />
                <Radar
                  name="上月"
                  dataKey="prev"
                  stroke="rgba(226,224,229,0.2)"
                  fill="rgba(226,224,229,0.05)"
                  strokeWidth={1}
                  strokeDasharray="4 4"
                />
                <Radar
                  name="本月"
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
            <div className={styles['legend-item']}>
              <div className={`${styles['legend-line']} ${styles.current}`} />
              <span>本月</span>
            </div>
            <div className={styles['legend-item']}>
              <div className={`${styles['legend-line']} ${styles.prev}`} />
              <span>上月</span>
            </div>
          </div>
          {/* Dimension breakdown */}
          <div className={styles['dimension-list']}>
            {radarData.map((d) => (
              <div key={d.axis} className={styles['dimension-row']}>
                <span className={styles['dim-name']}>{d.axis}</span>
                <div className={styles['dim-bar-track']}>
                  <div
                    className={styles['dim-bar-fill']}
                    style={{ width: `${d.value}%` }}
                  />
                  <div
                    className={styles['dim-bar-prev']}
                    style={{ left: `${d.prev}%` }}
                  />
                </div>
                <span className={styles['dim-value']}>{d.value}</span>
                <span className={styles['dim-delta']}>+{d.value - d.prev}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Right: Session History */}
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
                    {typeLabels[s.type]}
                  </span>
                  <span className={styles['session-date']}>{s.date}</span>
                </div>
                <div className={styles['session-topic']}>{s.topic}</div>
                <div className={styles['session-bottom']}>
                  <span className={styles['session-duration']}>{s.duration}</span>
                  <div className={styles['session-score-wrap']}>
                    <span className={`${styles['session-score']} ${styles[getScoreLevel(s.score)]}`}>
                      {s.score}
                    </span>
                    <div className={styles['score-bar']}>
                      <div
                        className={`${styles['score-fill']} ${styles[getScoreLevel(s.score)]}`}
                        style={{ width: `${s.score}%` }}
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
