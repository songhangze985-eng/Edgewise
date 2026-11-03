import { forwardRef } from 'react'
import styles from './Card.module.css'

/**
 * Standard Apple-grade Card primitive.
 * Adheres to PROJECT.md § Interface Contracts (2. Standardized UI Components Contract):
 * - variant: 'surface' | 'glass' | 'sunken'
 * - hoverable: boolean
 * - padding: 'none' | 'sm' | 'md' | 'lg'
 */
export const Card = forwardRef(function Card(
  {
    variant = 'surface',
    hoverable = false,
    padding = 'md',
    as: Component = 'div',
    className = '',
    children,
    ...rest
  },
  ref
) {
  const classNames = [
    styles.card,
    styles[variant] || styles.surface,
    styles[`pad-${padding}`] || styles['pad-md'],
    hoverable ? styles.hoverable : '',
    className,
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <Component ref={ref} className={classNames} {...rest}>
      {children}
    </Component>
  )
})

export default Card
