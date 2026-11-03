import api from './client'
import useResearchStore from '../stores/researchStore'

export function fetchResearchConsent() {
  return api.get('/research/consent').then((r) => r.data)
}

export function submitResearchConsent(accepted, { experimentArm } = {}) {
  const body = { accepted }
  const arm = experimentArm || useResearchStore.getState().touchpoint?.experiment_arm
  if (accepted && arm) body.experiment_arm = arm
  return api.post('/research/consent', body).then((r) => r.data)
}

export function submitResearchFollowup(sessionId, payload, config = {}) {
  return api
    .post(`/interview/sessions/${sessionId}/research-followup`, payload, config)
    .then((r) => r.data)
}

export function fetchExperimentContext() {
  return api.get('/research/experiment').then((r) => r.data)
}

export function fetchPosttestStatus() {
  const accelerate = useResearchStore.getState().wantsAcceleratedResearch()
  return api
    .get('/research/posttest/status', {
      params: accelerate ? { research_accelerate: true } : undefined,
    })
    .then((r) => r.data)
}

export function submitPosttestAnswer(answer) {
  return api.post('/research/posttest/submit', { answer }).then((r) => r.data)
}

export function fetchResearchInvite() {
  return api.get('/research/invite').then((r) => r.data)
}

export function claimReferral(inviteCode) {
  return api.post('/research/referral/claim', { invite_code: inviteCode }).then((r) => r.data)
}

export function fetchReferralStats() {
  return api.get('/research/referral/stats').then((r) => r.data)
}

export function accelerateResearchDatesAdmin() {
  return api.post('/research/posttest/accelerate').then((r) => r.data)
}

export function postResearchEvents(events) {
  return api.post('/research/events', { events }).then((r) => r.data)
}

export function fetchSurveyPending(context) {
  return api
    .get('/research/survey/pending', { params: context ? { context } : undefined })
    .then((r) => r.data)
}

export function submitSurveyAnswers(answers) {
  return api.post('/research/survey/answer', { answers }).then((r) => r.data)
}

async function downloadResearchBlob(path, params, filename) {
  const response = await api.get(path, { params, responseType: 'blob' })
  const blob = response.data
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

export async function downloadResearchExport(format = 'jsonl', { anonymize = false } = {}) {
  const filename = format === 'csv' ? 'edgewise-research-export.csv' : 'edgewise-research-export.jsonl'
  await downloadResearchBlob('/research/export', { format, anonymize }, filename)
}

export async function downloadResearchPanelExport(format = 'jsonl', { anonymize = true } = {}) {
  const filename = format === 'csv' ? 'edgewise-research-panel.csv' : 'edgewise-research-panel.jsonl'
  await downloadResearchBlob('/research/export/panel', { format, anonymize }, filename)
}

export function triggerDailyDerive(userId) {
  return api
    .post('/research/derive/daily', null, {
      params: userId ? { user_id: userId } : undefined,
    })
    .then((r) => r.data)
}

export function fetchBlindReviewPending(limit = 10) {
  return api.get('/research/blind-review/pending', { params: { limit } }).then((r) => r.data)
}

export function submitBlindReviewScore(payload) {
  return api.post('/research/blind-review/score', payload).then((r) => r.data)
}

export const BLIND_REVIEW_RUBRIC = [
  { key: 'blind_score_material', label: '素材与内容' },
  { key: 'blind_score_structure', label: '结构组织' },
  { key: 'blind_score_evidence', label: '论据支撑' },
  { key: 'blind_score_followup', label: '追问应对' },
]
