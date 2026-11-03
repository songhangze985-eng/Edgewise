import { useEffect, useState } from 'react'
import { fetchResearchCrosstab } from '../../../../api/researchAdmin'
import { getErrorMessage } from '../../../../api/client'
import StatCard from '../components/StatCard'
import styles from '../ResearchStats.module.css'

const PRESETS = [
  { id: 'g5_share', label: 'G5 vs 实际分享' },
  { id: 'g6_incentive', label: 'G6 vs 激励领取' },
  { id: 'f1_zp', label: 'F1 vs ZP 分配' },
  { id: 'c1_zc', label: 'C1 vs ZC 实现' },
  { id: 'j2_blind', label: 'J2 vs 盲评均分' },
]

export default function CrosstabTab({ filters, refreshKey }) {
  const [preset, setPreset] = useState('g5_share')
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false
    fetchResearchCrosstab(filters, { preset })
      .then((d) => !cancelled && setData(d))
      .catch((err) => !cancelled && setError(getErrorMessage(err, '加载失败')))
    return () => {
      cancelled = true
    }
  }, [filters, refreshKey, preset])

  return (
    <>
      <p className={styles.notice}>两者不一致是研究发现，不是数据错误</p>
      <div className={styles.filterRow}>
        {PRESETS.map((p) => (
          <button
            key={p.id}
            type="button"
            className={`${styles.tabBtn} ${preset === p.id ? styles.tabBtnActive : ''}`}
            onClick={() => setPreset(p.id)}
          >
            {p.label}
          </button>
        ))}
      </div>
      {error && <div className={styles.errorBox}>{error}</div>}
      {data && (
        <StatCard title="对照结果" sub={data.note}>
          <p>一致率: {data.agreement_rate != null ? `${(data.agreement_rate * 100).toFixed(1)}%` : '—'}</p>
          <pre className={styles.codeBlock}>{JSON.stringify(data.matrix, null, 2)}</pre>
        </StatCard>
      )}
    </>
  )
}
