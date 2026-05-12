import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import axios from 'axios'
import { API_BASE_URL } from '../config/api'

interface User {
  id: string
  name: string
  email: string
  role: string
  avatar?: string
}

interface AuthState {
  user: User | null
  token: string | null
  isAuthenticated: boolean
  
  // Actions
  login: (email: string, password: string) => Promise<void>
  register: (username: string, email: string, password: string) => Promise<void>
  logout: () => void
}

const api = axios.create({
  baseURL: API_BASE_URL,
})

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      token: null,
      isAuthenticated: false,

      login: async (email, password) => {
        try {
          const response = await api.post('/auth/login', { email, password })
          const { access_token } = response.data
          
          // In a real app, you might decode the JWT or fetch user details
          // For now, we'll set a mock user but with real authentication success
          const mockUser: User = {
            id: 'user-' + email,
            name: email.split('@')[0],
            email: email,
            role: 'agent',
            avatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=${email}`
          }
          
          set({ 
            user: mockUser, 
            token: access_token, 
            isAuthenticated: true 
          })
          
          // Set axios default header
          axios.defaults.headers.common['Authorization'] = `Bearer ${access_token}`
        } catch (err) {
          console.error('Login failed', err)
          throw err
        }
      },

      register: async (username, email, password) => {
        try {
          await api.post('/auth/register', { username, email, password })
        } catch (err) {
          console.error('Registration failed', err)
          throw err
        }
      },

      logout: () => {
        set({ user: null, token: null, isAuthenticated: false })
        delete axios.defaults.headers.common['Authorization']
        localStorage.removeItem('auth-storage')
      }
    }),
    {
      name: 'auth-storage',
    }
  )
)
