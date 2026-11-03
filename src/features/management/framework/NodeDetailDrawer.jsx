import { Link } from 'react-router-dom'
import styles from './Framework.module.css'

export default function NodeDetailDrawer({ node, onClose }) {
  if (!node) return null

  const isPlanned = node.status === 'planned'

  return (
    <div className={styles.drawerBackdrop} role="presentation" onClick={onClose}>
      <aside
        className={styles.drawer}
        role="dialog"
        aria-labelledby="framework-node-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className={styles.drawerHead}>
          <div>
            <h2 id="framework-node-title" className={styles.drawerTitle}>
              {node.label}
            </h2>
            <span className={isPlanned ? styles.badgePlanned : styles.badgeExisting}>
              {isPlanned ? '规划中' : '已上线'}
            </span>
          </div>
          <button type="button" className={styles.drawerClose} onClick={onClose} aria-label="关闭">
            ×
          </button>
        </div>
        <p className={styles.drawerSummary}>{node.summary}</p>
        {isPlanned && node.plannedReason ? (
          <p className={styles.drawerReason}>
            <strong>规划说明：</strong>
            {node.plannedReason}
          </p>
        ) : null}
        {node.route ? (
          <p className={styles.drawerMeta}>
            <span className={styles.drawerMetaLabel}>路由</span>
            <code>{node.route}</code>
          </p>
        ) : null}
        <p className={styles.drawerMeta}>
          <span className={styles.drawerMetaLabel}>阶段</span>
          {node.stage}
        </p>
        {node.route && !isPlanned && !node.route.includes(':') ? (
          <Link to={node.route} className={styles.drawerLink} onClick={onClose}>
            打开页面
          </Link>
        ) : null}
      </aside>
    </div>
  )
}
