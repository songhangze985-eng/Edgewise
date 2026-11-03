import { useEffect, useRef, useId } from 'react'
import { createPortal } from 'react-dom'
import styles from './Modal.module.css'

/**
 * Standard Apple-grade Modal / Dialog primitive with backdrop blur.
 * Adheres to PROJECT.md & Dispatch:
 * - open | isOpen: boolean
 * - onClose: () => void
 * - title?: ReactNode
 * - children: ReactNode
 * - size?: 'sm' | 'md' | 'lg' | 'xl'
 * - showCloseButton?: boolean
 * - closeOnOverlayClick?: boolean
 * - closeOnEscape?: boolean
 */
export function Modal({
  open,
  isOpen,
  onClose,
  title = null,
  children,
  size = 'md',
  showCloseButton = true,
  closeOnOverlayClick = true,
  closeOnEscape = true,
  className = '',
  ...rest
}) {
  const isVisible = open ?? isOpen ?? false
  const titleId = useId()
  const previousFocusRef = useRef(null)
  const dialogRef = useRef(null)

  // Escape key and focus management
  useEffect(() => {
    if (!isVisible) return

    previousFocusRef.current = document.activeElement
    const originalOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    const handleKeyDown = (e) => {
      if (closeOnEscape && e.key === 'Escape') {
        e.preventDefault()
        if (onClose) onClose()
      }
    }

    window.addEventListener('keydown', handleKeyDown)

    if (dialogRef.current) {
      dialogRef.current.focus()
    }

    return () => {
      document.body.style.overflow = originalOverflow
      window.removeEventListener('keydown', handleKeyDown)
      if (previousFocusRef.current?.focus) {
        previousFocusRef.current.focus()
      }
    }
  }, [isVisible, closeOnEscape, onClose])

  if (!isVisible) return null

  const handleOverlayClick = (e) => {
    if (e.target === e.currentTarget && closeOnOverlayClick && onClose) {
      onClose()
    }
  }

  const modalContent = (
    <div
      className={styles.overlay}
      onClick={handleOverlayClick}
      data-open="true"
      aria-hidden={!isVisible}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        tabIndex={-1}
        className={`${styles.dialog} ${styles[size] || styles.md} ${className}`.trim()}
        {...rest}
      >
        {title || showCloseButton ? (
          <div className={styles.header}>
            {title ? (
              <h2 id={titleId} className={styles.title}>
                {title}
              </h2>
            ) : <div />}
            {showCloseButton && onClose ? (
              <button
                type="button"
                className={styles.closeBtn}
                onClick={onClose}
                aria-label="关闭"
              >
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            ) : null}
          </div>
        ) : null}
        <div className={styles.body}>{children}</div>
      </div>
    </div>
  )

  return typeof document !== 'undefined'
    ? createPortal(modalContent, document.body)
    : null
}

export default Modal
