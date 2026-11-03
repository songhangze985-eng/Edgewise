import { lazy, Suspense, useEffect, useState } from 'react'

const ThreeBackground = lazy(() => import('./ThreeBackground'))

/** Defer Three.js until after first paint / idle. */
export default function LazyThreeBackground(props) {
  const [ready, setReady] = useState(false)

  useEffect(() => {
    if (props.mode === 'off') {
      setReady(false)
      return
    }
    let cancelled = false
    const start = () => {
      if (!cancelled) setReady(true)
    }
    if (typeof window.requestIdleCallback === 'function') {
      const id = window.requestIdleCallback(start, { timeout: 1200 })
      return () => {
        cancelled = true
        window.cancelIdleCallback(id)
      }
    }
    const t = window.setTimeout(start, 300)
    return () => {
      cancelled = true
      window.clearTimeout(t)
    }
  }, [props.mode])

  if (props.mode === 'off' || !ready) return null

  return (
    <Suspense fallback={null}>
      <ThreeBackground {...props} />
    </Suspense>
  )
}
