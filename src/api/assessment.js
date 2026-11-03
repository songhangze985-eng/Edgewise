import api from './client'

export async function createAssessmentSession() {
  const { data } = await api.post('/assessment/sessions')
  return data
}

export async function getAssessmentSession(assessmentId, config = {}) {
  const { data } = await api.get(`/assessment/sessions/${assessmentId}`, config)
  return data
}

export async function submitAssessmentAnswer(assessmentId, payload) {
  const { data } = await api.post(`/assessment/sessions/${assessmentId}/answers`, payload)
  return data
}

export async function completeAssessmentSession(assessmentId) {
  const { data } = await api.post(`/assessment/sessions/${assessmentId}/complete`)
  return data
}
