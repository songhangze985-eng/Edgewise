import api from './client'

export function register({ email, password, name }) {
  return api.post('/auth/register', { email, password, name }).then((r) => r.data)
}

export function login({ email, password }) {
  return api.post('/auth/login', { email, password }).then((r) => r.data)
}

export function fetchMe() {
  return api.get('/auth/me').then((r) => r.data)
}

export function logout() {
  return api.post('/auth/logout').then((r) => r.data)
}
