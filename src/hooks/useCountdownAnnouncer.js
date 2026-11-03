import { useEffect, useRef, useState } from 'react'

/**
 * Screen-reader countdown: polite updates every 30s, plus 10s / 5s / 0 in the final 10s (not every second).
 */
export function useCountdownAnnouncer(seconds, { enabled = true, label = '剩余时间' } = {}) {
  const [announcement, setAnnouncement] = useState('')
  const lastAnnouncedRef = useRef(null)

  useEffect(() => {
    if (!enabled || seconds == null || seconds < 0) {
      lastAnnouncedRef.current = null
      return
    }

    const shouldAnnounce = (sec) => {
      if (sec === 0) return true
      if (sec <= 10 && (sec === 10 || sec === 5)) return true
      if (sec > 10 && sec % 30 === 0) return true
      return false
    }

    if (!shouldAnnounce(seconds)) return

    if (lastAnnouncedRef.current === seconds) return
    lastAnnouncedRef.current = seconds

    const m = Math.floor(seconds / 60)
    const s = seconds % 60
    const part =
      seconds === 0
        ? '时间到'
        : m > 0
          ? `${m} 分 ${s} 秒`
          : `${s} 秒`
    setAnnouncement(`${label} ${part}`)
  }, [seconds, enabled, label])

  useEffect(() => {
    if (!enabled) lastAnnouncedRef.current = null
  }, [enabled])

  return announcement
}
