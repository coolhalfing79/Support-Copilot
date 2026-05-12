import { useAdminStore } from '../store/adminStore'
import { StatCard } from '../components/StatCard'
import { 
  MessageSquare, 
  CheckCircle, 
  AlertCircle, 
  TrendingUp, 
  Users, 
  Activity,
  Plus, 
  Globe, 
  RefreshCw, 
  Trash2, 
  ExternalLink, 
  Loader2, 
  BookOpen,
  Filter, 
  Search, 
  ChevronRight, 
  Inbox,
  ShieldAlert
} from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { useState } from 'react'
import { StatusBadge } from '../components/StatusBadge'
import { TicketDetail } from '../components/TicketDetail'

export const AdminDashboard = () => {
  const { metrics, isLoading, error } = useAdminStore()

  if (isLoading && !metrics) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <div key={i} className="h-40 rounded-2xl bg-white/5 border border-white/10 animate-pulse" />
        ))}
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-8 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-sm text-center">
        {error}
      </div>
    )
  }

  if (!metrics) return null

  const stats = [
    {
      title: 'Total Queries',
      value: metrics.total_queries.toLocaleString(),
      icon: MessageSquare,
      color: 'text-blue-400',
      bgColor: 'bg-blue-500/20',
    },
    {
      title: 'Resolution Rate',
      value: `${metrics.resolution_rate}%`,
      icon: CheckCircle,
      color: 'text-emerald-400',
      bgColor: 'bg-emerald-500/20',
    },
    {
      title: 'Escalation Rate',
      value: `${metrics.escalation_rate}%`,
      icon: AlertCircle,
      color: 'text-rose-400',
      bgColor: 'bg-rose-500/20',
    },
    {
      title: 'Avg Confidence',
      value: metrics.avg_confidence_score.toFixed(2),
      icon: TrendingUp,
      color: 'text-purple-400',
      bgColor: 'bg-purple-500/20',
    },
    {
      title: 'Total Tickets',
      value: metrics.total_tickets.toLocaleString(),
      icon: Activity,
      color: 'text-amber-400',
      bgColor: 'bg-amber-500/20',
    },
    {
      title: 'Total Sessions',
      value: metrics.total_sessions.toLocaleString(),
      icon: Users,
      color: 'text-indigo-400',
      bgColor: 'bg-indigo-500/20',
    },
  ]

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-1">
        <h2 className="text-3xl font-bold tracking-tight text-white">System Overview</h2>
        <p className="text-sm text-white/40 font-medium">Real-time performance metrics and support activity.</p>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {stats.map((stat) => (
          <StatCard key={stat.title} {...stat} />
        ))}
      </div>

      {/* Placeholder for future Charts */}
      <div className="grid grid-cols-1 gap-6">
        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="h-64 rounded-2xl bg-white/5 border border-white/10 p-8 flex flex-col justify-end gap-4"
        >
          <div className="flex flex-col gap-1">
            <h3 className="text-lg font-bold text-white">Activity Timeline</h3>
            <p className="text-sm text-white/40">Knowledge ingestion and query volume trends.</p>
          </div>
          <div className="h-24 w-full flex items-end gap-1">
             {[...Array(40)].map((_, i) => (
               <div 
                 key={i} 
                 className="flex-1 bg-nebula-blue/20 rounded-t-sm hover:bg-nebula-blue transition-all cursor-pointer" 
                 style={{ height: `${Math.random() * 100}%` }}
               />
             ))}
          </div>
        </motion.div>
      </div>
    </div>
  )
}


// --- Sub-component: AddSourceForm ---
const AddSourceForm = () => {
  const { addKnowledgeSource, isAddingSource, error, clearError } = useAdminStore()
  const [url, setUrl] = useState('')
  const [title, setTitle] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!url.trim()) return
    
    await addKnowledgeSource(url.trim(), title.trim() || undefined)
    setUrl('')
    setTitle('')
  }

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="p-8 rounded-2xl bg-white/5 border border-white/10 space-y-6"
    >
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-xl bg-nebula-blue/20">
          <Plus className="w-5 h-5 text-nebula-blue" />
        </div>
        <h3 className="text-xl font-bold text-white">Add Knowledge Source</h3>
      </div>

      <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="flex flex-col gap-2">
          <label className="text-[10px] uppercase tracking-widest font-bold text-white/40 ml-1">Documentation URL</label>
          <div className="relative group">
            <Globe className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-white/20 group-focus-within:text-nebula-blue transition-colors" />
            <input 
              type="url"
              value={url}
              onChange={(e) => { setUrl(e.target.value); clearError() }}
              placeholder="https://docs.example.com/guide"
              required
              className="w-full bg-white/5 border border-white/10 rounded-xl py-3 pl-12 pr-4 text-sm text-white focus:outline-none focus:border-nebula-blue/50 focus:bg-white/10 transition-all"
            />
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <label className="text-[10px] uppercase tracking-widest font-bold text-white/40 ml-1">Friendly Title (Optional)</label>
          <input 
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Troubleshooting Guide"
            className="w-full bg-white/5 border border-white/10 rounded-xl py-3 px-4 text-sm text-white focus:outline-none focus:border-nebula-blue/50 focus:bg-white/10 transition-all"
          />
        </div>

        {error && (
          <div className="md:col-span-2 text-rose-400 text-xs font-medium px-4 py-2 rounded-lg bg-rose-500/10 border border-rose-500/20">
            {error}
          </div>
        )}

        <div className="md:col-span-2 flex justify-end">
          <button 
            type="submit"
            disabled={isAddingSource || !url.trim()}
            className="px-6 py-3 rounded-xl bg-nebula-blue text-white text-xs font-bold uppercase tracking-widest hover:bg-nebula-blue/80 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center gap-2 shadow-lg shadow-nebula-blue/20"
          >
            {isAddingSource ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            {isAddingSource ? 'Indexing...' : 'Ingest Source'}
          </button>
        </div>
      </form>
    </motion.div>
  )
}

