import api from './client'

export function createShareCard(payload) {
  return api.post('/share/cards', payload).then((r) => r.data)
}

export function fetchShareCard(shareId) {
  return api.get(`/share/cards/${shareId}`, { skipErrorToast: true }).then((r) => r.data)
}

export function revokeShareCard(shareId) {
  return api.delete(`/share/cards/${shareId}`).then((r) => r.data)
}

export function createPair(payload) {
  return api.post('/pair', payload).then((r) => r.data)
}

export function fetchPair(pairId) {
  return api.get(`/pair/${pairId}`, { skipErrorToast: true }).then((r) => r.data)
}

export function submitPairAnswer(pairId, answer) {
  return api.post(`/pair/${pairId}/answer`, { answer }).then((r) => r.data)
}

export function setPairVisibility(pairId, visible) {
  return api.post(`/pair/${pairId}/visibility`, { visible }).then((r) => r.data)
}
