import styles from './Badge.module.css'

/**
 * Standard Apple-grade Badge primitive.
 * Adheres to PROJECT.md § Interface Contracts (2. Standardized UI Components Contract):
 * - variant: 'neutral' | 'accent' | 'success' | 'warning' | 'danger'
 * - size?: 'sm' | 'md'
 * - dot?: boolean
 */
export function Badge({
  variant = 'neutral',
  size = 'md',
  dot = false,
  className = '',
  children,
  ...rest
}) {
  const badgeClasses = [
    styles.badge,
    styles[variant] || styles.neutral,
    styles[size] || styles.md,
    className,
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <span className={badgeClasses} {...rest}>
      {dot ? <span className={styles.dot} aria-hidden="true" /> : null}
      <span className={styles.content}>{children}</span>
    </span>
  )
}

export default Badge
