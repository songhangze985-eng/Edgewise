import { useCallback, useEffect, useRef, useState } from 'react'
import { createPresenceAnalyzer } from '../features/interview/presenceLandmarker.js'
import {
  PRESENCE_SAMPLE_HZ,
  aggregatePresenceSamples,
} from '../features/interview/presenceMetrics.js'
import { trackResearchEvent } from '../research/track'

const SAMPLE_MS = Math.round(1000 / PRESENCE_SAMPLE_HZ)
const PERF_BUDGET_MS = 280
const MAX_SLOW_STREAK = 4

/**
 * Local camera presence sampling (~2Hz). No video upload — model download only when using MediaPipe.
 *
 * @param {{ videoRef: import('react').RefObject<HTMLVideoElement>, enabled: boolean, active: boolean, sessionId?: string }} opts
 */
export default function usePresence({ videoRef, enabled, active, sessionId } = {}) {
  const samplesRef = useRef([])
  const analyzerRef = useRef(null)
  const timerRef = useRef(null)
  const slowStreakRef = useRef(0)
  const failedRef = useRef(false)
  const engineRef = useRef('off')

  const [status, setStatus] = useState('off')
  const [liveHint, setLiveHint] = useState('')

  const resetCapture = useCallback(() => {
    samplesRef.current = []
    slowStreakRef.current = 0
    failedRef.current = false
    setLiveHint('')
  }, [])

  const getPresencePayload = useCallback(() => {
    if (!enabled || failedRef.current) return null
    const engine = engineRef.current === 'pending' ? 'heuristic_simplified' : engineRef.current
    return aggregatePresenceSamples(samplesRef.current, {
      engine,
      skipped: failedRef.current,
    })
  }, [enabled])

  useEffect(() => {
    if (!enabled) {
      setStatus('off')
      engineRef.current = 'off'
      if (timerRef.current) {
        clearInterval(timerRef.current)
        timerRef.current = null
      }
      return undefined
    }

    if (!analyzerRef.current) {
      analyzerRef.current = createPresenceAnalyzer({
        onEngineReady: (engine) => {
          engineRef.current = engine
          setStatus(engine === 'mediapipe' ? 'ready' : 'simplified')
        },
      })
    }

    setStatus('loading')

    const tick = async () => {
      if (!active || failedRef.current) return
      const video = videoRef?.current
      if (!video || video.readyState < 2) return
      const started = performance.now()
      try {
        const sample = await analyzerRef.current.analyze(video, performance.now())
        const elapsed = performance.now() - started
        if (elapsed > PERF_BUDGET_MS) {
          slowStreakRef.current += 1
          if (slowStreakRef.current >= MAX_SLOW_STREAK) {
            failedRef.current = true
            setStatus('skipped')
            setLiveHint('')
            trackResearchEvent('presence.failed', {
              session_id: sessionId,
              reason: 'low_performance',
            })
            return
          }
        } else {
          slowStreakRef.current = 0
        }
        if (sample) {
          samplesRef.current.push(sample)
          if (!sample.face_in_frame) {
            setLiveHint('未检测到面部，请回到画面中央')
          } else if (!sample.centered) {
            setLiveHint('尽量将面部保持在画面中央')
          } else if (sample.brightness_ok === false) {
            setLiveHint('光线偏暗或过亮，可调整环境光')
          } else {
            setLiveHint('')
          }
        }
      } catch {
        failedRef.current = true
        setStatus('skipped')
        setLiveHint('')
        trackResearchEvent('presence.failed', {
          session_id: sessionId,
          reason: 'analyze_error',
        })
      }
    }

    timerRef.current = setInterval(() => {
      void tick()
    }, SAMPLE_MS)

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current)
        timerRef.current = null
      }
    }
  }, [active, enabled, sessionId, videoRef])

  return {
    status,
    liveHint,
    resetCapture,
    getPresencePayload,
    engine: engineRef.current,
  }
}
