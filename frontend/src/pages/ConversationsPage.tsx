import { useEffect, useState, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { MessageSquare, Calendar, Clock, ChevronRight, Search, Filter, History, MoreVertical } from 'lucide-react'
import { useUserStore } from '../store/userStore'

export const ConversationsPage = () => {
  const { sessions, fetchSessions } = useUserStore()
  const [searchTerm, setSearchTerm] = useState('')

  useEffect(() => {
    fetchSessions()
  }, [fetchSessions])

  const filteredSessions = useMemo(() => {
    return sessions.filter(session => 
      (session.title || 'Untitled Conversation').toLowerCase().includes(searchTerm.toLowerCase())
    )
  }, [sessions, searchTerm])

  return (
    <div className="flex flex-col h-full bg-white">
      <header className="h-20 flex items-center justify-between px-8 border-b border-gray-100 shrink-0 bg-white/80 backdrop-blur-md sticky top-0 z-10">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Conversations</h1>
          <p className="text-sm text-gray-500">Manage and revisit your past AI interactions.</p>
        </div>
        
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input 
              type="text" 
              placeholder="Search conversations..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 transition-all w-80"
            />
          </div>
          <button className="flex items-center gap-2 px-4 py-2 rounded-xl border border-gray-200 bg-white hover:bg-gray-50 text-sm font-medium text-gray-700 transition-colors shadow-sm">
            <Filter className="w-4 h-4 text-gray-400" />
            Filter
          </button>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-8 custom-scrollbar">
        <div className="max-w-6xl mx-auto">
          {sessions.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <div className="w-16 h-16 rounded-2xl bg-gray-50 flex items-center justify-center mb-6 border border-gray-100">
                <MessageSquare className="w-8 h-8 text-gray-300" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">No conversations yet</h3>
              <p className="text-gray-500 max-w-sm mb-8 text-sm">
                Start a new chat with the AI assistant to see your history appear here.
              </p>
              <Link 
                to="/" 
                className="px-6 py-3 bg-indigo-600 text-white rounded-xl font-medium hover:bg-indigo-700 transition-colors shadow-sm"
              >
                Start New Chat
              </Link>
            </div>
          ) : (
            <div className="bg-white border border-gray-100 rounded-2xl overflow-hidden shadow-sm">
              <div className="grid grid-cols-[1fr,150px,180px,80px] px-6 py-4 bg-gray-50/50 border-b border-gray-100 text-xs font-bold text-gray-400 uppercase tracking-wider">
                <div>Conversation</div>
                <div>Status</div>
                <div>Created At</div>
                <div className="text-right">Action</div>
              </div>
              <div className="divide-y divide-gray-50">
                {filteredSessions.length > 0 ? filteredSessions.map((session, idx) => (
                  <motion.div
                    key={session.id}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: idx * 0.03 }}
                  >
                    <Link 
                      to={`/chat/${session.id}`}
                      className="grid grid-cols-[1fr,150px,180px,80px] px-6 py-4 items-center hover:bg-indigo-50/30 transition-all group"
                    >
                      <div className="flex items-center gap-4 min-w-0">
                        <div className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center group-hover:bg-indigo-100 transition-colors shrink-0">
                          <MessageSquare className="w-5 h-5 text-indigo-600" />
                        </div>
                        <div className="min-w-0">
                          <h3 className="text-sm font-bold text-gray-900 group-hover:text-indigo-700 transition-colors truncate">
                            {session.title || "Untitled Conversation"}
                          </h3>
                          <p className="text-xs text-gray-400 truncate mt-0.5">Click to view chat details</p>
                        </div>
                      </div>
                      
                      <div>
                        <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                          session.status === 'active' ? 'bg-green-100 text-green-700' : 
                          session.status === 'escalated' ? 'bg-amber-100 text-amber-700' :
                          'bg-gray-100 text-gray-600'
                        }`}>
                          {session.status}
                        </span>
                      </div>

                      <div className="flex flex-col text-xs text-gray-500">
                        <span className="flex items-center gap-1.5 font-medium text-gray-700">
                          <Calendar className="w-3.5 h-3.5 text-gray-400" />
                          {new Date(session.created_at).toLocaleDateString()}
                        </span>
                        <span className="flex items-center gap-1.5 mt-1">
                          <Clock className="w-3.5 h-3.5 text-gray-400" />
                          {new Date(session.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>

                      <div className="flex justify-end">
                        <div className="p-2 rounded-lg group-hover:bg-indigo-100/50 transition-colors">
                          <ChevronRight className="w-5 h-5 text-gray-300 group-hover:text-indigo-600 group-hover:translate-x-0.5 transition-all" />
                        </div>
                      </div>
                    </Link>
                  </motion.div>
                )) : (
                  <div className="py-12 text-center">
                    <p className="text-gray-400 italic">No conversations match your search.</p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
