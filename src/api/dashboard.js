import api from './client'

export function getOverview() {
  return api.get('/dashboard/overview').then((r) => r.data)
}

export function getRecentSessions() {
  return api.get('/dashboard/recent-sessions').then((r) => r.data)
}
