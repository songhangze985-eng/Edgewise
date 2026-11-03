import { useRef, useEffect, useState } from 'react'
import styles from './Tabs.module.css'

/**
 * Standard Apple & margin-ui-kit Tabs primitive.
 * Adheres to PROJECT.md & Dispatch:
 * - variant?: 'pill' | 'underline'
 * - items: Array<{ id: string, label: ReactNode, icon?: ReactNode, disabled?: boolean, count?: number }>
 * - value: string
 * - onChange: (id: string) => void
 * - size?: 'sm' | 'md' | 'lg'
 */
export function Tabs({
  variant = 'pill',
  items = [],
  value,
  onChange,
  size = 'md',
  className = '',
  ...rest
}) {
  const containerRef = useRef(null)
  const thumbRef = useRef(null)
  const [thumbStyle, setThumbStyle] = useState({ opacity: 0, width: 0, transform: 'translateX(0px)' })

  useEffect(() => {
    if (variant !== 'pill') return

    const container = containerRef.current
    if (!container) return

    const activeTab = container.querySelector(`[data-id="${CSS.escape(String(value))}"]`)
    if (!activeTab) {
      setThumbStyle((prev) => ({ ...prev, opacity: 0 }))
      return
    }

    const containerRect = container.getBoundingClientRect()
    const tabRect = activeTab.getBoundingClientRect()

    const offsetLeft = tabRect.left - containerRect.left
    const width = tabRect.width

    setThumbStyle({
      opacity: 1,
      width: `${width}px`,
      transform: `translateX(${offsetLeft}px)`,
    })
  }, [value, items, variant, size])

  const handleKeyDown = (e) => {
    const enabledItems = items.filter((i) => !i.disabled)
    const currentIndex = enabledItems.findIndex((i) => i.id === value)

    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      e.preventDefault()
      const nextIndex = (currentIndex + 1) % enabledItems.length
      onChange(enabledItems[nextIndex].id)
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      e.preventDefault()
      const prevIndex = (currentIndex - 1 + enabledItems.length) % enabledItems.length
      onChange(enabledItems[prevIndex].id)
    } else if (e.key === 'Home') {
      e.preventDefault()
      if (enabledItems.length > 0) onChange(enabledItems[0].id)
    } else if (e.key === 'End') {
      e.preventDefault()
      if (enabledItems.length > 0) onChange(enabledItems[enabledItems.length - 1].id)
    }
  }

  const containerClasses = [
    styles.tablist,
    styles[variant] || styles.pill,
    styles[size] || styles.md,
    className,
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <div
      ref={containerRef}
      className={containerClasses}
      role="tablist"
      onKeyDown={handleKeyDown}
      {...rest}
    >
      {variant === 'pill' ? (
        <span
          ref={thumbRef}
          className={styles.pillThumb}
          style={{
            opacity: thumbStyle.opacity,
            width: thumbStyle.width,
            transform: thumbStyle.transform,
          }}
          aria-hidden="true"
        />
      ) : null}
      {items.map((item) => {
        const isSelected = item.id === value
        return (
          <button
            key={item.id}
            type="button"
            role="tab"
            data-id={item.id}
            aria-selected={isSelected}
            tabIndex={isSelected ? 0 : -1}
            disabled={item.disabled}
            className={`${styles.tab} ${isSelected ? styles.selected : ''}`}
            onClick={() => {
              if (!item.disabled && onChange) {
                onChange(item.id)
              }
            }}
          >
            {item.icon ? <span className={styles.icon}>{item.icon}</span> : null}
            <span className={styles.label}>{item.label}</span>
            {item.count !== undefined ? (
              <span className={styles.count}>{item.count}</span>
            ) : null}
          </button>
        )
      })}
    </div>
  )
}

export default Tabs
