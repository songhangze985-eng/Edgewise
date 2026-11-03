import { useCallback, useRef } from 'react'
import { buildSpeechPayload } from '../features/interview/speechMetrics'

function emptyCapture() {
  return {
    segments: [],
    windowStartPerf: null,
    usedVoice: false,
    lastFinalEndMs: 0,
  }
}

/**
 * Tracks STT segment timestamps for delivery metrics. Ignores audio while `ttsBlockedRef` is true.
 */
export default function useAnswerSpeechCapture() {
  const captureRef = useRef(emptyCapture())

  const resetCapture = useCallback(() => {
    captureRef.current = emptyCapture()
  }, [])

  const beginAnswerWindow = useCallback(() => {
    const cap = captureRef.current
    cap.windowStartPerf = performance.now()
    cap.segments = []
    cap.lastFinalEndMs = 0
    cap.usedVoice = false
  }, [])

  const markVoiceUsed = useCallback(() => {
    captureRef.current.usedVoice = true
  }, [])

  const onFinalSpeechChunk = useCallback((text, ttsBlockedRef) => {
    const piece = (text || '').trim()
    if (!piece || ttsBlockedRef?.current) return
    const cap = captureRef.current
    if (cap.windowStartPerf == null) {
      cap.windowStartPerf = performance.now()
    }
    cap.usedVoice = true
    const now = performance.now()
    const relStart = cap.lastFinalEndMs || 0
    const relEnd = Math.round(now - cap.windowStartPerf)
    cap.segments.push({
      text: piece,
      start_ms: relStart > 0 ? relStart : Math.max(0, relEnd - 500),
      end_ms: relEnd,
    })
    cap.lastFinalEndMs = relEnd
  }, [])

  const getSpeechPayload = useCallback(() => {
    const cap = captureRef.current
    if (!cap.usedVoice || !cap.segments.length) {
      return { speech: { segments: [], first_word_ms: null, total_ms: null }, usedVoice: false }
    }
    const speech = buildSpeechPayload(cap.segments, cap.windowStartPerf)
    return { speech, usedVoice: true }
  }, [])

  const wasTextOnlyAnswer = useCallback(() => !captureRef.current.usedVoice, [])

  return {
    resetCapture,
    beginAnswerWindow,
    markVoiceUsed,
    onFinalSpeechChunk,
    getSpeechPayload,
    wasTextOnlyAnswer,
  }
}
