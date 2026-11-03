const LONG_TEXT = 120

/** Split spoken text into caption / TTS chunks at sentence boundaries. */
export function splitSpeechSentences(text) {
  const trimmed = String(text || '').trim()
  if (!trimmed) return []
  if (trimmed.length <= LONG_TEXT) return [trimmed]

  const chunks = []
  let buf = ''
  for (const char of trimmed) {
    buf += char
    if (/[。！？.!?]/.test(char)) {
      chunks.push(buf.trim())
      buf = ''
    } else if (buf.length >= LONG_TEXT) {
      chunks.push(buf.trim())
      buf = ''
    }
  }
  if (buf.trim()) chunks.push(buf.trim())
  return chunks.length ? chunks : [trimmed]
}
