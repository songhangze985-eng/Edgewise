import api from './client'

export async function listExperiences(params = {}) {
  const { data } = await api.get('/experiences', { params })
  return data
}

export async function getExperience(id) {
  const { data } = await api.get(`/experiences/${id}`)
  return data
}

export async function submitExperience(payload) {
  const { data } = await api.post('/experiences', payload)
  return data
}

export async function fetchExperienceReviewQueue() {
  const { data } = await api.get('/experiences/review-queue')
  return data
}

export async function reviewExperience(id, payload) {
  const { data } = await api.post(`/experiences/${id}/review`, payload)
  return data
}
