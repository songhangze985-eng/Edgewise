import { useEffect, useState } from 'react'
import { fetchResearchPassive } from '../../../../api/researchAdmin'
import { getErrorMessage } from '../../../../api/client'
import StatCard from '../components/StatCard'
import styles from '../ResearchStats.module.css'

export default function PassiveTab({ filters, refreshKey }) {
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    fetchResearchPassive(filters)
      .then((d) => !cancelled && setData(d))
      .catch((err) => !cancelled && setError(getErrorMessage(err, '加载失败')))
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
  }, [filters, refreshKey])

  if (loading) return <div className={styles.skeletonGrid}>加载中…</div>
  if (error) return <div className={styles.errorBox}>{error}</div>
  const fields = Object.values(data?.fields || {})
  if (!fields.length) return <p className={styles.empty}>当前筛选下还没有数据</p>

  return (
    <div className={styles.cardGrid}>
      {fields.map((f) => (
        <StatCard
          key={f.field}
          title={f.field}
          missingRate={f.missing_rate}
          n={f.n_eligible}
        >
          {f.type === 'binary' && (
            <p>
              比例 {f.rate != null ? `${(f.rate * 100).toFixed(1)}%` : '—'}（{f.positives}/{f.trials}）
            </p>
          )}
          {f.type === 'categorical' && (
            <ul className={styles.barList}>
              {(f.categories || []).map((c) => (
                <li key={c.label}>
                  {c.label}: {c.count}
                </li>
              ))}
            </ul>
          )}
          {f.type === 'numeric' && (
            <p>
              中位数 {f.median ?? '—'} · 均值 {f.mean?.toFixed?.(1) ?? '—'}
            </p>
          )}
        </StatCard>
      ))}
    </div>
  )
}
