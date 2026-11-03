import api from './client'

export function listQuestions(params = {}) {
  return api.get('/questions', { params }).then((r) => r.data)
}

export function getQuestion(questionId) {
  return api.get(`/questions/${questionId}`).then((r) => r.data)
}

export function createQuestion(payload) {
  return api.post('/questions', payload).then((r) => r.data)
}

export function uploadQuestionsFile(file) {
  const form = new FormData()
  form.append('file', file)
  return api
    .post('/questions/upload', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
      skipErrorToast: true,
    })
    .then((r) => r.data)
}
