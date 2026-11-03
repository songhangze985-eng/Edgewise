import api from './client'

export function createJob(payload) {
  return api.post('/jobs', payload).then((r) => r.data)
}

export function listJobs() {
  return api.get('/jobs').then((r) => r.data)
}

export function deleteJob(jobId) {
  return api.delete(`/jobs/${jobId}`).then((r) => r.data)
}

export function getJobMatch(jobId, resumeId) {
  return api
    .get(`/jobs/${jobId}/match`, { params: { resume_id: resumeId } })
    .then((r) => r.data)
}
