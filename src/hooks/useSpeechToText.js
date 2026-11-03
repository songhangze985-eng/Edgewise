import { useCallback, useEffect, useRef, useState } from 'react'
import { isWebSpeechAvailable } from '../utils/device'

function getSpeechRecognitionCtor() {
  if (typeof window === 'undefined') return null
  return window.SpeechRecognition || window.webkitSpeechRecognition || null
}

/**
 * Pluggable STT: Web Speech API in-browser; use api/stt.transcribeAudio for recorded blobs later.
 */
export default function useSpeechToText({ lang = 'zh-CN', onTranscript, onFinalChunk, onError } = {}) {
  const [supported] = useState(() => isWebSpeechAvailable())
  const [listening, setListening] = useState(false)
  const recognitionRef = useRef(null)
  const finalRef = useRef('')

  const stop = useCallback(() => {
    recognitionRef.current?.stop()
    setListening(false)
  }, [])

  const start = useCallback(() => {
    const Ctor = getSpeechRecognitionCtor()
    if (!Ctor) return false

    finalRef.current = ''
    const recognition = new Ctor()
    recognition.lang = lang
    recognition.continuous = true
    recognition.interimResults = true

    recognition.onresult = (event) => {
      let interim = ''
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const piece = event.results[i][0]?.transcript ?? ''
        if (event.results[i].isFinal) {
          finalRef.current += piece
          if (piece.trim()) {
            onFinalChunk?.(piece)
          }
        } else {
          interim += piece
        }
      }
      onTranscript?.(finalRef.current + interim)
    }

    recognition.onerror = () => {
      onError?.()
      setListening(false)
    }

    recognition.onend = () => {
      setListening(false)
    }

    recognitionRef.current = recognition
    try {
      recognition.start()
      setListening(true)
      return true
    } catch {
      setListening(false)
      return false
    }
  }, [lang, onError, onFinalChunk, onTranscript])

  const toggle = useCallback(() => {
    if (listening) {
      stop()
      return true
    }
    return start()
  }, [listening, start, stop])

  useEffect(() => () => recognitionRef.current?.abort(), [])

  return { supported, listening, start, stop, toggle }
}
