export function isBrowserSttSupported() {
  if (typeof window === 'undefined') return false
  return Boolean(window.SpeechRecognition || window.webkitSpeechRecognition)
}

/**
 * Create a managed browser SpeechRecognition session for 1v1 or LGD rooms.
 */
export function createBrowserSpeechRecognizer({
  lang = 'zh-CN',
  continuous = true,
  interimResults = true,
  onResult,
  onError,
  onEnd,
} = {}) {
  if (!isBrowserSttSupported()) {
    return null
  }
  const Ctor = window.SpeechRecognition || window.webkitSpeechRecognition
  const recognition = new Ctor()
  recognition.lang = lang
  recognition.continuous = continuous
  recognition.interimResults = interimResults

  recognition.onresult = (event) => {
    let finalChunk = ''
    let interimChunk = ''
    for (let i = event.resultIndex; i < event.results.length; i += 1) {
      const item = event.results[i]
      const text = item?.[0]?.transcript || ''
      if (item.isFinal) {
        finalChunk += text
      } else {
        interimChunk += text
      }
    }
    onResult?.({ finalChunk, interimChunk, rawEvent: event })
  }

  recognition.onerror = (event) => {
    onError?.(event)
  }

  recognition.onend = () => {
    onEnd?.()
  }

  return {
    start() {
      try {
        recognition.start()
        return true
      } catch {
        return false
      }
    },
    stop() {
      try {
        recognition.stop()
      } catch {
        /* ignore */
      }
    },
    abort() {
      try {
        recognition.abort()
      } catch {
        /* ignore */
      }
    },
  }
}
