import styles from './RevisionCard.module.css'

/**
 * Teaching card preview (no user id / school / company).
 */
export default function RevisionCard({
  cardRef,
  questionTitle,
  gapLabel,
  methodText,
  probeText,
  excerpt,
  includeExcerpt,
}) {
  return (
    <div className={styles.card} ref={cardRef}>
      <div className={styles.brand}>谈锋 · 表达修订卡</div>
      {questionTitle ? <div className={styles.title}>{questionTitle}</div> : null}
      {gapLabel ? <span className={styles.gapLabel}>{gapLabel}</span> : null}
      {methodText ? <p className={styles.method}>{methodText}</p> : null}
      {includeExcerpt && excerpt ? (
        <blockquote className={styles.excerpt}>「{excerpt}」</blockquote>
      ) : null}
      <div className={styles.probeBlock}>
        <div className={styles.probeLabel}>同类追问 · 试答</div>
        <p className={styles.probeText}>{probeText || '—'}</p>
      </div>
      <div className={styles.footer}>规则估算 · 仅供练习参考</div>
    </div>
  )
}
