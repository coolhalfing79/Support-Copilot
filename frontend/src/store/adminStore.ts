import { create } from 'zustand'
import axios from 'axios'
import { API_BASE_URL } from '../config/api'

export interface KnowledgeSource {
  id: string
  url: string
  title?: string
  source_type: string
  status: 'pending' | 'processing' | 'indexed' | 'error'
  chunk_count: number
  last_indexed_at?: string
  created_at: string
}

export interface Ticket {
  id: string
  jira_issue_key?: string
  summary: string
  severity: 'low' | 'medium' | 'high' | 'critical'
  status: 'open' | 'in_progress' | 'resolved' | 'closed'
  product_module?: string
  created_at: string
}

export interface MetricOverview {
  total_queries: number
  resolution_rate: number
  escalation_rate: number
  avg_confidence_score: number
  total_tickets: number
  total_sessions: number
}

export interface Feedback {
  id: string
  rating: number
  comment: string
  category: string
  user_id?: string
  created_at: string
}

interface AdminState {
  // Knowledge state
  knowledgeSources: KnowledgeSource[]
  isAddingSource: boolean
  isRefreshing: string | null // source ID being refreshed
  
  // Ticket state
  tickets: Ticket[]
  filterStatus: string | null
  filterSeverity: string | null
  selectedTicket: Ticket | null
  
  // Feedback state
  feedbacks: Feedback[]
  
  // Analytics state
  metrics: MetricOverview | null
  isLoading: boolean
  error: string | null
  
  // Actions
  loadKnowledgeSources: () => Promise<void>
  addKnowledgeSource: (url: string, title?: string) => Promise<void>
  deleteKnowledgeSource: (id: string) => Promise<void>
  reindexSource: (id: string) => Promise<void>
  loadTickets: () => Promise<void>
  loadFeedbacks: () => Promise<void>
  setFilterStatus: (status: string | null) => void
  setFilterSeverity: (severity: string | null) => void
  openTicketDetail: (ticket: Ticket) => void
  closeTicketDetail: () => void
  loadMetrics: () => Promise<void>
  clearError: () => void
}

import apiClient from '../api/client'

export const useAdminStore = create<AdminState>((set, get) => ({
  // Initial state
  knowledgeSources: [],
  isAddingSource: false,
  isRefreshing: null,
  tickets: [],
  filterStatus: null,
  filterSeverity: null,
  selectedTicket: null,
  feedbacks: [],
  metrics: null,
  isLoading: false,
  error: null,
  
  // Knowledge actions
  loadKnowledgeSources: async () => {
    set({ isLoading: true, error: null })
    try {
      const response = await apiClient.get('/knowledge/sources')
      set({ knowledgeSources: response.data.sources || response.data, isLoading: false })
    } catch (err: any) {
      set({ error: err.response?.data?.message || 'Failed to load sources', isLoading: false })
    }
  },
  
  addKnowledgeSource: async (url, title) => {
    set({ isAddingSource: true, error: null })
    try {
      const response = await apiClient.post('/knowledge/sources', { url, title })
      set((state) => ({
        knowledgeSources: [response.data, ...state.knowledgeSources],
        isAddingSource: false,
      }))
    } catch (err: any) {
      set({ error: err.response?.data?.message || 'Failed to add source', isAddingSource: false })
    }
  },
  
  deleteKnowledgeSource: async (id) => {
    try {
      await apiClient.delete(`/knowledge/sources/${id}`)
      set((state) => ({
        knowledgeSources: state.knowledgeSources.filter((s) => s.id !== id),
      }))
    } catch (err: any) {
      set({ error: err.response?.data?.message || 'Failed to delete source' })
    }
  },
  
  reindexSource: async (id) => {
    set({ isRefreshing: id })
    try {
      await apiClient.post(`/knowledge/sources/${id}/reindex`)
      set((state) => ({
        knowledgeSources: state.knowledgeSources.map((s) =>
          s.id === id ? { ...s, status: 'processing' as const } : s
        ),
        isRefreshing: null,
      }))
    } catch (err: any) {
      set({ error: err.response?.data?.message || 'Failed to re-index', isRefreshing: null })
    }
  },
  
  // Ticket actions
  loadTickets: async () => {
    set({ isLoading: true, error: null })
    try {
      const { filterStatus, filterSeverity } = get()
      const params: any = {}
      if (filterStatus) params.status = filterStatus
      if (filterSeverity) params.severity = filterSeverity
      
      const response = await apiClient.get('/tickets', { params })
      set({ tickets: response.data.tickets || response.data, isLoading: false })
    } catch (err: any) {
      set({ error: err.response?.data?.message || 'Failed to load tickets', isLoading: false })
    }
  },
  
  setFilterStatus: (status) => {
    set({ filterStatus: status })
    get().loadTickets()
  },

  setFilterSeverity: (severity) => {
    set({ filterSeverity: severity })
    get().loadTickets()
  },
  
  openTicketDetail: (ticket) => set({ selectedTicket: ticket }),
  closeTicketDetail: () => set({ selectedTicket: null }),

  loadFeedbacks: async () => {
    set({ isLoading: true, error: null })
    try {
      const response = await apiClient.get('/feedback')
      // Ensure we handle both direct array response and wrapped object
      const data = Array.isArray(response.data) ? response.data : (response.data.feedbacks || [])
      set({ feedbacks: data, isLoading: false })
    } catch (err: any) {
      const errorDetail = err.response?.data?.error?.message || err.response?.data?.detail || err.message || 'Failed to load feedbacks'
      set({ error: errorDetail, isLoading: false })
    }
  },
  
  // Analytics actions
  loadMetrics: async () => {
    set({ isLoading: true, error: null })
    try {
      const response = await apiClient.get('/analytics/overview')
      // Map response to MetricOverview
      const data = response.data.metrics || response.data
      set({ metrics: data, isLoading: false })
    } catch (err: any) {
      set({ error: err.response?.data?.message || 'Failed to load metrics', isLoading: false })
    }
  },
  
  clearError: () => set({ error: null }),
}))
