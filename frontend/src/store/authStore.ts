import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { api } from '../config/api'

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
  register: (username: string, email: string, password: string, role?: string) => Promise<void>
  logout: () => void
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      token: null,
      isAuthenticated: false,

      login: async (email, password) => {
        try {
          const response = await api.post('/auth/login', { email, password })
          const { access_token, role, name, id } = response.data
          
          const user: User = {
            id: id,
            name: name,
            email: email,
            role: role,
            avatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=${email}`
          }
          
          set({ 
            user: user, 
            token: access_token, 
            isAuthenticated: true 
          })
        } catch (err: unknown) {
          console.error('Login failed', err)
          throw err
        }
      },

      register: async (username, email, password, role) => {
        try {
          await api.post('/auth/register', { username, email, password, role })
        } catch (err: unknown) {
          console.error('Registration failed', err)
          throw err
        }
      },

      logout: () => {
        set({ user: null, token: null, isAuthenticated: false })
        localStorage.removeItem('auth-storage')
      }
    }),
    {
      name: 'auth-storage',
    }
  )
)
