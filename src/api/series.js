import api from './client'

export async function listCreatorSeries(params = {}) {
  const { data } = await api.get('/series', { params })
  return data
}

export async function getCreatorSeries(id) {
  const { data } = await api.get(`/series/${id}`)
  return data
}

export async function upsertCreatorSeries(id, payload) {
  const { data } = await api.put(`/series/${id}`, payload)
  return data
}
