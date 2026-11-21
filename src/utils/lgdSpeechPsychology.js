/**
 * Psycholinguistic & Group-Dynamics Speech Tempo Engine for LGD Multi-Agent Simulation
 *
 * Grounded in three peer-reviewed psychological & psycholinguistic frameworks:
 * 1. Gersick, C. J. G. (1988). "Time and transition in work teams: Toward a new model of group development."
 *    Academy of Management Journal, 31(1), 9–41.
 *    -> Establishes the Midpoint Transition (u = 0.50) and Terminal Completion Surge (u >= 0.80) in time-bounded groups.
 * 2. Yerkes, R. M., & Dodson, J. D. (1908) / Maule, A. J., Hockey, G. R. J., & Bdzola, L. (2000).
 *    "Effects of time-pressure on decision-making under uncertainty: Changes in affective state and information processing strategy."
 *    Acta Psychologica, 104(3), 283–305.
 *    -> Models cognitive & verbal Acceleration under deadline arousal with an upper intelligibility ceiling to prevent panic degradation.
 * 3. Lindblom, B. (1990) H&H Theory & Kirchhübel, C., Howard, D. M., & Stedmon, A. W. (2011).
 *    "Acoustic correlates of speech under stress." International Journal of Speech, Language and the Law, 18(1), 75–98.
 *    -> Captures articulation-rate expansion and exponential compression of inter-turn silence gaps under time urgency.
 */

export const PSYCHOLINGUISTIC_CITATIONS = [
  'Gersick (1988) Academy of Management Journal 31(1):9-41 — Punctuated Equilibrium Midpoint & Deadline Transition',
  'Maule, Hockey & Bdzola (2000) Acta Psychologica 104(3):283-305 — Cognitive & Verbal Acceleration under Time Pressure',
  'Lindblom (1990) H&H Theory & Kirchhübel et al. (2011) — Articulation Rate & Inter-Turn Pause Compression under Arousal',
]

export const AGENT_SPEECH_PROFILES = {
  ice_breaker: {
    agentId: 'ice_breaker',
    baseRate: 1.03,
    basePitch: 0.96,
    urgencySensitivity: 1.0,
    tempoPersona: '稳健清晰',
  },
  idea_king: {
    agentId: 'idea_king',
    baseRate: 1.16,
    basePitch: 1.1,
    urgencySensitivity: 1.05,
    tempoPersona: '轻快跳跃',
  },
  logician: {
    agentId: 'logician',
    baseRate: 0.95,
    basePitch: 0.92,
    urgencySensitivity: 0.92,
    tempoPersona: '沉稳严密',
  },
  interrupter: {
    agentId: 'interrupter',
    baseRate: 1.24,
    basePitch: 1.14,
    urgencySensitivity: 1.15,
    tempoPersona: '急促凌厉',
  },
  digresser: {
    agentId: 'digresser',
    baseRate: 0.9,
    basePitch: 1.04,
    urgencySensitivity: 0.78,
    tempoPersona: '漫游拖沓',
  },
  mediator: {
    agentId: 'mediator',
    baseRate: 0.88,
    basePitch: 0.94,
    urgencySensitivity: 0.95,
    tempoPersona: '温润舒缓',
  },
  timekeeper: {
    agentId: 'timekeeper',
    baseRate: 1.1,
    basePitch: 1.05,
    urgencySensitivity: 1.3,
    tempoPersona: '干脆紧迫',
  },
}

const ORDERED_AGENT_IDS = [
  'ice_breaker',
  'idea_king',
  'logician',
  'interrupter',
  'digresser',
  'mediator',
  'timekeeper',
]

function logistic(z) {
  return 1 / (1 + Math.exp(-z))
}

