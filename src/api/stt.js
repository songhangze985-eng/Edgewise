/**
 * External STT adapter (optional). Browser path uses Web Speech API in useSpeechToText.
 * Wire an API endpoint when ready:
 *   transcribeAudio(blob) -> { text: string }
 */

export async function transcribeAudio(_blob, _options = {}) {
  // TODO: POST audio blob to backend STT service when available
  throw new Error('External STT is not configured')
}

export function isExternalSttConfigured() {
  return false
}
