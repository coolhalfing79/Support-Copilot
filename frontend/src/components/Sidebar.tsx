import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { Link, useLocation } from 'react-router-dom'
import { 
  BrainCircuit, 
  Home, 
  MessageSquare, 
  FileText, 
  Share2, 
  Bell, 
  MessageCircle, 
  Settings, 
  Plus,
  ChevronDown
} from 'lucide-react'
import { useAuthStore } from '../store/authStore'
import { useUserStore } from '../store/userStore'

export const Sidebar = ({ isOpen, setIsOpen }: { isOpen: boolean, setIsOpen: (val: boolean) => void }) => {
  const location = useLocation()
  const { user, logout } = useAuthStore()
  const { sessions, fetchSessions, sessionId, availableSources, fetchAvailableSources } = useUserStore()

  useEffect(() => {
    fetchSessions()
    fetchAvailableSources()
  }, [fetchSessions, fetchAvailableSources])
  
  const navItems = [
    { icon: Home, label: 'Home', path: '/' },
    { icon: MessageSquare, label: 'Conversations', path: '/conversations' },
    { icon: FileText, label: 'Sources', path: '/sources' },
    { icon: Share2, label: 'Knowledge Graph', path: '/graph' },
    { icon: Bell, label: 'Updates', path: '/updates' },
    { icon: MessageCircle, label: 'Feedback', path: '/feedback' },
    { icon: Settings, label: 'Settings', path: '/settings' },
  ]

  return (
    <motion.aside 
      initial={false}
      animate={{ width: isOpen ? 260 : 80 }}
      className="h-full bg-white border-r border-gray-200 flex flex-col overflow-hidden shrink-0 transition-all duration-300"
    >
      <div className="p-4 flex items-center gap-3 shrink-0 mt-2">
        <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center shrink-0">
          <BrainCircuit className="text-white w-5 h-5" />
        </div>
        {isOpen && (
          <div className="flex flex-col overflow-hidden">
            <span className="font-bold text-gray-900 leading-tight">GraphMind AI</span>
          </div>
        )}
      </div>

      {isOpen && (
        <div className="px-4 mt-2">
          <p className="text-xs text-gray-500 leading-relaxed">
            Your intelligent companion for our website.
          </p>
        </div>
      )}

      <div className="px-4 mt-6">
        <button 
          onClick={() => { window.location.href = '/' }}
          className={`flex items-center justify-center gap-2 w-full bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl py-2.5 transition-colors ${!isOpen && 'px-0'}`}
        >
          <Plus className="w-4 h-4" />
          {isOpen && <span className="font-medium text-sm">New Chat</span>}
        </button>
      </div>

      <nav className="flex-1 overflow-y-auto mt-6 px-3 space-y-1 custom-scrollbar">
        {navItems.map((item) => {
          const isActive = location.pathname === item.path || (item.path === '/chat' && location.pathname.startsWith('/chat'))
          return (
            <Link 
              key={item.label}
              to={item.path}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-xl transition-colors ${isActive ? 'bg-indigo-50 text-indigo-700' : 'text-gray-600 hover:bg-gray-100'}`}
              title={!isOpen ? item.label : undefined}
            >
              <item.icon className="w-4 h-4 shrink-0" />
              {isOpen && <span className="text-sm font-medium">{item.label}</span>}
            </Link>
          )
        })}

        {isOpen && (
          <div className="mt-8 mb-2 px-3">
            <h3 className="text-xs font-semibold text-gray-900 mb-3 flex items-center gap-2">
              <div className="w-1 h-1 rounded-full bg-emerald-500" />
              Active Sources
            </h3>
            <div className="space-y-1.5 mt-1">
              {availableSources.length === 0 ? (
                <p className="text-[11px] text-gray-400 px-3 italic">No sources found</p>
              ) : (
                availableSources.slice(0, 5).map((src) => (
                  <div 
                    key={src.id}
                    onClick={() => { window.location.href = '/sources' }}
                    className="flex items-center gap-3 px-3 py-2 rounded-xl bg-gray-50/50 border border-gray-100/50 hover:bg-white hover:border-indigo-100 hover:shadow-sm transition-all cursor-pointer group"
                  >
                    <div className={`w-8 h-8 rounded-lg bg-indigo-50 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform`}>
                      <FileText className={`w-4 h-4 text-indigo-500`} />
                    </div>
                    <div className="flex flex-col min-w-0">
                      <span className="text-[11px] font-bold text-gray-700 truncate group-hover:text-indigo-600 transition-colors">{src.title || 'Untitled Source'}</span>
                      <div className="flex items-center gap-1.5">
                        <div className={`w-1 h-1 rounded-full ${src.status === 'indexed' ? 'bg-emerald-500' : 'bg-amber-500'} animate-pulse`} />
                        <span className="text-[9px] text-gray-400 font-bold uppercase tracking-tighter">{src.status}</span>
                      </div>
                    </div>
                  </div>
                ))
              )}
              <Link 
                to="/sources"
                className="flex items-center justify-center py-2 text-[10px] font-extrabold text-indigo-500 hover:text-indigo-600 transition-colors uppercase tracking-[0.1em] mt-1"
              >
                View All Sources
              </Link>
            </div>
          </div>
        )}

        {isOpen && (
          <div className="mt-8 mb-2 px-3">
            <h3 className="text-xs font-semibold text-gray-900 mb-1">Recent Chats</h3>
            <p className="text-[11px] text-gray-500 mb-3">Today</p>
            <div className="space-y-1">
              {sessions.length === 0 ? (
                <p className="text-xs text-gray-400 px-3 italic">No history yet</p>
              ) : (
                sessions.slice(0, 10).map((session) => {
                  const isActive = sessionId === session.id
                  return (
                    <Link 
                      key={session.id}
                      to={`/chat/${session.id}`}
                      className={`w-full flex items-start gap-3 px-3 py-2.5 rounded-xl text-left transition-colors group ${isActive ? 'bg-indigo-50 text-indigo-700' : 'text-gray-600 hover:bg-gray-50'}`}
                    >
                      <div className="flex-1 min-w-0">
                        <p className={`text-xs font-medium truncate ${isActive ? 'text-indigo-900' : 'text-gray-700'}`}>
                          {session.title || "Untitled Conversation"}
                        </p>
                      </div>
                    </Link>
                  )
                })
              )}
            </div>
          </div>
        )}
      </nav>

      {isOpen && (
        <div className="p-4 border-t border-gray-200 shrink-0">
          <div className="flex flex-col gap-2">
            <button className="w-full flex items-center justify-between gap-3 p-2 rounded-xl hover:bg-gray-100 transition-colors">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center shrink-0 overflow-hidden">
                  {user?.avatar ? (
                    <img src={user.avatar} alt="Avatar" className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-indigo-700 font-semibold text-xs">
                      {user?.name ? user.name.substring(0, 2).toUpperCase() : 'AD'}
                    </span>
                  )}
                </div>
                <div className="flex flex-col text-left">
                  <span className="text-sm font-medium text-gray-900 truncate max-w-[120px]">{user?.name || 'Alex D.'}</span>
                  <span className="text-[10px] text-gray-500 truncate max-w-[120px]">{user?.email || 'alex.doe@example.com'}</span>
                </div>
              </div>
            </button>
            <button 
              onClick={() => {
                logout()
                window.location.href = '/login'
              }}
              className="w-full flex items-center justify-center gap-2 p-2 rounded-xl text-sm font-medium text-red-600 hover:bg-red-50 transition-colors"
            >
              Log out
            </button>
          </div>
        </div>
      )}
    </motion.aside>
  )
}
