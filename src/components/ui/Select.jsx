import { forwardRef, useId } from 'react'
import styles from './Select.module.css'

/**
 * Standard Apple-grade Select primitive.
 * - size: 'sm' | 'md'
 * - error: string
 * - options: Array<{ value: string, label: string, disabled?: boolean }>
 */
export const Select = forwardRef(function Select(
  {
    size = 'md',
    error = null,
    options = [],
    className = '',
    selectClassName = '',
    id: externalId,
    disabled = false,
    children,
    ...rest
  },
  ref
) {
  const generatedId = useId()
  const id = externalId || generatedId
  const errorId = error ? `${id}-error` : undefined

  const wrapperClasses = [
    styles.wrapper,
    styles[size] || styles.md,
    error ? styles.hasError : '',
    disabled ? styles.disabled : '',
    className,
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <div className={styles.container}>
      <div className={wrapperClasses}>
        <select
          ref={ref}
          id={id}
          data-custom-select="true"
          disabled={disabled}
          aria-invalid={Boolean(error) || undefined}
          aria-describedby={errorId}
          className={`${styles.select} ${selectClassName}`.trim()}
          {...rest}
        >
          {children ||
            options.map((opt) => (
              <option key={opt.value} value={opt.value} disabled={opt.disabled}>
                {opt.label}
              </option>
            ))}
        </select>
        <span className={styles.chevron} aria-hidden="true">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </span>
      </div>
      {error ? (
        <span id={errorId} className={styles.errorMessage} role="alert">
          {error}
        </span>
      ) : null}
    </div>
  )
})

export default Select
