import { forwardRef } from 'react'
import styles from './Button.module.css'

/**
 * Standard Apple-style Button primitive.
 * Adheres to PROJECT.md § Interface Contracts (2. Standardized UI Components Contract):
 * - variant: 'solid' | 'ghost' | 'accent' | 'danger'
 * - size: 'sm' | 'md' | 'lg'
 * - loading: boolean
 * - icon: ReactNode
 * - disabled: boolean
 */
export const Button = forwardRef(function Button(
  {
    variant = 'solid',
    size = 'md',
    loading = false,
    icon = null,
    iconRight = null,
    disabled = false,
    type = 'button',
    className = '',
    children,
    as: Component = 'button',
    ...rest
  },
  ref
) {
  const isDisabled = disabled || loading

  const classNames = [
    styles.button,
    styles[variant] || styles.solid,
    styles[size] || styles.md,
    loading ? styles.loading : '',
    className,
  ]
    .filter(Boolean)
    .join(' ')

  const spinner = (
    <svg
      className={styles.spinner}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9" strokeOpacity="0.25" />
      <path d="M12 3a9 9 0 0 1 9 9" strokeLinecap="round" />
    </svg>
  )

  return (
    <Component
      ref={ref}
      type={Component === 'button' ? type : undefined}
      className={classNames}
      disabled={Component === 'button' ? isDisabled : undefined}
      aria-disabled={isDisabled || undefined}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading ? (
        spinner
      ) : icon ? (
        <span className={styles.icon}>{icon}</span>
      ) : null}
      {children ? <span className={styles.label}>{children}</span> : null}
      {!loading && iconRight ? (
        <span className={styles.iconRight}>{iconRight}</span>
      ) : null}
    </Component>
  )
})

export default Button
