import api from './client'

export function uploadResume(file) {
  const form = new FormData()
  form.append('file', file)
  return api
    .post('/resume/upload', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
      skipErrorToast: true,
    })
    .then((r) => r.data)
}
