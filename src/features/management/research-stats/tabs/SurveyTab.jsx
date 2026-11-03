import { useEffect, useState } from 'react'
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Cell } from 'recharts'
import { fetchResearchSurveyItems } from '../../../../api/researchAdmin'
import { getErrorMessage } from '../../../../api/client'
import StatCard from '../components/StatCard'
import styles from '../ResearchStats.module.css'

export default function SurveyTab({ filters, refreshKey }) {
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    fetchResearchSurveyItems(filters)
      .then((d) => !cancelled && setData(d))
      .catch((err) => !cancelled && setError(getErrorMessage(err, '加载失败')))
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
  }, [filters, refreshKey])

  if (loading) return <div className={styles.skeletonGrid}>加载中…</div>
  if (error) return <div className={styles.errorBox}>{error}</div>
  const items = Object.values(data?.items || {})
  if (!items.length) return <p className={styles.empty}>当前筛选下还没有数据</p>

  return (
    <div className={styles.cardGrid}>
      {items.map((item) => {
        const likert = item.likert
        const chartData = likert?.distribution
          ? Object.entries(likert.distribution).map(([score, count]) => ({
              score,
              count: count === '<5' ? 0 : count,
            }))
          : []
        return (
          <StatCard
            key={item.id}
            title={
              <>
                {item.id}
                {item.reverse ? ' R' : ''}
              </>
            }
            missingRate={item.missing_rate}
            n={likert?.n}
          >
            <p className={styles.cardSub}>{item.text}</p>
            {item.type === 'likert7' && chartData.length > 0 && (
              <div className={styles.chartBox}>
                <ResponsiveContainer width="100%" height={120}>
                  <BarChart data={chartData}>
                    <XAxis dataKey="score" tick={{ fill: 'var(--text-muted)', fontSize: 12 }} />
                    <YAxis hide />
                    <Bar dataKey="count">
                      {chartData.map((entry) => (
                        <Cell
                          key={entry.score}
                          fill={Number(entry.score) <= 3 ? 'var(--danger)' : Number(entry.score) >= 5 ? 'var(--primary)' : 'var(--text-muted)'}
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
                <p className={styles.cardSub}>
                  中位 {likert.median ?? '—'} · 均值 {likert.mean ?? '—'} · 正向 {likert.positive_rate != null ? `${(likert.positive_rate * 100).toFixed(0)}%` : '—'}
                </p>
              </div>
            )}
          </StatCard>
        )
      })}
    </div>
  )
}
