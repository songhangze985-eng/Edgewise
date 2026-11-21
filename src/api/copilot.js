import api from './client'
import useAuthStore from '../stores/authStore'
import { trackResearchEvent } from '../research/track'

export async function postCopilotTriage(body) {
  const user = useAuthStore.getState().user
  const consent = user?.researchConsent
  const started = performance.now()
  const turn = body.clarify_answer ? 'clarification' : body.rejected_need ? 'reassessment' : 'initial'

  function recordOutcome(fields) {
    const current = useAuthStore.getState().user
    if (!consent?.accepted || !consent.acceptedAt || consent.withdrawnAt ||
        current?.id !== user.id || current.researchConsent?.acceptedAt !== consent.acceptedAt) return
    trackResearchEvent('copilot.triage_response', {
      turn,
      request_elapsed_ms: Math.round(performance.now() - started),
      ...fields,
    })
  }

  let data
  try {
    const response = await api.post('/copilot/triage', body, { skipErrorToast: true })
    data = response.data
  } catch (err) {
    recordOutcome({ outcome: err.response ? 'http_error' : 'network_error' })
    throw err
  }
  recordOutcome({
    triage_id: data.triage_id,
    outcome: data.clarifying_question ? 'clarification' : data.need === 'out_of_scope' ? 'out_of_scope' : 'recommendation',
  })
  return data
}

export function postCopilotMicroDone(body) {
  return api
    .post('/copilot/triage/micro-done', body, { skipErrorToast: true })
    .then((r) => r.data)
}

export function getCopilotMemory() {
  return api
    .get('/copilot/memory', { skipErrorToast: true })
    .then((r) => r.data)
}

export function clearCopilotMemory() {
  return api
    .delete('/copilot/memory', { skipErrorToast: true })
    .then((r) => r.data)
}
