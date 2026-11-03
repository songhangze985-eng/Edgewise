/** Rule-based delivery metrics from Web Speech timestamps (no external API). */

const FILLER_RE_ZH = /(?:嗯|呃|啊|额|那个|这个|然后|就是|其实|基本上|对对对|你知道)/g
const FILLER_RE_EN = /\b(?:um+|uh+|er+|ah+|like|you know|i mean|sort of|kind of)\b/gi

const STAR_SIGNALS_ZH = {
  S: ['当时', '背景', '情境', '项目', '公司', '团队里', '在…中', '面临'],
  T: ['任务', '目标', '负责', '需要', '要求', 'KPI', '指标'],
  A: ['我做了', '我负责', '我采取', '我设计', '我推动', '我协调', '我实现', '我的行动'],
  R: ['结果', '最终', '成效', '提升', '降低', '节省', '获得', '转化率', '完成了'],
}

const STAR_SIGNALS_EN = {
  S: ['situation', 'background', 'context', 'at the time', 'when i', 'our team', 'the company'],
  T: ['task', 'goal', 'objective', 'responsible', 'needed to', 'kpi', 'metric'],
  A: ['i led', 'i drove', 'i implemented', 'i designed', 'my action', 'i coordinated', 'i built'],
  R: ['result', 'outcome', 'impact', 'improved', 'increased', 'reduced', 'saved', 'achieved'],
}

const STAR_ORDER = ['S', 'T', 'A', 'R']

export function isEnglishMetricsLang(lang) {
  const v = String(lang || '').trim().toLowerCase()
  return v === 'en-us' || v.startsWith('en')
}

function starSignalsForLang(lang) {
  return isEnglishMetricsLang(lang) ? STAR_SIGNALS_EN : STAR_SIGNALS_ZH
}

