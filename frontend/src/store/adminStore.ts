import { create } from 'zustand'
import axios, { AxiosError } from 'axios'
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
  jira_issue_id?: string
  summary: string
  description?: string
  severity: 'low' | 'medium' | 'high' | 'critical'
  status: 'open' | 'in_progress' | 'resolved' | 'closed'
  product_module?: string
  environment?: string
  error_messages?: string
  steps_to_reproduce?: string
  jira_comments?: Array<{
    id: string
    body: string
    author?: string
    created: string
    source: string
  }>
  assignee?: string
  jira_synced: boolean
  created_at: string
}

export interface IssueType {
  id: string
  name: string
  subtask: boolean
  iconUrl?: string
}

export interface MetricOverview {
  total_queries: number
  resolution_rate: number
  escalation_rate: number
  avg_confidence_score: number
  total_tickets: number
  total_sessions: number
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
  setFilterStatus: (status: string | null) => void
  setFilterSeverity: (severity: string | null) => void
  openTicketDetail: (ticket: Ticket) => void
  closeTicketDetail: () => void
  syncTicket: (id: string) => Promise<void>
  addTicketComment: (id: string, comment: string) => Promise<void>
  loadIssueTypes: () => Promise<IssueType[]>
  loadMetrics: () => Promise<void>
  clearError: () => void
}

const api = axios.create({
  baseURL: API_BASE_URL,
})

export const useAdminStore = create<AdminState>((set, get) => ({
  // Initial state
  knowledgeSources: [],
  isAddingSource: false,
  isRefreshing: null,
  tickets: [],
  filterStatus: null,
  filterSeverity: null,
  selectedTicket: null,
  metrics: null,
  isLoading: false,
  error: null,
  
  // Knowledge actions
  loadKnowledgeSources: async () => {
    set({ isLoading: true, error: null })
    try {
      const response = await api.get('/knowledge/sources')
      set({ knowledgeSources: response.data.sources || response.data, isLoading: false })
    } catch (err: unknown) {
      const axiosError = err as AxiosError<{ message?: string }>
      set({ error: axiosError.response?.data?.message || 'Failed to load sources', isLoading: false })
    }
  },
  
  addKnowledgeSource: async (url, title) => {
    set({ isAddingSource: true, error: null })
    try {
      const response = await api.post('/knowledge/sources', { url, title })
      set((state) => ({
        knowledgeSources: [response.data, ...state.knowledgeSources],
        isAddingSource: false,
      }))
    } catch (err: unknown) {
      const axiosError = err as AxiosError<{ message?: string }>
      set({ error: axiosError.response?.data?.message || 'Failed to add source', isAddingSource: false })
    }
  },
  
  deleteKnowledgeSource: async (id) => {
    try {
      await api.delete(`/knowledge/sources/${id}`)
      set((state) => ({
        knowledgeSources: state.knowledgeSources.filter((s) => s.id !== id),
      }))
    } catch (err: unknown) {
      const axiosError = err as AxiosError<{ message?: string }>
      set({ error: axiosError.response?.data?.message || 'Failed to delete source' })
    }
  },
  
  reindexSource: async (id) => {
    set({ isRefreshing: id })
    try {
      await api.post(`/knowledge/sources/${id}/reindex`)
      set((state) => ({
        knowledgeSources: state.knowledgeSources.map((s) =>
          s.id === id ? { ...s, status: 'processing' as const } : s
        ),
        isRefreshing: null,
      }))
    } catch (err: unknown) {
      const axiosError = err as AxiosError<{ message?: string }>
      set({ error: axiosError.response?.data?.message || 'Failed to re-index', isRefreshing: null })
    }
  },
  
  // Ticket actions
  loadTickets: async () => {
    set({ isLoading: true, error: null })
    try {
      const { filterStatus, filterSeverity } = get()
      const params: Record<string, string> = {}
      if (filterStatus) params.status = filterStatus
      if (filterSeverity) params.severity = filterSeverity
      
      const response = await api.get('/tickets', { params })
      set({ tickets: response.data.tickets || response.data, isLoading: false })
    } catch (err: unknown) {
      const axiosError = err as AxiosError<{ message?: string }>
      set({ error: axiosError.response?.data?.message || 'Failed to load tickets', isLoading: false })
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
  
  syncTicket: async (id) => {
    set({ isLoading: true, error: null })
    try {
      const response = await api.get(`/tickets/${id}?refresh=true`)
      const updatedTicket = response.data.ticket || response.data
      set((state) => ({
        tickets: state.tickets.map((t) => (t.id === id ? updatedTicket : t)),
        selectedTicket: state.selectedTicket?.id === id ? updatedTicket : state.selectedTicket,
        isLoading: false,
      }))
    } catch (err: unknown) {
      const axiosError = err as AxiosError<{ message?: string }>
      set({ error: axiosError.response?.data?.message || 'Failed to sync ticket', isLoading: false })
    }
  },

  addTicketComment: async (id, comment) => {
    set({ error: null })
    try {
      await api.post(`/tickets/${id}/comment`, { comment, source: 'admin' })
      // Reload ticket to get updated comments
      const response = await api.get(`/tickets/${id}`)
      const updatedTicket = response.data.ticket || response.data
      set((state) => ({
        tickets: state.tickets.map((t) => (t.id === id ? updatedTicket : t)),
        selectedTicket: state.selectedTicket?.id === id ? updatedTicket : state.selectedTicket,
      }))
    } catch (err: unknown) {
      const axiosError = err as AxiosError<{ message?: string }>
      set({ error: axiosError.response?.data?.message || 'Failed to add comment' })
    }
  },

  loadIssueTypes: async () => {
    try {
      const response = await api.get('/tickets/jira/issue-types')
      return response.data.issue_types || response.data
    } catch (err: unknown) {
      const axiosError = err as AxiosError<{ message?: string }>
      set({ error: axiosError.response?.data?.message || 'Failed to load issue types' })
      return []
    }
  },

  // Analytics actions
  loadMetrics: async () => {
    set({ isLoading: true, error: null })
    try {
      const response = await api.get('/analytics/overview')
      // Map response to MetricOverview
      const data = response.data.metrics || response.data
      set({ metrics: data, isLoading: false })
    } catch (err: unknown) {
      const axiosError = err as AxiosError<{ message?: string }>
      set({ error: axiosError.response?.data?.message || 'Failed to load metrics', isLoading: false })
    }
  },
  
  clearError: () => set({ error: null }),
}))
