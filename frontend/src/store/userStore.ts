import { create } from 'zustand'
import axios from 'axios'
import { API_BASE_URL } from '../config/api'

export interface SourceInfo {
  source_id: string
  title: string
  chunk_excerpt: string
  url?: string
}

export interface GraphNode {
  id: string
  label: string
  type: string
  x?: number
  y?: number
}

export interface GraphEdge {
  id: string
  source: string
  target: string
  label: string
}

export interface GraphData {
  nodes: GraphNode[]
  edges: GraphEdge[]
}

export interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: string
  action?: 'resolve' | 'clarification' | 'escalated'
  suggestions?: string[]
  sources?: SourceInfo[]
  graph?: GraphData
  key_points?: string[]
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
  currentGraph: GraphData | null
  currentGraphQuery: string | null
  
  // Actions
  setSessionId: (id: string) => void
  addMessage: (message: Message) => void
  updateLastMessage: (content: string) => void
  setCurrentGraph: (graph: GraphData | null, query?: string | null) => void
  setStreaming: (isStreaming: boolean) => void
  setHistoryLoading: (isLoading: boolean) => void
  setConnected: (isConnected: boolean) => void
  clearMessages: () => void
  setMessages: (messages: Message[]) => void
  fetchSessions: () => Promise<void>
  fetchSessionHistory: (id: string) => Promise<void>
  fetchAvailableSources: () => Promise<void>
  toggleSourceSelection: (sourceId: string) => void
  createTicket: (sessionId: string, messageId: string) => Promise<any>
}

import apiClient from '../api/client'

export const useUserStore = create<UserState>((set) => ({
  sessionId: null,
  sessions: [],
  messages: [],
  isStreaming: false,
  isHistoryLoading: false,
  isConnected: true,
  availableSources: [],
  selectedSources: [],
  currentGraph: null,
  currentGraphQuery: null,

  setSessionId: (id) => set({ sessionId: id }),
  
  addMessage: (message) => set((state) => ({ 
    messages: [...state.messages, message] 
  })),

  setCurrentGraph: (graph, query = null) => set({ 
    currentGraph: graph,
    currentGraphQuery: query || null
  }),

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
      const response = await apiClient.get('/chat/sessions')
      const sessions = response.data.sessions || response.data
      set({ sessions })
    } catch (err) {
      console.error('Failed to load sessions', err)
    }
  },

  fetchSessionHistory: async (id) => {
    set({ isHistoryLoading: true })
    try {
      const response = await apiClient.get(`/chat/sessions/${id}`)
      const messages = response.data.messages || []
      set({ messages, isHistoryLoading: false })
    } catch (err: any) {
      if (err.response?.status === 404) {
        // New session, no history yet. Just clear messages.
        set({ messages: [], isHistoryLoading: false })
      } else {
        console.error('Failed to load session history', err)
        set({ isHistoryLoading: false })
      }
    }
  },

  fetchAvailableSources: async () => {
    try {
      const response = await apiClient.get('/knowledge/sources')
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

  createTicket: async (sessionId: string, messageId: string) => {
    try {
      const response = await apiClient.post('/tickets/escalate', { session_id: sessionId })
      // The API returns { ticket: { ... }, jira_key: "..." }
      const ticket = response.data.ticket
      
      set(state => ({
        messages: state.messages.map(msg => 
          msg.id === messageId ? { ...msg, ticket } : msg
        )
      }))
      return ticket
    } catch (err) {
      console.error('Failed to create ticket', err)
      throw err
    }
  },
}))
