import api from './client'

export async function createAssessmentSession() {
  const { data } = await api.post('/assessment/sessions')
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
