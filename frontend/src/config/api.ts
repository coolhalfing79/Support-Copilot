const rawApiUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000/api/v1'
const rawWSUrl = import.meta.env.VITE_WS_URL || 'ws://localhost:8000/api/v1/chat/ws'

const isSecure = typeof window !== 'undefined' && window.location.protocol === 'https:'

// Automatically upgrade to https/wss if the site is served over https
const API_BASE_URL = isSecure ? rawApiUrl.replace(/^http:\/\//, 'https://') : rawApiUrl
const WS_BASE_URL = isSecure ? rawWSUrl.replace(/^ws:\/\//, 'wss://') : rawWSUrl

export { API_BASE_URL, WS_BASE_URL }
