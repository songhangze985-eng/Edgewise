import { forwardRef, useId } from 'react'
import styles from './Input.module.css'

/**
 * Standard Apple-grade Input primitive.
 * Adheres to PROJECT.md § Interface Contracts (2. Standardized UI Components Contract):
 * - size: 'sm' | 'md'
 * - error: string
 * - prefix: ReactNode
 * - suffix: ReactNode
 */
export const Input = forwardRef(function Input(
  {
    size = 'md',
    error = null,
    prefix = null,
    suffix = null,
    className = '',
    inputClassName = '',
    id: externalId,
    disabled = false,
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
        {prefix ? <span className={styles.prefix}>{prefix}</span> : null}
        <input
          ref={ref}
          id={id}
          disabled={disabled}
          aria-invalid={Boolean(error) || undefined}
          aria-describedby={errorId}
          className={`${styles.input} ${inputClassName}`.trim()}
          {...rest}
        />
        {suffix ? <span className={styles.suffix}>{suffix}</span> : null}
      </div>
      {error ? (
        <span id={errorId} className={styles.errorMessage} role="alert">
          {error}
        </span>
      ) : null}
    </div>
  )
})

export default Input
