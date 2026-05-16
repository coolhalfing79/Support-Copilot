import axios from 'axios'

declare global {
  interface Window {
    __APP_CONFIG__?: {
      API_BASE_URL?: string
      WS_BASE_URL?: string
    }
  }
}

const runtimeConfig = typeof window !== 'undefined' ? window.__APP_CONFIG__ : undefined

const API_BASE_URL =
  runtimeConfig?.API_BASE_URL ||
  import.meta.env.VITE_API_BASE_URL ||
  'http://localhost:8000/api/v1'

const WS_BASE_URL =
  runtimeConfig?.WS_BASE_URL ||
  import.meta.env.VITE_WS_URL ||
  'ws://localhost:8000/api/v1/chat/ws'

export const api = axios.create({
  baseURL: API_BASE_URL,
})

// Add a request interceptor to automatically attach the token
api.interceptors.request.use(
  (config) => {
    // Read directly from localStorage where Zustand persists the auth state
    const authStorage = localStorage.getItem('auth-storage')
    if (authStorage) {
      try {
        const parsed = JSON.parse(authStorage)
        const token = parsed?.state?.token
        if (token) {
          config.headers['Authorization'] = `Bearer ${token}`
        }
      } catch (e) {
        console.error('Failed to parse auth storage', e)
      }
    }
    return config
  },
  (error) => Promise.reject(error)
)

export { API_BASE_URL, WS_BASE_URL }
