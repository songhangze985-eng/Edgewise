import SmallN from './SmallN'
import styles from '../ResearchStats.module.css'

export default function StatCard({ title, value, sub, n, missingRate, children, warn }) {
  return (
    <div className={`hw-panel ${styles.card}`}>
      <div className={styles.cardHead}>
        <h3>{title}</h3>
        <div className={styles.cardMeta}>
          {n !== undefined && (
            <span>
              n=<SmallN value={n} />
            </span>
          )}
          {missingRate != null && (
            <span>
              缺失 {typeof missingRate === 'number' ? `${(missingRate * 100).toFixed(1)}%` : '—'}
            </span>
          )}
        </div>
      </div>
      {value !== undefined && (
        <div className={`${styles.kpiValue} ${warn ? styles.warn : ''}`}>{value}</div>
      )}
      {sub && <p className={styles.cardSub}>{sub}</p>}
      {children}
    </div>
  )
}
