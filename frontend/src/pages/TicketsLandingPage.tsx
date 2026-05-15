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
          <h1 className="text-3xl font-bold text-[#161616] mb-2">History</h1>
          <p className="text-[#525252] text-sm">
            Manage your support requests and view history.
          </p>
        </div>
        <button
          onClick={handleNewTicket}
          className="flex items-center gap-2 px-6 py-3 rounded-2xl bg-[#0f62fe] text-white font-bold text-sm shadow-md shadow-[#0f62fe]/20 hover:scale-105 transition-transform"
        >
          <Plus className="w-5 h-5" />
          NEW CHAT
        </button>
      </div>

      {/* History List */}
      <div className="grid grid-cols-1 gap-4">
        {sessions.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center bg-[#ffffff] rounded-3xl border border-[#e0e0e0] shadow-sm">
            <div className="w-16 h-16 rounded-2xl bg-[#f4f4f4] border border-[#e0e0e0] flex items-center justify-center mb-6">
              <Ticket className="w-8 h-8 text-[#a8a8a8]" />
            </div>
            <h3 className="text-xl font-bold text-[#161616] mb-2">No history yet</h3>
            <p className="text-[#525252] text-sm max-w-xs mb-8">
              Start your first conversation to get help with technical issues.
            </p>
            <button
              onClick={handleNewTicket}
              className="px-8 py-3 rounded-xl bg-[#ffffff] border border-[#0f62fe] hover:bg-[#0f62fe] text-[#0f62fe] hover:text-white text-sm font-bold transition-all"
            >
              NEW CHAT
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
              className="group bg-[#ffffff] p-5 rounded-2xl border border-[#e0e0e0] hover:border-[#0f62fe] shadow-sm cursor-pointer transition-all flex items-center justify-between gap-4"
            >
              <div className="flex items-center gap-4 min-w-0">
                <div className="w-12 h-12 rounded-xl bg-[#0f62fe]/10 border border-[#0f62fe]/20 flex items-center justify-center flex-shrink-0 group-hover:scale-110 transition-transform">
                  <MessageSquare className="w-6 h-6 text-[#0f62fe]" />
                </div>
                <div className="min-w-0">
                  <h3 className="text-[#161616] font-bold truncate group-hover:text-[#0f62fe] transition-colors">
                    {session.title || 'Untitled Chat'}
                  </h3>
                  <div className="flex items-center gap-3 mt-1">
                    <span className="flex items-center gap-1 text-[10px] text-[#a8a8a8] uppercase tracking-widest font-bold">
                      <Clock className="w-3 h-3" />
                      {new Date(session.created_at).toLocaleDateString()}
                    </span>
                    <span className={cn(
                      "px-2 py-0.5 rounded-full text-[8px] font-black uppercase tracking-tighter border",
                      session.status === 'active' ? 'bg-[#24a148]/10 text-[#24a148] border-[#24a148]/20' :
                      session.status === 'escalated' ? 'bg-[#f1c21b]/10 text-[#f1c21b] border-[#f1c21b]/20' :
                      'bg-[#e0e0e0] text-[#525252] border-[#c6c6c6]'
                    )}>
                      {session.status}
                    </span>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <div className="hidden sm:flex flex-col items-end">
                   <p className="text-[10px] text-[#a8a8a8] font-bold uppercase tracking-widest">Reference</p>
                   <p className="text-xs text-[#525252] font-mono">#{session.id.slice(0, 8)}</p>
                </div>
                <ChevronRight className="w-5 h-5 text-[#c6c6c6] group-hover:text-[#0f62fe] transition-colors" />
              </div>
            </motion.div>
          ))
        )}
      </div>
    </div>
  )
}
