import { forwardRef } from 'react'
import styles from './Switch.module.css'

/**
 * Standard Apple-grade Switch / Toggle primitive.
 * Adheres to PROJECT.md § Interface Contracts (2. Standardized UI Components Contract):
 * - checked: boolean
 * - onChange: (checked: boolean) => void
 * - size?: 'sm' | 'md'
 * - disabled?: boolean
 */
export const Switch = forwardRef(function Switch(
  {
    checked = false,
    onChange,
    size = 'md',
    disabled = false,
    className = '',
    'aria-label': ariaLabel,
    'aria-labelledby': ariaLabelledby,
    ...rest
  },
  ref
) {
  const handleClick = () => {
    if (!disabled && onChange) {
      onChange(!checked)
    }
  }

  const handleKeyDown = (e) => {
    if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault()
      handleClick()
    }
  }

  const switchClasses = [
    styles.switch,
    styles[size] || styles.md,
    checked ? styles.checked : '',
    disabled ? styles.disabled : '',
    className,
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <button
      ref={ref}
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      aria-labelledby={ariaLabelledby}
      disabled={disabled}
      className={switchClasses}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      {...rest}
    >
      <span className={styles.thumb} aria-hidden="true" />
    </button>
  )
})

export default Switch