function charCount(text, lang) {
  if (!text) return 0
  if (isEnglishMetricsLang(lang)) {
    return (text.match(/[a-zA-Z']+/g) || []).length
  }
  const cjk = (text.match(/[\u4e00-\u9fff]/g) || []).length
  const words = (text.match(/[a-zA-Z]{2,}/g) || []).length
  return cjk + words
}

export function countFillers(text, lang) {
  if (!text) return 0
  const re = isEnglishMetricsLang(lang) ? FILLER_RE_EN : FILLER_RE_ZH
  const matches = text.match(re)
  return matches ? matches.length : 0
}

export function fillerPer100(text, lang) {
  const units = charCount(text, lang)
  if (units === 0) return null
  const fillers = countFillers(text, lang)
  return Math.round((fillers / units) * 1000) / 10
}

export function iWeRatio(text, lang) {
  if (!text) return null
  if (isEnglishMetricsLang(lang)) {
    const i = (text.match(/\bI\b/g) || []).length
    const we = (text.match(/\bwe\b/gi) || []).length
    const total = i + we
    if (total === 0) return null
    return Math.round((i / total) * 1000) / 1000
  }
  const i = (text.match(/我/g) || []).length
  const we = (text.match(/我们/g) || []).length
  const total = i + we
  if (total === 0) return null
  return Math.round((i / total) * 1000) / 1000
}

function scoreSentenceForStar(sentence, key, lang) {
  const signals = starSignalsForLang(lang)[key] || []
  const hay = isEnglishMetricsLang(lang) ? sentence.toLowerCase() : sentence
  return signals.reduce((n, s) => (hay.includes(s) ? n + 1 : n), 0)
}

/** Rule-based split of free text into STAR fields (editable by user). */
export function splitTextIntoStar(text, lang) {
  const trimmed = (text || '').trim()
  if (!trimmed) {
    return { S: '', T: '', A: '', R: '' }
  }
  const splitRe = isEnglishMetricsLang(lang)
    ? /(?<=[.!?])\s+|\n+/
    : /(?<=[。！？!?；;])\s*|\n+/
  const parts = trimmed
    .split(splitRe)
    .map((s) => s.trim())
    .filter(Boolean)
  if (!parts.length) {
    return { S: trimmed, T: '', A: '', R: '' }
  }

  const buckets = { S: [], T: [], A: [], R: [] }
  let phaseIdx = 0

  for (const sentence of parts) {
    let bestKey = STAR_ORDER[phaseIdx]
    let bestScore = scoreSentenceForStar(sentence, bestKey, lang)
    for (const key of STAR_ORDER) {
      const sc = scoreSentenceForStar(sentence, key, lang)
      if (sc > bestScore) {
        bestScore = sc
        bestKey = key
      }
    }
    if (bestScore > 0) {
      phaseIdx = Math.max(phaseIdx, STAR_ORDER.indexOf(bestKey))
    }
    buckets[bestKey].push(sentence)
  }

  const joiner = isEnglishMetricsLang(lang) ? ' ' : ''
  return {
    S: buckets.S.join(joiner),
    T: buckets.T.join(joiner),
    A: buckets.A.join(joiner),
    R: buckets.R.join(joiner),
  }
}

export function detectStarCoverage(text, lang) {
  const empty = { S: false, T: false, A: false, R: false }
  if (!text || !text.trim()) return empty
  const out = { ...empty }
  const hay = isEnglishMetricsLang(lang) ? text.toLowerCase() : text
  for (const [key, signals] of Object.entries(starSignalsForLang(lang))) {
    out[key] = signals.some((s) => hay.includes(s))
  }
  return out
}

export function buildSpeechPayload(segments, windowStartMs) {
  const cleaned = (segments || []).filter((s) => s?.text?.trim())
  if (!cleaned.length || windowStartMs == null) {
    return { segments: [], first_word_ms: null, total_ms: null }
  }
  const first = cleaned[0].start_ms ?? 0
  const last = cleaned[cleaned.length - 1]
  const total = Math.max(0, (last.end_ms ?? last.start_ms ?? 0) - first)
  return {
    segments: cleaned.map(({ text, start_ms, end_ms }) => ({
      text,
      start_ms,
      end_ms,
    })),
    first_word_ms: first,
    total_ms: total,
  }
}

export function countLongPauses(segments, thresholdMs = 3000) {
  if (!segments || segments.length < 2) return 0
  let count = 0
  for (let i = 1; i < segments.length; i += 1) {
    const prevEnd = segments[i - 1].end_ms ?? segments[i - 1].start_ms ?? 0
    const nextStart = segments[i].start_ms ?? 0
    if (nextStart - prevEnd > thresholdMs) count += 1
  }
  return count
}

export function computeCpm(text, speech, lang) {
  const units = charCount(text, lang)
  const totalMs = speech?.total_ms
  if (!units || !totalMs || totalMs <= 0) return null
  const minutes = totalMs / 60000
  return Math.round(units / minutes)
}

/** Alias: words per minute for English sessions (same numeric field as cpm). */
export function computeWpm(text, speech, lang) {
  return computeCpm(text, speech, lang)
}

/**
 * @param {string} answerText
 * @param {{ segments?: array, first_word_ms?: number|null, total_ms?: number|null }} speech
 * @param {{ textOnly?: boolean, lang?: string }} opts
 */
export function computeDeliveryMetrics(answerText, speech, opts = {}) {
  const textOnly = Boolean(opts.textOnly)
  const lang = opts.lang
  const english = isEnglishMetricsLang(lang)
  const text = (answerText || '').trim()
  const filler = fillerPer100(text, lang)
  const i_we_ratio = iWeRatio(text, lang)
  const star = detectStarCoverage(text, lang)

  const base = {
    cpm: null,
    wpm: null,
    think_ms: null,
    long_pauses: null,
    filler_per_100: filler,
    i_we_ratio,
    star,
    text_only: textOnly,
    metrics_lang: english ? 'en-US' : 'zh-CN',
  }

  if (textOnly || !speech?.segments?.length) {
    return base
  }

  const think_ms =
    speech.first_word_ms != null && speech.first_word_ms >= 0 ? Math.round(speech.first_word_ms) : null
  const long_pauses = countLongPauses(speech.segments)
  const rate = computeCpm(text, speech, lang)

  return {
    ...base,
    cpm: rate,
    wpm: english ? rate : null,
    think_ms,
    long_pauses,
    text_only: false,
  }
}

export function aggregateDeliverySummary(rounds) {
  if (!Array.isArray(rounds)) return null
  const cpms = []
  const wpms = []
  const fillers = []
  for (const rnd of rounds) {
    for (const q of rnd.questions || []) {
      const d = q.delivery
      if (d?.cpm != null) cpms.push(d.cpm)
      if (d?.wpm != null) wpms.push(d.wpm)
      if (d?.filler_per_100 != null) fillers.push(d.filler_per_100)
      for (const fu of q.followups || []) {
        const fd = fu.delivery
        if (fd?.cpm != null) cpms.push(fd.cpm)
        if (fd?.wpm != null) wpms.push(fd.wpm)
        if (fd?.filler_per_100 != null) fillers.push(fd.filler_per_100)
      }
    }
  }
  if (!cpms.length && !fillers.length && !wpms.length) return null
  const avg = (arr) =>
    arr.length ? Math.round((arr.reduce((a, b) => a + b, 0) / arr.length) * 10) / 10 : null
  const summary = {
    avg_cpm: avg(cpms),
    avg_filler_per_100: avg(fillers),
    voice_samples: cpms.length,
  }
  const avgWpm = avg(wpms.length ? wpms : cpms)
  if (wpms.length || rounds.some((r) =>
    (r.questions || []).some((q) => q.delivery?.metrics_lang === 'en-US' || q.lang === 'en-US'),
  )) {
    summary.avg_wpm = avgWpm
  }
  return summary
}

export function formatMetric(value, suffix = '') {
  if (value == null || Number.isNaN(value)) return '—'
  return `${value}${suffix}`
}
