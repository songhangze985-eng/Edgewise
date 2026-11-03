import { useEffect, useState } from 'react'
import { fetchResearchReliability } from '../../../../api/researchAdmin'
import { getErrorMessage } from '../../../../api/client'
import StatCard from '../components/StatCard'
import styles from '../ResearchStats.module.css'

export default function ReliabilityTab({ filters, refreshKey }) {
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false
    fetchResearchReliability(filters)
      .then((d) => !cancelled && setData(d))
      .catch((err) => !cancelled && setError(getErrorMessage(err, '加载失败')))
    return () => {
      cancelled = true
    }
  }, [filters, refreshKey])

  if (error) return <div className={styles.errorBox}>{error}</div>
  const constructs = data?.constructs || []
  if (!constructs.length) return <p className={styles.empty}>当前筛选下还没有数据</p>

  return (
    <div className={styles.cardGrid}>
      {constructs.map((c) => (
        <StatCard
          key={c.id}
          title={c.id}
          n={c.complete_n}
          warn={c.warning === 'low'}
        >
          <p className={styles.cardSub}>{c.items?.join(', ')}</p>
          {c.status === 'insufficient' ? (
            <p>样本不足</p>
          ) : (
            <p>
              {c.metric}: {c.value?.toFixed?.(3) ?? '—'}
            </p>
          )}
        </StatCard>
      ))}
    </div>
  )
}
