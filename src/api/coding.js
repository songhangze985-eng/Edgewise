import api from './client'

export function createCodingSession(payload) {
  return api.post('/coding/sessions', payload).then((r) => r.data)
}

export function recordCodingAttempt(sessionId, payload) {
  return api.post(`/coding/sessions/${sessionId}/attempts`, payload).then((r) => r.data)
}

export function patchCodingExplain(sessionId, payload) {
  return api.patch(`/coding/sessions/${sessionId}/explain`, payload).then((r) => r.data)
}

export function completeCodingSession(sessionId) {
  return api.post(`/coding/sessions/${sessionId}/complete`).then((r) => r.data)
}
