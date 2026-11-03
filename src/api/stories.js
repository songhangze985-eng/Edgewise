import api from './client'

export async function listStories() {
  const { data } = await api.get('/stories')
  return data
}

export async function getStory(id) {
  const { data } = await api.get(`/stories/${id}`)
  return data
}

export async function createStory(payload) {
  const { data } = await api.post('/stories', payload)
  return data
}

export async function updateStory(id, payload) {
  const { data } = await api.patch(`/stories/${id}`, payload)
  return data
}

export async function deleteStory(id) {
  const { data } = await api.delete(`/stories/${id}`)
  return data
}
