import axios from 'axios'
import { showToast } from '../stores/toastStore'

const TOKEN_KEY = 'edgewise-auth'

function readPersistedToken() {
  try {
    const raw = localStorage.getItem(TOKEN_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    return parsed?.state?.accessToken || null
  } catch {
    return null
  }
}

const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE || '/api/v1',
  timeout: 30000,
})

api.interceptors.request.use((config) => {
  const token = readPersistedToken()
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      import('../stores/authStore')
        .then(({ default: useAuthStore }) => {
          useAuthStore.setState({
            user: null,
            accessToken: null,
            isAuthenticated: false,
            bootstrapped: true,
          })
        })
        .catch(() => {
          try {
            const raw = localStorage.getItem(TOKEN_KEY)
            if (raw) {
              const parsed = JSON.parse(raw)
              parsed.state = {
                ...(parsed.state || {}),
                user: null,
                accessToken: null,
                isAuthenticated: false,
              }
              localStorage.setItem(TOKEN_KEY, JSON.stringify(parsed))
            }
          } catch {
            /* ignore */
          }
        })
      const path = window.location.pathname
      const isPublicEntry =
        path === '/login' ||
        path === '/promo' ||
        path.startsWith('/s/') ||
        path.startsWith('/pair/') ||
        path.startsWith('/invite/') ||
        path.startsWith('/org/join/')
      if (!isPublicEntry) {
        const returnTo = `${window.location.pathname}${window.location.search}`
        const dest =
          returnTo && returnTo !== '/'
            ? `/login?redirect=${encodeURIComponent(returnTo)}`
            : '/login'
        window.location.assign(dest)
      }
    } else if (!error.config?.skipErrorToast) {
      showToast(getErrorMessage(error), 'error')
    }
    return Promise.reject(error)
  }
)

export function getErrorMessage(error, fallback = '请求失败') {
  const detail = error?.response?.data?.detail
  if (typeof detail === 'string') return detail
  if (Array.isArray(detail) && detail[0]?.msg) return detail[0].msg
  return error?.message || fallback
}

export default api
