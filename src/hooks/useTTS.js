import { useCallback, useEffect, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'

import { splitSpeechSentences } from '../utils/speechSentences'
import { isEnglishInterviewLang } from '../utils/interviewLang'

const PREFERRED_VOICE_HINTS = ['xiaoxiao', 'yunxi', 'tingting', 'meijia']
const PREFERRED_EN_VOICE_HINTS = ['samantha', 'google us english', 'aaron', 'zira', 'karen', 'daniel']

function synthSupported() {
  return typeof window !== 'undefined' && 'speechSynthesis' in window
}

function isZhVoice(voice) {
  const lang = (voice.lang || '').toLowerCase()
  return lang.startsWith('zh')
}

function isEnVoice(voice) {
  const lang = (voice.lang || '').toLowerCase()
  return lang.startsWith('en')
}

export function listZhVoices() {
  if (!synthSupported()) return []
  return window.speechSynthesis.getVoices().filter(isZhVoice)
}

export function listEnVoices() {
  if (!synthSupported()) return []
  return window.speechSynthesis.getVoices().filter(isEnVoice)
}

export function pickPreferredZhVoice(voices = listZhVoices()) {
  if (!voices.length) return null
  const lower = (v) => `${v.name} ${v.voiceURI}`.toLowerCase()
  for (const hint of PREFERRED_VOICE_HINTS) {
    const hit = voices.find((v) => lower(v).includes(hint))
    if (hit) return hit
  }
  return voices[0]
}

export function pickPreferredEnVoice(voices = listEnVoices()) {
  if (!voices.length) return null
  const lower = (v) => `${v.name} ${v.voiceURI}`.toLowerCase()
  for (const hint of PREFERRED_EN_VOICE_HINTS) {
    const hit = voices.find((v) => lower(v).includes(hint))
    if (hit) return hit
  }
  const us = voices.find((v) => (v.lang || '').toLowerCase().includes('en-us'))
  return us || voices[0]
}

function resolveVoice(voiceURI, utterLang) {
  const english = isEnglishInterviewLang(utterLang)
  const voices = english ? listEnVoices() : listZhVoices()
  if (!voices.length) {
    const fallback = window.speechSynthesis.getVoices()
    if (!fallback.length) return null
    if (voiceURI) {
      const explicit = fallback.find((v) => v.voiceURI === voiceURI)
      if (explicit) return explicit
    }
    return english ? pickPreferredEnVoice(fallback.filter(isEnVoice)) : pickPreferredZhVoice(fallback.filter(isZhVoice))
  }
  if (voiceURI) {
    const explicit = voices.find((v) => v.voiceURI === voiceURI)
    if (explicit) return explicit
  }
  return english ? pickPreferredEnVoice(voices) : pickPreferredZhVoice(voices)
}

const splitForSpeech = splitSpeechSentences

export default function useTTS() {
  const location = useLocation()
  const [supported] = useState(() => synthSupported())
  const [isSpeaking, setIsSpeaking] = useState(false)

  const queueRef = useRef([])
  const processingRef = useRef(false)
  const mountedRef = useRef(true)
  const callbacksRef = useRef({ onstart: null, onend: null })

  const runNext = useCallback(() => {
    if (!mountedRef.current || processingRef.current) return
    const synth = window.speechSynthesis
    if (!queueRef.current.length) {
      setIsSpeaking(false)
      callbacksRef.current.onend?.()
      callbacksRef.current = { onstart: null, onend: null }
      return
    }

    processingRef.current = true
    const item = queueRef.current.shift()
    const chunkIndex = item.chunkIndex ?? 0
    const chunkTotal = item.chunkTotal ?? 1
    synth.cancel()

    const utter = new SpeechSynthesisUtterance(item.text)
    utter.lang = item.lang || 'zh-CN'
    if (item.voice) utter.voice = item.voice
    if (item.pitch != null) utter.pitch = item.pitch
    if (item.rate != null) utter.rate = item.rate

    let started = false
    utter.onstart = () => {
      item.onChunkStart?.(chunkIndex, item.text, chunkTotal)
      if (!started) {
        started = true
        setIsSpeaking(true)
        item.onstart?.()
        callbacksRef.current.onstart?.()
      }
    }
    utter.onend = () => {
      processingRef.current = false
      if (queueRef.current.length) {
        runNext()
      } else {
        setIsSpeaking(false)
        item.onend?.()
        callbacksRef.current.onend?.()
        callbacksRef.current = { onstart: null, onend: null }
      }
    }
    utter.onerror = () => {
      processingRef.current = false
      if (queueRef.current.length) {
        runNext()
      } else {
        setIsSpeaking(false)
        item.onend?.()
        callbacksRef.current.onend?.()
        callbacksRef.current = { onstart: null, onend: null }
      }
    }

    synth.speak(utter)
  }, [])

  const stop = useCallback(() => {
    if (!supported) return
    queueRef.current = []
    processingRef.current = false
    window.speechSynthesis.cancel()
    setIsSpeaking(false)
    callbacksRef.current = { onstart: null, onend: null }
  }, [supported])

  const speak = useCallback(
    (text, opts = {}) => {
      if (!supported) return false
      const trimmed = String(text || '').trim()
      if (!trimmed) return false

      const { pitch, rate, voiceURI, lang, onstart, onend, onChunkStart, enqueue = false } = opts
      const utterLang = lang || 'zh-CN'
      const voice = resolveVoice(voiceURI, utterLang)

      if (!enqueue) {
        stop()
      }

      callbacksRef.current = { onstart: onstart || null, onend: onend || null }

      const chunks = splitForSpeech(trimmed)
      const batchStart = !processingRef.current && queueRef.current.length === 0
      chunks.forEach((chunk, index) => {
        queueRef.current.push({
          text: chunk,
          voice,
          lang: utterLang,
          pitch,
          rate,
          chunkIndex: index,
          chunkTotal: chunks.length,
          onChunkStart: onChunkStart || null,
          onstart: batchStart && index === 0 ? onstart : null,
          onend: index === chunks.length - 1 ? onend : null,
        })
      })

      if (!processingRef.current) {
        runNext()
      }
      return true
    },
    [runNext, stop, supported],
  )

  useEffect(() => {
    mountedRef.current = true
    if (!supported) return undefined

    const refresh = () => {}
    window.speechSynthesis.addEventListener('voiceschanged', refresh)
    refresh()

    const onHidden = () => {
      if (document.visibilityState === 'hidden') stop()
    }
    document.addEventListener('visibilitychange', onHidden)

    return () => {
      mountedRef.current = false
      window.speechSynthesis.removeEventListener('voiceschanged', refresh)
      document.removeEventListener('visibilitychange', onHidden)
      stop()
    }
  }, [location.pathname, stop, supported])

  return {
    speak,
    stop,
    isSpeaking,
    supported,
    listZhVoices,
    pickPreferredZhVoice,
    listEnVoices,
    pickPreferredEnVoice,
  }
}
