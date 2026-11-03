/**
 * Experiment arm policy (read-only). Arm digits: ZC = continuity, ZP = participation.
 */
export const FORCED_BY_ARM = {
  tts: false,
  rounds: false,
  revision: true,
  followup: true,
  referral_incentive: true,
  task_entry: true,
  creator_variant: true,
}

/** ZC=1 → complementary creator series; ZC=0 → conclusion mirror series. */
export function creatorSeriesVariant(experimentAssignment) {
  const code = experimentAssignment?.arm ? String(experimentAssignment.arm) : null
  const inExperiment = Boolean(code && code.length >= 2)
  if (!inExperiment || !FORCED_BY_ARM.creator_variant) return 'complementary'
  return Number(code[0]) === 1 ? 'complementary' : 'conclusion'
}

/** Minimum passive watch time for ZP=0 demo revision panel (seconds). */
export const DEMO_REVISION_MIN_SECONDS = 45

export function useArmPolicy(experimentAssignment) {
  const code = experimentAssignment?.arm ? String(experimentAssignment.arm) : null
  const inExperiment = Boolean(code && code.length >= 2)
  const ZC = inExperiment ? Number(code[0]) : null
  const ZP = inExperiment ? Number(code[1]) : null

  function isForced(featureKey) {
    if (!inExperiment) return false
    return Boolean(FORCED_BY_ARM[featureKey])
  }

  /** ZP=0 → demo watch; ZP=1 → full revision loop when revision is forced. */
  function revisionParticipationMode() {
    if (!inExperiment || !isForced('revision')) return 'optional'
    return ZP === 0 ? 'demo' : 'active'
  }

  /** ZP=0 → no dynamic follow-ups; ZP=1 → at most 1 layer (merged with revision probe). */
  function followupEnabled() {
    if (!inExperiment || !isForced('followup')) return true
    return ZP !== 0
  }

  function followupMaxLayers() {
    if (!followupEnabled()) return 0
    if (inExperiment && isForced('followup') && ZP === 1) return 1
    return 3
  }

  /** Experiment assigns referral reward type on the server; UI only displays it. */
  function referralIncentiveForced() {
    return isForced('referral_incentive')
  }

  return {
    inExperiment,
    arm: { ZC, ZP, code },
    isForced,
    revisionParticipationMode,
    followupEnabled,
    followupMaxLayers,
    referralIncentiveForced,
  }
}
