import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Plus, MessageSquare, Clock, ChevronRight, Ticket } from 'lucide-react'
import { useUserStore } from '../store/userStore'
import { cn } from '../lib/utils'

export const TicketsLandingPage = () => {
  const { sessions, fetchSessions, clearMessages } = useUserStore()
  const navigate = useNavigate()

  useEffect(() => {
    fetchSessions()
  }, [fetchSessions])

  const handleNewTicket = () => {
    clearMessages()
    const newId = crypto.randomUUID()
    navigate(`/chat/${newId}`)
  }

  return (
    <div className="flex flex-col gap-8 py-4">
      {/* Hero Section */}
      <div className="flex flex-col md:flex-row items-center justify-between gap-6">
        <div>
          <h1 className="text-3xl font-bold text-white mb-2">My Tickets</h1>
          <p className="text-white/40 text-sm">
            Manage your support requests and view history.
          </p>
        </div>
        <button
          onClick={handleNewTicket}
          className="flex items-center gap-2 px-6 py-3 rounded-2xl bg-gradient-to-r from-nebula-blue to-nebula-purple text-white font-bold text-sm shadow-lg shadow-nebula-blue/20 hover:scale-105 transition-transform"
        >
          <Plus className="w-5 h-5" />
          NEW TICKET
        </button>
      </div>

      {/* Tickets List */}
      <div className="grid grid-cols-1 gap-4">
        {sessions.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center glass-panel rounded-3xl border-white/5">
            <div className="w-16 h-16 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center mb-6">
              <Ticket className="w-8 h-8 text-white/20" />
            </div>
            <h3 className="text-xl font-bold text-white mb-2">No tickets yet</h3>
            <p className="text-white/40 text-sm max-w-xs mb-8">
              Start your first conversation to get help with technical issues.
            </p>
            <button
              onClick={handleNewTicket}
              className="px-8 py-3 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 text-white text-sm font-bold transition-all"
            >
              CREATE TICKET
            </button>
          </div>
        ) : (
          sessions.map((session, index) => (
            <motion.div
              key={session.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.05 }}
              onClick={() => navigate(`/chat/${session.id}`)}
              className="group glass-panel p-5 rounded-2xl border border-white/5 hover:border-white/10 hover:bg-white/[0.02] cursor-pointer transition-all flex items-center justify-between gap-4"
            >
              <div className="flex items-center gap-4 min-w-0">
                <div className="w-12 h-12 rounded-xl bg-nebula-blue/10 border border-nebula-blue/20 flex items-center justify-center flex-shrink-0 group-hover:scale-110 transition-transform">
                  <MessageSquare className="w-6 h-6 text-nebula-blue" />
                </div>
                <div className="min-w-0">
                  <h3 className="text-white font-bold truncate group-hover:text-nebula-blue transition-colors">
                    {session.title || 'Untitled Ticket'}
                  </h3>
                  <div className="flex items-center gap-3 mt-1">
                    <span className="flex items-center gap-1 text-[10px] text-white/30 uppercase tracking-widest font-bold">
                      <Clock className="w-3 h-3" />
                      {new Date(session.created_at).toLocaleDateString()}
                    </span>
                    <span className={cn(
                      "px-2 py-0.5 rounded-full text-[8px] font-black uppercase tracking-tighter border",
                      session.status === 'active' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' :
                      session.status === 'escalated' ? 'bg-amber-500/10 text-amber-400 border-amber-500/20' :
                      'bg-white/5 text-white/40 border-white/10'
                    )}>
                      {session.status}
                    </span>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <div className="hidden sm:flex flex-col items-end">
                   <p className="text-[10px] text-white/20 font-bold uppercase tracking-widest">Reference</p>
                   <p className="text-xs text-white/40 font-mono">#{session.id.slice(0, 8)}</p>
                </div>
                <ChevronRight className="w-5 h-5 text-white/10 group-hover:text-white/40 transition-colors" />
              </div>
            </motion.div>
          ))
        )}
      </div>
    </div>
  )
}
