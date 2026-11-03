import styles from './PageBar.module.css'

export default function PageBar({ title, context, actions }) {
  return (
    <header className={styles.bar}>
      <div className={styles.left}>
        <h1 className={styles.title}>{title}</h1>
        {context ? (
          <>
            <span className={styles.slash} aria-hidden="true">
              /
            </span>
            <span className={styles.context}>{context}</span>
          </>
        ) : null}
      </div>
      {actions ? <div className={styles.actions}>{actions}</div> : null}
    </header>
  )
}
