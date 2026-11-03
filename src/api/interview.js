import api from './client'

export function createSession(payload, config = {}) {
  return api.post('/interview/sessions', payload, config).then((r) => r.data)
}

export function getSession(sessionId, config = {}) {
  return api.get(`/interview/sessions/${sessionId}`, config).then((r) => r.data)
}

export function completeSession(sessionId, payload, config = {}) {
  return api
    .post(`/interview/sessions/${sessionId}/complete`, payload, config)
    .then((r) => r.data)
}

export function patchSessionMetadata(sessionId, metadata) {
  return api
    .patch(`/interview/sessions/${sessionId}/metadata`, { metadata })
    .then((r) => r.data)
}

export function scoreInterviewAnswer(sessionId, payload, config = {}) {
  return api
    .post(`/interview/sessions/${sessionId}/score-answer`, payload, config)
    .then((r) => r.data)
}

export function postQuestionAttempt(sessionId, questionId, payload, config = {}) {
  return api
    .post(`/interview/sessions/${sessionId}/questions/${questionId}/attempts`, payload, config)
    .then((r) => r.data)
}

export function submitRevisionDecision(sessionId, questionId, payload, config = {}) {
  return api
    .post(`/interview/sessions/${sessionId}/questions/${questionId}/revision-decision`, payload, config)
    .then((r) => r.data)
}

export function postQuestionFollowup(sessionId, questionId, payload, config = {}) {
  return api
    .post(`/interview/sessions/${sessionId}/questions/${questionId}/followup`, payload, config)
    .then((r) => r.data)
}

export function postNegotiationTurn(sessionId, payload, config = {}) {
  return api
    .post(`/interview/sessions/${sessionId}/negotiation/turn`, payload, config)
    .then((r) => r.data)
}

export function submitReverseQa(sessionId, payload, config = {}) {
  return api
    .post(`/interview/sessions/${sessionId}/reverse-qa`, payload, config)
    .then((r) => r.data)
}
