import SmallN from './SmallN'
import styles from '../ResearchStats.module.css'

export default function Funnel({ steps }) {
  if (!steps?.length) {
    return <p className={styles.empty}>当前筛选下还没有数据</p>
  }
  const maxN = Math.max(...steps.map((s) => (typeof s.n === 'number' ? s.n : 0)), 1)
  return (
    <div className={styles.funnel}>
      {steps.map((step) => {
        const n = step.n
        const width = typeof n === 'number' ? `${Math.max(8, (n / maxN) * 100)}%` : '8%'
        const pct =
          step.pct_of_consent != null && typeof n === 'number'
            ? `${(step.pct_of_consent * 100).toFixed(1)}%`
            : '—'
        return (
          <div key={step.step} className={styles.funnelRow}>
            <span className={styles.funnelLabel}>{step.step}</span>
            <div className={styles.funnelTrack}>
              <div className={styles.funnelBar} style={{ width }} />
            </div>
            <span className={styles.funnelNums}>
              <SmallN value={n} /> · {pct}
            </span>
          </div>
        )
      })}
    </div>
  )
}