// --- Sub-component: SourceList ---
const SourceList = () => {
  const { knowledgeSources, isRefreshing, reindexSource, deleteKnowledgeSource, isLoading } = useAdminStore()

  if (isLoading && knowledgeSources.length === 0) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-20 rounded-2xl bg-white/5 border border-white/10 animate-pulse" />
        ))}
      </div>
    )
  }

  if (knowledgeSources.length === 0) {
    return (
      <div className="p-20 rounded-2xl bg-white/5 border border-white/10 flex flex-col items-center justify-center text-center gap-4">
        <div className="w-12 h-12 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center">
          <BookOpen className="w-6 h-6 text-white/20" />
        </div>
        <div className="space-y-1">
          <h3 className="text-white font-medium">No Knowledge Sources</h3>
          <p className="text-white/40 text-sm max-w-xs">Add your first documentation URL above to start building your AI's expertise.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between px-2">
        <h3 className="text-sm font-bold text-white/40 uppercase tracking-widest">Active Sources ({knowledgeSources.length})</h3>
      </div>
      
      <div className="space-y-3">
        {knowledgeSources.map((source, index) => (
          <motion.div 
            layout
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            key={`${source.id}-${index}`} 
            className="p-5 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-between group hover:bg-white/10 transition-all"
          >
            <div className="flex items-center gap-4 flex-1 min-w-0">
              <div className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center flex-shrink-0">
                <Globe className="w-5 h-5 text-white/40 group-hover:text-nebula-blue transition-colors" />
              </div>
              <div className="flex flex-col gap-0.5 min-w-0">
                <div className="flex items-center gap-3">
                  <h4 className="text-white font-bold truncate">{source.title || source.url}</h4>
                  <StatusBadge status={source.status} />
                </div>
                <p className="text-xs text-white/20 truncate font-mono">{source.url}</p>
                <div className="flex items-center gap-4 mt-2">
                  <span className="text-[10px] text-white/40 uppercase tracking-widest font-bold">
                    {source.chunk_count} Chunks
                  </span>
                  <span className="text-[10px] text-white/40 uppercase tracking-widest font-bold">
                    Type: {source.source_type}
                  </span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 ml-6">
              <button 
                onClick={() => reindexSource(source.id)}
                disabled={isRefreshing === source.id}
                className="p-2.5 rounded-xl bg-white/5 border border-white/10 text-white/40 hover:text-white hover:bg-white/10 transition-all disabled:opacity-50"
                title="Re-index Source"
              >
                <RefreshCw className={`w-4 h-4 ${isRefreshing === source.id ? 'animate-spin' : ''}`} />
              </button>
              <button 
                onClick={() => window.open(source.url, '_blank')}
                className="p-2.5 rounded-xl bg-white/5 border border-white/10 text-white/40 hover:text-white hover:bg-white/10 transition-all"
                title="Open Original Source"
              >
                <ExternalLink className="w-4 h-4" />
              </button>
              <button 
                onClick={() => deleteKnowledgeSource(source.id)}
                className="p-2.5 rounded-xl bg-white/5 border border-white/10 text-rose-400/40 hover:text-rose-400 hover:bg-rose-500/10 transition-all"
                title="Delete Source"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  )
}

// --- Main Page Component ---
export const KnowledgePage = () => {
  return (
    <div className="space-y-12">
      <div className="flex flex-col gap-1">
        <h2 className="text-3xl font-bold tracking-tight text-white">Knowledge Base</h2>
        <p className="text-sm text-white/40 font-medium">Curate and maintain the data that powers your AI's intelligence.</p>
      </div>
      
      <AddSourceForm />
      <SourceList />
    </div>
  )
}


// --- Sub-component: TicketFilters ---
const TicketFilters = () => {
  const { filterStatus, setFilterStatus, filterSeverity, setFilterSeverity } = useAdminStore()

  return (
    <div className="flex flex-wrap items-center gap-4">
      <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white/5 border border-white/10">
        <Filter className="w-3.5 h-3.5 text-white/40" />
        <select 
          value={filterStatus || ''} 
          onChange={(e) => setFilterStatus(e.target.value || null)}
          className="bg-transparent text-xs font-bold text-white/60 focus:outline-none cursor-pointer uppercase tracking-widest"
        >
          <option value="">All Statuses</option>
          <option value="open">Open</option>
          <option value="in_progress">In Progress</option>
          <option value="resolved">Resolved</option>
        </select>
      </div>

      <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white/5 border border-white/10">
        <ShieldAlert className="w-3.5 h-3.5 text-white/40" />
        <select 
          value={filterSeverity || ''} 
          onChange={(e) => setFilterSeverity(e.target.value || null)}
          className="bg-transparent text-xs font-bold text-white/60 focus:outline-none cursor-pointer uppercase tracking-widest"
        >
          <option value="">All Severities</option>
          <option value="critical">Critical</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>
      </div>
      
      <div className="flex-1 min-w-[200px] relative group">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-white/20 group-focus-within:text-nebula-blue transition-colors" />
        <input 
          type="text"
          placeholder="Search tickets by summary or ID..."
          className="w-full bg-white/5 border border-white/10 rounded-xl py-2 pl-12 pr-4 text-xs text-white focus:outline-none focus:border-nebula-blue/50 focus:bg-white/10 transition-all"
        />
      </div>
    </div>
  )
}

// --- Sub-component: TicketTable ---
const TicketTable = () => {
  const { tickets, isLoading, openTicketDetail } = useAdminStore()

  if (isLoading && tickets.length === 0) {
    return (
      <div className="space-y-3">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="h-16 rounded-xl bg-white/5 border border-white/10 animate-pulse" />
        ))}
      </div>
    )
  }

  if (tickets.length === 0) {
    return (
      <div className="p-20 rounded-2xl bg-white/5 border border-white/10 flex flex-col items-center justify-center text-center gap-4">
        <div className="w-12 h-12 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center">
          <Inbox className="w-6 h-6 text-white/20" />
        </div>
        <div className="space-y-1">
          <h3 className="text-white font-medium">No Tickets Found</h3>
          <p className="text-white/40 text-sm max-w-xs">No support requests match your current filters.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="rounded-2xl border border-white/5 overflow-hidden">
      <table className="w-full text-left border-collapse">
        <thead className="bg-white/5">
          <tr>
            <th className="px-6 py-4 text-[10px] uppercase tracking-widest font-bold text-white/40">Issue</th>
            <th className="px-6 py-4 text-[10px] uppercase tracking-widest font-bold text-white/40">Severity</th>
            <th className="px-6 py-4 text-[10px] uppercase tracking-widest font-bold text-white/40">Status</th>
            <th className="px-6 py-4 text-[10px] uppercase tracking-widest font-bold text-white/40">Created</th>
            <th className="px-6 py-4 text-right"></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-white/5">
          {tickets.map((ticket, index) => (
            <motion.tr 
              key={`${ticket.id}-${index}`}
              onClick={() => openTicketDetail(ticket)}
              className="hover:bg-white/5 cursor-pointer transition-colors group"
            >
              <td className="px-6 py-4">
                <div className="flex flex-col gap-0.5 max-w-md">
                   <span className="text-xs font-bold text-white/80 group-hover:text-white transition-colors truncate">
                     {ticket.summary}
                   </span>
                   <span className="text-[10px] text-white/20 uppercase tracking-widest font-bold">
                     {ticket.jira_issue_key || ticket.id.slice(0, 8)}
                   </span>
                </div>
              </td>
              <td className="px-6 py-4">
                 <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider border
                  ${ticket.severity === 'critical' ? 'bg-rose-500/10 text-rose-400 border-rose-500/20' : 
                    ticket.severity === 'high' ? 'bg-orange-500/10 text-orange-400 border-orange-500/20' :
                    'bg-blue-500/10 text-blue-400 border-blue-500/20'}`}
                 >
                   {ticket.severity}
                 </span>
              </td>
              <td className="px-6 py-4">
                 <span className="text-[10px] text-white/40 font-bold uppercase tracking-widest">
                   {ticket.status}
                 </span>
              </td>
              <td className="px-6 py-4">
                 <span className="text-[10px] text-white/20 font-bold uppercase tracking-widest">
                   {new Date(ticket.created_at).toLocaleDateString()}
                 </span>
              </td>
              <td className="px-6 py-4 text-right">
                <ChevronRight className="w-4 h-4 text-white/10 group-hover:text-nebula-blue group-hover:translate-x-1 transition-all inline-block" />
              </td>
            </motion.tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// --- Main Page Component ---
export const TicketsPage = () => {
  const { selectedTicket, closeTicketDetail } = useAdminStore()

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-1">
        <h2 className="text-3xl font-bold tracking-tight text-white">Ticket Oversight</h2>
        <p className="text-sm text-white/40 font-medium">Review, track, and manage escalated support requests.</p>
      </div>

      <div className="space-y-6">
        <TicketFilters />
        <TicketTable />
      </div>

      <AnimatePresence>
        {selectedTicket && (
          <TicketDetail 
            ticket={selectedTicket} 
            onClose={closeTicketDetail} 
          />
        )}
      </AnimatePresence>
    </div>
  )
}
