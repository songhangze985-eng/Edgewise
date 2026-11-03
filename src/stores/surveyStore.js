import { create } from 'zustand'
import { fetchSurveyPending, submitSurveyAnswers } from '../api/research'
import { showToast } from './toastStore'
import { getErrorMessage } from '../api/client'

const useSurveyStore = create((set, get) => ({
  isOpen: false,
  items: [],
  loading: false,
  submitting: false,
  surveyVersion: '',
  blockedReason: null,

  async checkPending(context) {
    if (get().loading || get().submitting || get().isOpen) return null
    set({ loading: true })
    try {
      const data = await fetchSurveyPending(context)
      const items = Array.isArray(data?.items) ? data.items : []
      if (items.length > 0) {
        set({
          isOpen: true,
          items,
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
    const { items, submitting } = get()
    if (submitting || !items.length) return
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
      await submitSurveyAnswers(payload)
      showToast('调研问卷已提交，感谢您的参与！', 'success')
      set({
        isOpen: false,
        items: [],
        submitting: false,
      })
    } catch (err) {
      showToast(getErrorMessage(err, '提交问卷失败，请稍后重试'), 'error')
      set({ submitting: false })
    }
  },

  async skipAll() {
    const { items, submitting } = get()
    if (submitting) return
    if (!items.length) {
      set({ isOpen: false })
      return
    }
    set({ submitting: true })
    const payload = items.map((item) => ({
      item_id: item.id,
      value: null,
      skipped: true,
    }))

    try {
      await submitSurveyAnswers(payload)
    } catch {
      // Ignore skip recording error so user modal is cleanly dismissed
    } finally {
      set({
        isOpen: false,
        items: [],
        submitting: false,
      })
    }
  },

  close() {
    set({ isOpen: false })
  },
}))

export function triggerSurveyCheck(context) {
  return useSurveyStore.getState().checkPending(context)
}

export default useSurveyStore
