import api from './client'

export function createSchedule(payload) {
  return api.post('/schedule', payload).then((r) => r.data)
}

export function listSchedules() {
  return api.get('/schedule').then((r) => r.data)
}

export function updateSchedule(scheduleId, payload) {
  return api.patch(`/schedule/${scheduleId}`, payload).then((r) => r.data)
}

export function deleteSchedule(scheduleId) {
  return api.delete(`/schedule/${scheduleId}`).then((r) => r.data)
}
