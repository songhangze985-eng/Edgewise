function getSpeechRecognitionCtor() {
  if (typeof window === 'undefined') return null
  return window.SpeechRecognition || window.webkitSpeechRecognition || null
}

export function isWeChatBrowser() {
  if (typeof navigator === 'undefined') return false
  return /MicroMessenger/i.test(navigator.userAgent || '')
}

export function isWebSpeechAvailable() {
  return Boolean(getSpeechRecognitionCtor())
}

/** WeChat in-app browser often lacks Web Speech — show tip, keep text input. */
export function shouldShowWeChatSpeechTip() {
  return isWeChatBrowser() && !isWebSpeechAvailable()
}

export function getDeviceType() {
  if (typeof window === 'undefined') return 'unknown'
  const ua = navigator.userAgent || ''
  const coarseMobile = /Android|webOS|iPhone|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua)
  const width = window.innerWidth
  if (width < 768 || (coarseMobile && width < 1024)) return 'mobile'
  if (width < 1024 || /iPad|Tablet/i.test(ua)) return 'tablet'
  return 'desktop'
}

export function getWeSpeechUaCategory() {
  return isWeChatBrowser() ? 'wechat' : 'other'
}
