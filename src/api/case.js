import api from './client'

export function listCasePrompts(config = {}) {
  return api.get('/case/prompts', config).then((r) => r.data)
}

export function createCaseSession(payload, config = {}) {
  return api.post('/case/sessions', payload, config).then((r) => r.data)
}

export function postCaseClarify(sessionId, payload, config = {}) {
  return api.post(`/case/sessions/${sessionId}/clarify`, payload, config).then((r) => r.data)
}

export function postCaseStep(sessionId, payload, config = {}) {
  return api.post(`/case/sessions/${sessionId}/step`, payload, config).then((r) => r.data)
}