function dualLogisticGain(elapsedRatio) {
  // Wave 1: Gersick (1988) Midpoint Transition at u = 0.50 (w1 = 0.12, k1 = 10)
  // Wave 2: Terminal Deadline Arousal Surge at u = 0.80 (w2 = 0.24, k2 = 18)
  const w1 = 0.12
  const k1 = 10.0
  const w2 = 0.24
  const k2 = 18.0
  return w1 * logistic(k1 * (elapsedRatio - 0.5)) + w2 * logistic(k2 * (elapsedRatio - 0.8))
}

const GAIN_AT_ZERO = dualLogisticGain(0)

export function getAgentSpeechProfile(agentIdOrIndex) {
  if (typeof agentIdOrIndex === 'number') {
    const id = ORDERED_AGENT_IDS[agentIdOrIndex] || 'ice_breaker'
    return AGENT_SPEECH_PROFILES[id]
  }
  return AGENT_SPEECH_PROFILES[agentIdOrIndex] || AGENT_SPEECH_PROFILES.ice_breaker
}

/**
 * Compute dynamic speech tempo, pitch micro-shift, typewriter cadence, and turn-gap compression.
 */
export function computePsycholinguisticSpeechTempo({
  agentId = 'ice_breaker',
  remainingSeconds = 300,
  totalPhaseSeconds = 600,
  phase = 'free_discussion',
} = {}) {
  const profile = getAgentSpeechProfile(agentId)
  const safeTotal = Math.max(30, Number(totalPhaseSeconds) || 600)
  const safeRem = Math.max(0, Math.min(safeTotal, Number(remainingSeconds) ?? safeTotal))
  const elapsedRatio = phase === 'reading' ? 0 : Math.max(0, Math.min(1, 1 - safeRem / safeTotal))

  const rawArousal = Math.max(0, dualLogisticGain(elapsedRatio) - GAIN_AT_ZERO)
  // In sequential personal_statement or examiner_followup, apply gentler urgency modulation (0.65x) than free_discussion
  const phaseMod =
    phase === 'free_discussion'
      ? 1.0
      : phase === 'summary_report'
        ? 0.85
        : 0.65

  const urgencyGain = rawArousal * profile.urgencySensitivity * phaseMod
  // Yerkes-Dodson intelligibility ceiling: clamp speech rate to [0.84, 1.65]
  const effectiveRate =
    Math.round(Math.max(0.84, Math.min(1.65, profile.baseRate * (1 + urgencyGain))) * 100) / 100
  // Slight fundamental frequency (F0 / pitch) elevation under sympathetic stress (+0.00 to +0.06)
  const effectivePitch =
    Math.round(Math.max(0.8, Math.min(1.3, profile.basePitch + urgencyGain * 0.14)) * 100) / 100

  // Coupled visual caption streaming & inter-turn gap compression
  const typewriterDelayMs = Math.max(14, Math.round(35 / effectiveRate))
  const chunkDelayMs = Math.max(14, Math.round(32 / effectiveRate))
  const turnGapScale = Math.max(0.54, Math.round(Math.exp(-1.55 * rawArousal) * 100) / 100)

  let tempoStage = 'baseline'
  let tempoLabel = `${profile.tempoPersona} ${effectiveRate.toFixed(2)}x`
  if (elapsedRatio >= 0.8) {
    tempoStage = 'deadline_sprint'
    tempoLabel = `⏩ 终局紧迫提速 ${effectiveRate.toFixed(2)}x`
  } else if (elapsedRatio >= 0.5) {
    tempoStage = 'midpoint_shift'
    tempoLabel = `⚡ 过半唤醒提速 ${effectiveRate.toFixed(2)}x`
  }

  return {
    agentId: profile.agentId,
    tempoPersona: profile.tempoPersona,
    baseRate: profile.baseRate,
    effectiveRate,
    basePitch: profile.basePitch,
    effectivePitch,
    elapsedRatio: Math.round(elapsedRatio * 1000) / 1000,
    urgencyGain: Math.round(urgencyGain * 1000) / 1000,
    typewriterDelayMs,
    chunkDelayMs,
    turnGapScale,
    tempoStage,
    tempoLabel,
     accelerated: elapsedRatio >= 0.5,
  }
}
