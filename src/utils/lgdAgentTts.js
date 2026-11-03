import { listZhVoices, pickPreferredZhVoice } from '../hooks/useTTS'

const AGENT_VOICE_HINTS = [
  ['yunxi', 'kangkang'],
  ['xiaoxiao', 'huihui'],
  ['yunjian', 'yunfeng'],
  ['tingting', 'sinji'],
  ['meijia', 'yaoyao'],
  ['kangkang', 'yunxi'],
  ['xiaoyi', 'xiaoxiao'],
]

const AGENT_PITCHES = [0.9, 1.0, 1.12, 1.2, 1.0, 0.9, 1.12]
const AGENT_RATES = [1.02, 1.05, 1.08, 1.04, 1.06, 1.1, 0.98]

function matchVoice(voices, hints) {
  const lower = (v) => `${v.name} ${v.voiceURI}`.toLowerCase()
  for (const hint of hints) {
    const hit = voices.find((v) => lower(v).includes(hint))
    if (hit) return hit
  }
  return null
}

export function buildAgentTtsProfiles(agentCount = 7) {
  const voices = listZhVoices()
  const fallback = pickPreferredZhVoice(voices)
  const used = new Set()

  return Array.from({ length: agentCount }, (_, index) => {
    const hints = AGENT_VOICE_HINTS[index] || AGENT_VOICE_HINTS[0]
    let voice = matchVoice(voices, hints)
    if (voice && used.has(voice.voiceURI)) voice = null
    if (!voice) {
      voice = voices.find((v) => !used.has(v.voiceURI)) || fallback
    }
    if (voice) used.add(voice.voiceURI)

    return {
      voiceURI: voice?.voiceURI ?? null,
      pitch: AGENT_PITCHES[index] ?? 1,
      rate: AGENT_RATES[index] ?? 1.05,
    }
  })
}
