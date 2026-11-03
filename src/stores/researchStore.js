import { create } from 'zustand'
import { persist } from 'zustand/middleware'

const STORAGE_KEY = 'edgewise-research-touchpoint'
const CAPTURE_KEYS = [
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'entry',
  'task_id',
  'entry_channel',
  'experiment_arm',
  'research_accelerate',
  'share_id',
  'pair_id',
]

function readQueryAttribution() {
  if (typeof window === 'undefined') return {}
  const params = new URLSearchParams(window.location.search)
  const captured = {}
  for (const key of CAPTURE_KEYS) {
    const value = params.get(key)
    if (value) captured[key] = value
  }
  const ref = params.get('ref')
  if (ref) captured.ref = ref
  return captured
}

function deriveEntryChannel(attribution) {
  return attribution.entry_channel || attribution.entry || attribution.utm_source || null
}

const useResearchStore = create(
  persist(
    (set, get) => ({
      touchpoint: {},
      capturedAt: null,
      pendingReferralCode: null,
      onboardingSeenArms: [],

      captureFromUrl() {
        const fromQuery = readQueryAttribution()
        if (!Object.keys(fromQuery).length) return
        const { ref, ...touchKeys } = fromQuery
        const merged = { ...get().touchpoint, ...touchKeys }
        set({
          touchpoint: merged,
          capturedAt: new Date().toISOString(),
          pendingReferralCode: ref || get().pendingReferralCode,
        })
      },

      captureReferral(code) {
        if (!code) return
        set({ pendingReferralCode: code.trim().toUpperCase() })
      },

      markOnboardingSeen(arm) {
        const seen = new Set(get().onboardingSeenArms)
        seen.add(arm)
        set({ onboardingSeenArms: [...seen] })
      },

      shouldShowOnboarding(arm) {
        if (!arm) return false
        return !get().onboardingSeenArms.includes(arm)
      },

      getSessionMetadata(extra = {}) {
        const touchpoint = { ...get().touchpoint, ...extra }
        const taskId = touchpoint.task_id || extra.task_id || null
        const entryChannel = deriveEntryChannel(touchpoint)
        const payload = {
          research_touchpoint: touchpoint,
        }
        if (taskId) payload.task_id = taskId
        if (entryChannel) payload.entry_channel = entryChannel
        if (touchpoint.experiment_arm) payload.experiment_arm = touchpoint.experiment_arm
        return payload
      },

      wantsAcceleratedResearch() {
        return get().touchpoint.research_accelerate === '1'
      },
    }),
    {
      name: STORAGE_KEY,
      partialize: (state) => ({
        touchpoint: state.touchpoint,
        capturedAt: state.capturedAt,
        pendingReferralCode: state.pendingReferralCode,
        onboardingSeenArms: state.onboardingSeenArms,
      }),
    }
  )
)

export default useResearchStore
