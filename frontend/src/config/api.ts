import axios from 'axios'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "https://solution1.demopersistent.com/api/v1"
const WS_BASE_URL = import.meta.env.VITE_WS_URL || 'ws://solution1.demopersistent.com/api/v1/chat/ws'

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
