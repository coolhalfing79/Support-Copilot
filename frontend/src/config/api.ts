import axios from 'axios'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8080/api/v1'
const WS_BASE_URL = import.meta.env.VITE_WS_URL || 'ws://localhost:8080/api/v1/chat/ws'

const apiClient = axios.create({
  baseURL: API_BASE_URL,
})

export { API_BASE_URL, WS_BASE_URL, apiClient }
export default apiClient
