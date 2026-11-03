import { useRef, useEffect, useState, useId } from 'react'
import styles from './SegmentedControl.module.css'

/**
 * Standard Apple SegmentedControl primitive.
 * Adheres to PROJECT.md § Interface Contracts (2. Standardized UI Components Contract):
 * - options: Array<{ value: string, label: string | ReactNode, disabled?: boolean, icon?: ReactNode }>
 * - value: string
 * - onChange: (val: string) => void
 * - size?: 'sm' | 'md'
 */
export function SegmentedControl({
  options = [],
  value,
  onChange,
  size = 'md',
  className = '',
  disabled = false,
  ...rest
}) {
  const containerRef = useRef(null)
  const thumbRef = useRef(null)
  const [thumbStyle, setThumbStyle] = useState({ opacity: 0, width: 0, transform: 'translateX(0px)' })
  const instanceId = useId()

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const activeOption = container.querySelector(`[data-value="${CSS.escape(String(value))}"]`)
    if (!activeOption) {
      setThumbStyle((prev) => ({ ...prev, opacity: 0 }))
      return
    }

    const containerRect = container.getBoundingClientRect()
    const optionRect = activeOption.getBoundingClientRect()

    const offsetLeft = optionRect.left - containerRect.left
    const width = optionRect.width

    setThumbStyle({
      opacity: 1,
      width: `${width}px`,
      transform: `translateX(${offsetLeft}px)`,
    })
  }, [value, options, size])

  const handleKeyDown = (e) => {
    if (disabled || !options.length) return

    const enabledOptions = options.filter((o) => !o.disabled)
    const currentIndex = enabledOptions.findIndex((o) => o.value === value)

    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      e.preventDefault()
      const nextIndex = (currentIndex + 1) % enabledOptions.length
      onChange(enabledOptions[nextIndex].value)
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      e.preventDefault()
      const prevIndex = (currentIndex - 1 + enabledOptions.length) % enabledOptions.length
      onChange(enabledOptions[prevIndex].value)
    } else if (e.key === 'Home') {
      e.preventDefault()
      if (enabledOptions.length > 0) onChange(enabledOptions[0].value)
    } else if (e.key === 'End') {
      e.preventDefault()
      if (enabledOptions.length > 0) onChange(enabledOptions[enabledOptions.length - 1].value)
    }
  }

  const containerClasses = [
    styles.segmented,
    styles[size] || styles.md,
    disabled ? styles.disabled : '',
    className,
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <div
      ref={containerRef}
      className={containerClasses}
      role="radiogroup"
      onKeyDown={handleKeyDown}
      {...rest}
    >
      <span
        ref={thumbRef}
        className={styles.thumb}
        style={{
          opacity: thumbStyle.opacity,
          width: thumbStyle.width,
          transform: thumbStyle.transform,
        }}
        aria-hidden="true"
      />
      {options.map((opt) => {
        const isSelected = opt.value === value
        const isOptDisabled = disabled || opt.disabled

        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            data-value={opt.value}
            id={`${instanceId}-opt-${opt.value}`}
            aria-checked={isSelected}
            tabIndex={isSelected ? 0 : -1}
            disabled={isOptDisabled}
            className={`${styles.option} ${isSelected ? styles.selected : ''}`}
            onClick={() => {
              if (!isOptDisabled && onChange) {
                onChange(opt.value)
              }
            }}
          >
            {opt.icon ? <span className={styles.optIcon}>{opt.icon}</span> : null}
            <span className={styles.optLabel}>{opt.label}</span>
          </button>
        )
      })}
    </div>
  )
}

export default SegmentedControl
