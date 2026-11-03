import SmallN from './SmallN'
import styles from '../ResearchStats.module.css'

const ARMS = [
  ['11', 'ZP 主动 · ZC 连续'],
  ['10', 'ZP 主动 · ZC 常规'],
  ['01', 'ZP 示范 · ZC 连续'],
  ['00', 'ZP 示范 · ZC 常规'],
]

export default function ArmGrid({ grid }) {
  if (!grid || !Object.keys(grid).length) {
    return <p className={styles.empty}>暂无到期后测数据</p>
  }
  return (
    <div className={styles.armGrid}>
      {ARMS.map(([arm, label]) => {
        const cell = grid[arm] || {}
        const rate =
          cell.completion_rate != null ? `${(cell.completion_rate * 100).toFixed(1)}%` : '—'
        return (
          <div key={arm} className={styles.armCell}>
            <div className={styles.armLabel}>{label}</div>
            <div className={styles.armRate}>{rate}</div>
            <div className={styles.armSub}>
              <SmallN value={cell.done_n} /> / <SmallN value={cell.due_n} /> · 失访{' '}
              <SmallN value={cell.attrition_n} />
            </div>
          </div>
        )
      })}
    </div>
  )
}
