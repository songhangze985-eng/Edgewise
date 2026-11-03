import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import * as authApi from '../api/auth'
import { getErrorMessage } from '../api/client'

function mapUser(user) {
  if (!user) return null
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    initials: user.initials,
    tier: user.tier,
    tierLabel: user.tier_label,
    credits: user.credits,
    joinDate: user.join_date,
    isAdmin: user.is_admin,
    researchConsent: user.research_consent
      ? {
          accepted: user.research_consent.accepted,
          acceptedAt: user.research_consent.accepted_at,
          withdrawnAt: user.research_consent.withdrawn_at,
          version: user.research_consent.version,
        }
      : null,
    experimentAssignment: user.experiment_assignment || null,
    posttestDueAt: user.posttest_due_at || null,
    followupTaskDueAt: user.followup_task_due_at || null,
    posttestCompletedAt: user.posttest_completed_at || null,
    inviteCode: user.invite_code || null,
    referredBy: user.referred_by || null,
    referralIncentive: user.referral_incentive || null,
  }
}

async function maybeClaimReferral() {
  const { default: useResearchStore } = await import('./researchStore')
  const { claimReferral } = await import('../api/research')
  const code = useResearchStore.getState().pendingReferralCode
  if (!code) return
  try {
    await claimReferral(code)
    useResearchStore.setState({ pendingReferralCode: null })
  } catch {
    /* invalid or self-ref — keep UX silent */
  }
}

const useAuthStore = create(
  persist(
    (set, get) => ({
      user: null,
      accessToken: null,
      isAuthenticated: false,
      bootstrapped: false,

      async login(email, password) {
        const data = await authApi.login({ email, password })
        set({
          user: mapUser(data.user),
          accessToken: data.access_token,
          isAuthenticated: true,
          bootstrapped: true,
        })
        await maybeClaimReferral()
        return data.user
      },

      async register(email, password, name) {
        await authApi.register({ email, password, name })
        return get().login(email, password)
      },

      async fetchMe() {
        const token = get().accessToken
        if (!token) {
          set({ user: null, isAuthenticated: false, bootstrapped: true })
          return null
        }
        try {
          const user = await authApi.fetchMe()
          await maybeClaimReferral()
          set({
            user: mapUser(user),
            isAuthenticated: true,
            bootstrapped: true,
          })
          return user
        } catch (error) {
          set({
            user: null,
            accessToken: null,
            isAuthenticated: false,
            bootstrapped: true,
          })
          throw error
        }
      },

      async logout() {
        try {
          if (get().accessToken) {
            await authApi.logout()
          }
        } catch {
          /* ignore logout API errors */
        }
        set({
          user: null,
          accessToken: null,
          isAuthenticated: false,
          bootstrapped: true,
        })
      },

      updateCredits(delta) {
        set((state) => ({
          user: state.user
            ? { ...state.user, credits: state.user.credits + delta }
            : null,
        }))
      },

      setBootstrapped(value = true) {
        set({ bootstrapped: value })
      },

      getErrorMessage,
    }),
    {
      name: 'edgewise-auth',
      partialize: (state) => ({
        user: state.user,
        accessToken: state.accessToken,
        isAuthenticated: state.isAuthenticated,
      }),
    }
  )
)

export default useAuthStore
