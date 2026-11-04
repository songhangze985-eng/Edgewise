import { useRef, useState, useCallback } from 'react'
import styles from './SnapSlider.module.css'

/**
 * Precision SnapSlider with:
 * - Thumb wheel locked directly onto the tip of the filled progress bar (never detached)
 * - Visible snap detent stops (卡点) along the track
 * - Directional trend detection (滑动趋势判断): a small drag movement (>18% of one segment
 *   or >=10px) toward an adjacent stop immediately snaps to that adjacent stop.
 */
export default function SnapSlider({
  stops = [1, 2, 3, 4, 5],
  value,
  onChange,
  formatStopLabel,
  minLabel,
  maxLabel,
  ariaLabel,
  className = '',
}) {
  const railRef = useRef(null)
  const dragStateRef = useRef({
    active: false,
    anchorX: 0,
    anchorIndex: 0,
    moved: false,
  })
  const [isDragging, setIsDragging] = useState(false)

  // Find current stop index (closest match in `stops`)
  const currentIndex = (() => {
    const exactIdx = stops.indexOf(value)
    if (exactIdx !== -1) return exactIdx
    let bestIdx = 0
    let bestDist = Infinity
    stops.forEach((s, idx) => {
      const d = Math.abs(Number(s) - Number(value))
      if (d < bestDist) {
        bestDist = d
        bestIdx = idx
      }
    })
    return bestIdx
  })()

  const segmentCount = Math.max(1, stops.length - 1)
  const percent = (currentIndex / segmentCount) * 100

  const commitIndex = useCallback(
    (nextIdx) => {
      const clamped = Math.max(0, Math.min(stops.length - 1, nextIdx))
      const nextVal = stops[clamped]
      if (nextVal !== value && onChange) {
        onChange(nextVal)
      }
      return clamped
    },
    [stops, value, onChange],
  )

  const handlePointerDown = (e) => {
    if (!railRef.current) return
    e.currentTarget.setPointerCapture?.(e.pointerId)
    setIsDragging(true)
    dragStateRef.current = {
      active: true,
      anchorX: e.clientX,
      anchorIndex: currentIndex,
      moved: false,
    }
  }

  const handlePointerMove = (e) => {
    const st = dragStateRef.current
    if (!st.active || !railRef.current) return

    const rect = railRef.current.getBoundingClientRect()
    if (rect.width <= 0) return

    const segmentWidth = rect.width / segmentCount
    const dx = e.clientX - st.anchorX
    // Trend threshold: only 22% of one segment width (min 10px) needed to jump to the adjacent stop
    const trendThreshold = Math.max(10, segmentWidth * 0.22)

    if (Math.abs(dx) >= trendThreshold) {
      st.moved = true
      const direction = dx > 0 ? 1 : -1
      // Calculate how many segments the user has traversed with trend bias
      const extraSegments = Math.floor((Math.abs(dx) - trendThreshold) / (segmentWidth * 0.75))
      const stepDelta = direction * (1 + extraSegments)
      const targetIndex = Math.max(0, Math.min(stops.length - 1, st.anchorIndex + stepDelta))

      if (targetIndex !== currentIndex) {
        commitIndex(targetIndex)
        // Re-anchor around the new stop so reversing direction or continuing feels instant
        st.anchorIndex = targetIndex
        st.anchorX = e.clientX
      }
    }
  }

  const handlePointerUp = (e) => {
    const st = dragStateRef.current
    if (!st.active) return
    st.active = false
    setIsDragging(false)

    // If user clicked without dragging, snap toward the clicked position
    if (!st.moved && railRef.current) {
      const rect = railRef.current.getBoundingClientRect()
      if (rect.width > 0) {
        const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
        const rawIndex = ratio * segmentCount
        const diff = rawIndex - currentIndex
        if (Math.abs(diff) > 0.12) {
          // Snap directly to nearest stop (or adjacent stop in click direction)
          const nearest = Math.round(rawIndex)
          const nextIdx = nearest === currentIndex ? currentIndex + (diff > 0 ? 1 : -1) : nearest
          commitIndex(nextIdx)
        }
      }
    }
  }

  const handleKeyDown = (e) => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
      e.preventDefault()
      commitIndex(currentIndex + 1)
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
      e.preventDefault()
      commitIndex(currentIndex - 1)
    }
  }

  return (
    <div className={`${styles['snap-slider']} ${className}`}>
      <div
        ref={railRef}
        className={styles['track-Interactive']}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onKeyDown={handleKeyDown}
        role="slider"
        tabIndex={0}
        aria-label={ariaLabel}
        aria-valuemin={Number(stops[0])}
        aria-valuemax={Number(stops[stops.length - 1])}
        aria-valuenow={Number(stops[currentIndex])}
      >
        {/* Base Rail */}
        <div className={styles['track-rail']}>
          {/* Active Filled Progress Bar */}
          <div
            className={styles['track-fill']}
            style={{ width: `${percent}%` }}
          />

          {/* Snap Detent Nodes (卡点) */}
          {stops.map((stopVal, idx) => {
            const stopPct = (idx / segmentCount) * 100
            const isPassed = idx <= currentIndex
            const isActive = idx === currentIndex
            return (
              <button
                key={String(stopVal)}
                type="button"
                tabIndex={-1}
                aria-label={`跳至卡点 ${stopVal}`}
                className={`${styles['detent-node']} ${isPassed ? styles['detent-passed'] : ''} ${
                  isActive ? styles['detent-active'] : ''
                }`}
                style={{ left: `${stopPct}%` }}
                onPointerDown={(ev) => {
                  ev.stopPropagation()
                  commitIndex(idx)
                }}
              />
            )
          })}

          {/* Circular Thumb Wheel Mounted Directly at the Tip of the Progress Bar */}
          <div
            className={`${styles['thumb-wheel']} ${isDragging ? styles['thumb-dragging'] : ''}`}
            style={{ left: `${percent}%` }}
          >
            <span className={styles['thumb-core']} />
          </div>
        </div>

        {/* Hidden synchronized native range input for form/test compatibility */}
        <input
          type="range"
          className={styles['sr-range']}
          min={stops[0]}
          max={stops[stops.length - 1]}
          step={stops.length > 1 ? Number((stops[1] - stops[0]).toFixed(2)) : 1}
          value={stops[currentIndex]}
          onChange={(e) => {
            const v = Number(e.target.value)
            let best = 0
            let bestDist = Infinity
            stops.forEach((s, i) => {
              const d = Math.abs(s - v)
              if (d < bestDist) {
                bestDist = d
                best = i
              }
            })
            commitIndex(best)
          }}
          tabIndex={-1}
          aria-hidden="true"
        />
      </div>

      {/* Clickable Detent Tick Labels */}
      <div className={styles['detent-labels-row']}>
        {stops.map((stopVal, idx) => {
          const active = idx === currentIndex
          const text = formatStopLabel
            ? formatStopLabel(stopVal, idx)
            : idx === 0 && minLabel
              ? `${stopVal} ${minLabel}`
              : idx === stops.length - 1 && maxLabel
                ? `${stopVal} ${maxLabel}`
                : String(stopVal)
          return (
            <button
              key={`lbl-${stopVal}`}
              type="button"
              className={`${styles['detent-label-btn']} ${active ? styles['detent-label-active'] : ''}`}
              onClick={() => commitIndex(idx)}
            >
              {text}
            </button>
          )
        })}
      </div>
    </div>
  )
}
