import api from './client'

export function postCopilotTriage(body) {
  return api
    .post('/copilot/triage', body, { skipErrorToast: true })
    .then((r) => r.data)
}

export function postCopilotMicroDone(body) {
  return api
    .post('/copilot/triage/micro-done', body, { skipErrorToast: true })
    .then((r) => r.data)
}
