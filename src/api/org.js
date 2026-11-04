import api from './client'

export function fetchOrgJoinPreview(code) {
  return api.get(`/org/join/${encodeURIComponent(code)}/preview`).then((r) => r.data)
}

export function submitOrgJoin(code, body) {
  return api.post(`/org/join/${encodeURIComponent(code)}`, body).then((r) => r.data)
}

export function fetchOrgMembership() {
  return api.get('/org/me').then((r) => r.data)
}

export function updateOrgConsent(body) {
  return api.patch('/org/me/consent', body).then((r) => r.data)
}

export function shareSessionWithMentor(sessionId) {
  return api.post('/org/sessions/share', { session_id: sessionId }).then((r) => r.data)
}

export function fetchOrgAggregate(orgId) {
  return api.get(`/org/${encodeURIComponent(orgId)}/aggregate`).then((r) => r.data)
}

export function fetchMentorSessions() {
  return api.get('/org/mentor/sessions').then((r) => r.data)
}

export function completeOrgWorkshop(workshopId) {
  return api.post(`/org/workshops/${encodeURIComponent(workshopId)}/complete`).then((r) => r.data)
}

export function adminListOrgs() {
  return api.get('/org/admin/orgs').then((r) => r.data)
}

export function adminCreateOrg(body) {
  return api.post('/org/admin/orgs', body).then((r) => r.data)
}

export function adminAddWorkshop(orgId, body) {
  return api.post(`/org/admin/orgs/${encodeURIComponent(orgId)}/workshops`, body).then((r) => r.data)
}

export function adminAddMentor(orgId, userId) {
  return api.post(`/org/admin/orgs/${encodeURIComponent(orgId)}/mentors`, { user_id: userId }).then((r) => r.data)
}
