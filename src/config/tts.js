import { FORCED_BY_ARM } from './experiment'

/**
 * When true, experiment arm overrides user TTS toggle (see getArmForcedTtsEnabled).
 * Participation factor (arm second digit): 1 → TTS on, 0 → TTS off.
 */
export const TTS_FORCED_BY_ARM = FORCED_BY_ARM.tts

export function getArmForcedTtsEnabled(experimentAssignment) {
  if (!TTS_FORCED_BY_ARM || !experimentAssignment?.arm) return null
  const arm = String(experimentAssignment.arm)
  if (arm.length < 2) return null
  return arm[1] === '1'
}
