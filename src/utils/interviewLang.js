export const INTERVIEW_LANG_ZH = 'zh-CN'
export const INTERVIEW_LANG_EN = 'en-US'

export function normalizeInterviewLang(raw) {
  const v = String(raw || '').trim()
  if (v === INTERVIEW_LANG_EN || v.toLowerCase().startsWith('en')) return INTERVIEW_LANG_EN
  return INTERVIEW_LANG_ZH
}

export function isEnglishInterviewLang(lang) {
  return normalizeInterviewLang(lang) === INTERVIEW_LANG_EN
}

/** Some environments expose Web Speech but not reliably for en-US (e.g. WeChat). */
export function shouldWarnEnglishStt(interviewLang) {
  if (!isEnglishInterviewLang(interviewLang)) return false
  if (typeof window === 'undefined') return false
  const Ctor = window.SpeechRecognition || window.webkitSpeechRecognition
  if (!Ctor) return true
  if (/MicroMessenger/i.test(navigator.userAgent || '')) return true
  return false
}
