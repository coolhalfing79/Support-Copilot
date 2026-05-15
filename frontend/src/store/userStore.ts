import { create } from 'zustand'
import { api } from '../config/api'

export interface SourceInfo {
  source_id: string
  title: string
  chunk_excerpt: string
  url?: string
}

export interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: string
  action?: 'resolve' | 'clarification' | 'escalated'
  suggestions?: string[]
  sources?: SourceInfo[]
}

export interface Session {
  id: string
  title: string
  status: string
  created_at: string
}

interface UserState {
  sessionId: string | null
  sessions: Session[]
  messages: Message[]
  isStreaming: boolean
  isHistoryLoading: boolean
  isConnected: boolean
  availableSources: { id: string; title?: string; url: string; status: string }[]
  selectedSources: string[]
  
  // Actions
  setSessionId: (id: string) => void
  addMessage: (message: Message) => void
  updateLastMessage: (content: string) => void
  setStreaming: (isStreaming: boolean) => void
  setHistoryLoading: (isLoading: boolean) => void
  setConnected: (isConnected: boolean) => void
  clearMessages: () => void
  setMessages: (messages: Message[]) => void
  fetchSessions: () => Promise<void>
  fetchSessionHistory: (id: string) => Promise<void>
  fetchAvailableSources: () => Promise<void>
  toggleSourceSelection: (sourceId: string) => void
}



export const useUserStore = create<UserState>((set) => ({
  sessionId: null,
  sessions: [],
  messages: [],
  isStreaming: false,
  isHistoryLoading: false,
  isConnected: true,
  availableSources: [],
  selectedSources: [],

  setSessionId: (id) => set({ sessionId: id }),
  
  addMessage: (message) => set((state) => ({ 
    messages: [...state.messages, message] 
  })),

  updateLastMessage: (content) => set((state) => {
    const newMessages = [...state.messages]
    if (newMessages.length > 0) {
      const lastMessage = newMessages[newMessages.length - 1]
      if (lastMessage.role === 'assistant') {
        newMessages[newMessages.length - 1] = { 
          ...lastMessage, 
          content: lastMessage.content + content 
        }
      }
    }
    return { messages: newMessages }
  }),

  setStreaming: (isStreaming) => set({ isStreaming }),
  
  setHistoryLoading: (isLoading) => set({ isHistoryLoading: isLoading }),

  setConnected: (isConnected) => set({ isConnected }),

  clearMessages: () => set({ messages: [] }),

  setMessages: (messages) => set({ messages }),

  fetchSessions: async () => {
    try {
      const response = await api.get('/chat/sessions')
      const sessions = response.data.sessions || response.data
      set({ sessions })
    } catch (err) {
      console.error('Failed to load sessions', err)
    }
  },

  fetchSessionHistory: async (id) => {
    set({ isHistoryLoading: true })
    try {
      const response = await api.get(`/chat/sessions/${id}`)
      const serverMessages = response.data.messages || []
      
      set((state) => {
        // Only overwrite if we don't have new local messages in flight
        // or if the server actually returned history.
        if (state.messages.length > 0 && serverMessages.length === 0) {
           return { isHistoryLoading: false }
        }
        return { messages: serverMessages, isHistoryLoading: false }
      })
    } catch (err: any) {
      if (err.response?.status === 404) {
        // New session, no history yet - this is fine
        set({ messages: [], isHistoryLoading: false })
      } else {
        console.error('Failed to load session history', err)
        set({ isHistoryLoading: false })
      }
    }
  },

  fetchAvailableSources: async () => {
    try {
      const response = await api.get('/knowledge/sources')
      const sources = response.data.sources || response.data
      set({ availableSources: sources })
    } catch (err) {
      console.error('Failed to load knowledge sources', err)
    }
  },

  toggleSourceSelection: (sourceId) => set((state) => {
    const isSelected = state.selectedSources.includes(sourceId)
    return {
      selectedSources: isSelected
        ? state.selectedSources.filter(id => id !== sourceId)
        : [...state.selectedSources, sourceId]
    }
  }),
}))
