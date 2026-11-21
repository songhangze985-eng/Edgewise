import { create } from 'zustand'
import { fetchSurveyPending, submitSurveyAnswers } from '../api/research'
import { showToast } from './toastStore'
import { getErrorMessage, readPersistedToken } from '../api/client'
import useAuthStore from './authStore'

function activeSurveyAccount() {
  const { user, accessToken } = useAuthStore.getState()
  const consent = user?.researchConsent
  if (!user?.id || !accessToken || readPersistedToken() !== accessToken ||
      !consent?.accepted || consent.withdrawnAt || !consent.acceptedAt) return null
  return { user_id: user.id, consent_accepted_at: consent.acceptedAt, token: accessToken }
}

function sameSurveyScope(a, b) {
  return Boolean(a && b && a.user_id === b.user_id && a.consent_accepted_at === b.consent_accepted_at)
}

const useSurveyStore = create((set, get) => ({
  isOpen: false,
  items: [],
  loading: false,
  submitting: false,
  surveyVersion: '',
  blockedReason: null,
  answerContext: null,
  offerEventId: null,

  async checkPending(context) {
    if (get().loading || get().submitting || get().isOpen) return null
    const account = activeSurveyAccount()
    if (!account) return null
    set({ loading: true })
    try {
      const data = await fetchSurveyPending(context, account.token)
      if (!sameSurveyScope(account, activeSurveyAccount())) {
        set({ loading: false })
        return null
      }
      const items = Array.isArray(data?.items) ? data.items : []
      if (items.length > 0 && data.offer_event_id && sameSurveyScope(data.answer_context, account)) {
        set({
          isOpen: true,
          items,
          answerContext: data.answer_context,
          offerEventId: data.offer_event_id,
          surveyVersion: data?.survey_version || '',
          blockedReason: data?.blocked_reason || null,
          loading: false,
        })
        return data
      } else {
        set({
          items: [],
          blockedReason: data?.blocked_reason || null,
          loading: false,
        })
        return data
      }
    } catch {
      // Gracefully handle offline or rate-limit responses
      set({ loading: false })
      return null
    }
  },

  async submitAnswers(answersMap = {}) {
    const { items, submitting, offerEventId, answerContext } = get()
    if (submitting || !items.length) return
    const account = activeSurveyAccount()
    if (!sameSurveyScope(answerContext, account)) {
      get().close()
      return
    }
    set({ submitting: true })

    const payload = items.map((item) => {
      const val = answersMap[item.id]
      const hasValue = val !== undefined && val !== null && String(val).trim() !== ''
      return {
        item_id: item.id,
        value: hasValue ? (item.type === 'likert7' ? Number(val) : String(val).trim()) : null,
        skipped: !hasValue,
      }
    })

    try {
      await submitSurveyAnswers(payload, offerEventId, answerContext, account.token)
      if (sameSurveyScope(answerContext, activeSurveyAccount())) {
        showToast('调研问卷已提交，感谢您的参与！', 'success')
      }
      get().close()
    } catch (err) {
      if (sameSurveyScope(answerContext, activeSurveyAccount())) {
        showToast(getErrorMessage(err, '提交问卷失败，请稍后重试'), 'error')
      } else {
        get().close()
      }
    } finally {
      set({ submitting: false })
    }
  },

  async skipAll() {
    const { items, submitting, offerEventId, answerContext } = get()
    if (submitting) return
    const account = activeSurveyAccount()
    if (!items.length || !sameSurveyScope(answerContext, account)) {
      get().close()
      return
    }
    set({ submitting: true })
    const payload = items.map((item) => ({
      item_id: item.id,
      value: null,
      skipped: true,
    }))

    try {
      await submitSurveyAnswers(payload, offerEventId, answerContext, account.token)
    } catch {
      // Ignore skip recording error so user modal is cleanly dismissed
    } finally {
      get().close()
      set({ submitting: false })
    }
  },

  close() {
    set({ isOpen: false, items: [], answerContext: null, offerEventId: null })
  },
}))

useAuthStore.subscribe(() => {
  const { answerContext, close } = useSurveyStore.getState()
  if (answerContext && !sameSurveyScope(answerContext, activeSurveyAccount())) close()
})

export function triggerSurveyCheck(context) {
  return useSurveyStore.getState().checkPending(context)
}

export default useSurveyStore
