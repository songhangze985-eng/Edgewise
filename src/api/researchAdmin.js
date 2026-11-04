import api from './client'

function qs(params) {
  const sp = new URLSearchParams()
  Object.entries(params || {}).forEach(([k, v]) => {
    if (v === undefined || v === null || v === '') return
    sp.set(k, Array.isArray(v) ? v.join(',') : String(v))
  })
  return sp.toString()
}

export function fetchResearchAdminMeta(filters) {
  return api.get(`/research/admin/meta?${qs(filters)}`).then((r) => r.data)
}

export function fetchResearchOverview(filters) {
  return api.get(`/research/admin/overview?${qs(filters)}`).then((r) => r.data)
}

export function fetchResearchPassive(filters) {
  return api.get(`/research/admin/passive?${qs(filters)}`).then((r) => r.data)
}

export function fetchResearchSurveyItems(filters) {
  return api.get(`/research/admin/survey/items?${qs(filters)}`).then((r) => r.data)
}

export function fetchResearchExperiment(filters, outcome, bootSeed = {}) {
  return api
    .get(
      `/research/admin/experiment?${qs({ ...filters, outcome, boot: bootSeed.boot ?? 2000, seed: bootSeed.seed ?? 20261103 })}`,
    )
    .then((r) => r.data)
}

export function fetchResearchCrosstab(filters, { row, col, preset } = {}) {
  return api.get(`/research/admin/crosstab?${qs({ ...filters, row, col, preset })}`).then((r) => r.data)
}

export function fetchResearchReliability(filters) {
  return api.get(`/research/admin/reliability?${qs(filters)}`).then((r) => r.data)
}

export function fetchResearchUser(q) {
  return api.get(`/research/admin/users?${qs({ q })}`).then((r) => r.data)
}

export function fetchResearchUserTimeline(userHash) {
  return api.get(`/research/admin/users/${encodeURIComponent(userHash)}/timeline`).then((r) => r.data)
}

export function fetchBlindReviewProgress() {
  return api.get('/research/admin/blind-review/progress').then((r) => r.data)
}

export async function postResearchAdminExport(format, filters) {
  const res = await api.post(
    '/research/admin/export',
    { format, filters },
    { responseType: 'blob' },
  )
  return res.data
}
