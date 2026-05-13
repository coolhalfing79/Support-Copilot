const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api/v1'
const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
const WS_BASE_URL = import.meta.env.VITE_WS_URL || `${protocol}//${window.location.host}/api/v1/chat/ws`

export { API_BASE_URL, WS_BASE_URL }
