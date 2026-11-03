import styles from './PageBar.module.css'

export default function PageBar({ title, context, subtitle, actions, children }) {
  const detail = context || subtitle
  const rightSlot = actions || children

  return (
    <header className={styles.bar}>
      <div className={styles.left}>
        <h1 className={styles.title}>{title}</h1>
        {detail ? (
          <>
            <span className={styles.slash} aria-hidden="true">
              /
            </span>
            <span className={styles.context}>{detail}</span>
          </>
        ) : null}
      </div>
      {rightSlot ? <div className={styles.actions}>{rightSlot}</div> : null}
    </header>
  )
}
