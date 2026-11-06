import api from './client'

/**
 * Unified Speech-to-Text (STT) & Anti-Scripted Paralinguistic Adapter.
 *
 * Bridges browser Web Speech API (`SpeechRecognition` / `webkitSpeechRecognition`)
 * with rule-based paralinguistic authenticity checks (detecting "Copilot Stare" /
 * teleprompter verbatim reading vs. authentic spontaneous delivery).
 */

const TEMPLATE_CLICHE_RE =
  /赋能|抓手|闭环|组合拳|底层逻辑|顶层设计|生态化反|全链路拉通|对齐颗粒度|形成合力|显著提升了效率/g
const CONCRETE_EVIDENCE_RE =
  /\d+(?:\.\d+)?(?:\s*%|\s*倍|\s*ms|\s*秒|\s*分钟|\s*天|\s*周|\s*人|\s*万|\s*个)|我负责|我主导|我排查|我设计|我通过/g

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

/**
 * Analyze whether a spoken/typed answer exhibits AI-teleprompter / scripted reading tells.
 *
 * Market insight (Final Round AI / OfferGoose / Interview Coder):
 * Live teleprompters produce answers with abnormally uniform speed (>240 cpm with 0 pauses),
 * heavy buzzword clichés, and low personal verifiable details.
 */
export function analyzeSpeechAuthenticity({
  text = '',
  durationSeconds = 0,
  pauseCount = 0,
  speechRateCpm = null,
} = {}) {
  const trimmed = String(text || '').trim()
  const charCount = trimmed.length
  if (charCount < 15) {
    return {
      authenticityScore: null,
      scriptedRisk: 'insufficient_data',
      label: '字数过少',
      tip: '回答内容较短，建议展开具体情境、个人动作与可核验结果。',
    }
  }

  const cpm =
    speechRateCpm != null
      ? Number(speechRateCpm)
      : durationSeconds > 3
        ? Math.round((charCount / durationSeconds) * 60)
        : 185

  const clicheHits = (trimmed.match(TEMPLATE_CLICHE_RE) || []).length
  const evidenceHits = (trimmed.match(CONCRETE_EVIDENCE_RE) || []).length

  let score = 82
  const reasons = []

  // 1. Teleprompter cadence tell: ultra-fast (>245 cpm) with zero natural pauses
  if (cpm > 245 && pauseCount === 0 && durationSeconds >= 10) {
    score -= 22
    reasons.push('语速偏快且缺乏自然思考停顿（易产生读稿/提词器感）')
  }

  // 2. Buzzword cliché saturation without concrete personal evidence
  if (clicheHits >= 2 && evidenceHits === 0) {
    score -= 20
    reasons.push('宏观套话较多但缺少「我」的具体动作与量化数字')
  } else if (evidenceHits >= 2) {
    score += 10
  }

  score = Math.max(35, Math.min(98, score))
  const scriptedRisk = score < 62 ? 'high' : score < 76 ? 'medium' : 'low'
  const label =
    scriptedRisk === 'high'
      ? '疑似背稿/提词感'
      : scriptedRisk === 'medium'
        ? '略显套路化'
        : '真实自然'

  return {
    authenticityScore: score,
    scriptedRisk,
    label,
    cpm,
    clicheHits,
    evidenceHits,
    tip:
      reasons.length > 0
        ? `${reasons.join('；')}。建议补充1个具体时间节点或踩坑细节以增强抗追问可信度。`
        : '表达节奏自然，包含可核验细节，具备良好的抗追问真实感。',
  }
}

export async function transcribeAudioFallback(audioBlob) {
  const formData = new FormData()
  formData.append('file', audioBlob, 'speech.webm')
  const res = await api.post('/interview/stt', formData)
  return res.data
}
