import { useEffect, useState } from 'react'
import { fetchResearchExperiment } from '../../../../api/researchAdmin'
import { getErrorMessage } from '../../../../api/client'
import StatCard from '../components/StatCard'
import SmallN from '../components/SmallN'
import styles from '../ResearchStats.module.css'

const OUTCOMES = [
  { id: 'qualified_activation', label: '已观察到的合格激活' },
  { id: 'posttest_status', label: '7 日盲评后测完成' },
  { id: 'survey:J2', label: 'J2 自评满意' },
]

export default function ExperimentTab({ filters, refreshKey }) {
  const [outcome, setOutcome] = useState('qualified_activation')
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    fetchResearchExperiment(filters, outcome)
      .then((d) => !cancelled && setData(d))
      .catch((err) => !cancelled && setError(getErrorMessage(err, '加载失败')))
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
  }, [filters, refreshKey, outcome])

  const unstable = data?.bootstrap?.unstable

  return (
    <>
      <p className={styles.notice}>{data?.exploratory_notice}</p>
      {unstable && <p className={styles.warnText}>样本量不足，区间不稳定</p>}
      <label className={styles.filterField}>
        结果变量 Y
        <select value={outcome} onChange={(e) => setOutcome(e.target.value)}>
          {OUTCOMES.map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
        </select>
      </label>
      {loading && <div className={styles.skeletonGrid}>加载中…</div>}
      {error && <div className={styles.errorBox}>{error}</div>}
      {data?.activation_counts && (
        <>
          <p className={styles.notice}>观察窗口待确认，当前仅显示已确认人数和未确认人数。</p>
          <div className={styles.armGrid}>
            {Object.entries(data.activation_counts).map(([arm, counts]) => (
              <StatCard key={arm} title={`组 ${arm}`} value={counts.confirmed}>
                尚未确认 <SmallN value={counts.unconfirmed} />
              </StatCard>
            ))}
          </div>
        </>
      )}
      {data?.cells && (
        <div className={styles.armGrid}>
          {['00', '01', '10', '11'].map((arm) => (
            <StatCard key={arm} title={`组 ${arm}`} value={data.cells.cells?.[arm]?.mean?.toFixed?.(2) ?? '—'}>
              n=<SmallN value={data.cells.cells?.[arm]?.n} />
            </StatCard>
          ))}
        </div>
      )}
      {data?.effects && (
        <StatCard title="效应（探索性）">
          <p>ΔCP: {data.effects.delta_cp?.toFixed?.(3) ?? '—'}</p>
          {data.bootstrap?.delta_cp && (
            <p>
              Bootstrap 95%: [{data.bootstrap.delta_cp.low?.toFixed(3)}, {data.bootstrap.delta_cp.high?.toFixed(3)}]
            </p>
          )}
        </StatCard>
      )}
    </>
  )
}
