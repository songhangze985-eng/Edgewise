import { listZhVoices, pickPreferredZhVoice } from '../hooks/useTTS'
import {
  AGENT_SPEECH_PROFILES,
  computePsycholinguisticSpeechTempo,
  getAgentSpeechProfile,
} from './lgdSpeechPsychology'

const AGENT_VOICE_HINTS = [
  ['yunxi', 'kangkang'],
  ['xiaoxiao', 'huihui'],
  ['yunjian', 'yunfeng'],
  ['tingting', 'sinji'],
  ['meijia', 'yaoyao'],
  ['kangkang', 'yunxi'],
  ['xiaoyi', 'xiaoxiao'],
]

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

    const psychProfile = getAgentSpeechProfile(index)
    return {
      agentId: psychProfile.agentId,
      voiceURI: voice?.voiceURI ?? null,
      pitch: psychProfile.basePitch,
      rate: psychProfile.baseRate,
      tempoPersona: psychProfile.tempoPersona,
    }
  })
}

export { AGENT_SPEECH_PROFILES, computePsycholinguisticSpeechTempo, getAgentSpeechProfile }
