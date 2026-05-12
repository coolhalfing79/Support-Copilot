import { Link, useLocation, useNavigate } from 'react-router-dom'
import { Bot, LogOut, LayoutGrid, User } from 'lucide-react'
import { KnowledgeSourceSelector } from './KnowledgeSourceSelector'
import { useAuthStore } from '../store/authStore'

export const Header = () => {
  const location = useLocation()
  const navigate = useNavigate()
  const isChat = location.pathname.includes('/chat/')
  const { user, logout } = useAuthStore()

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  return (
    <header className="fixed top-0 left-0 right-0 z-50 glass-panel border-b border-white/10 px-6 py-4">
      <div className="max-w-7xl mx-auto flex items-center justify-between">
        <Link to="/" className="flex items-center gap-3 min-w-[240px] group">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-nebula-purple to-nebula-blue flex items-center justify-center shadow-lg shadow-nebula-purple/20 group-hover:scale-110 transition-transform animate-pulse-glow">
            <Bot className="text-white w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-white group-hover:text-nebula-blue transition-colors">Support Copilot</h1>
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-[10px] uppercase tracking-widest text-emerald-500/80 font-bold">System Online</span>
            </div>
          </div>
        </Link>

        <div className="flex-1 flex justify-center">
          {isChat && <KnowledgeSourceSelector />}
        </div>
        
        <div className="flex items-center gap-4 min-w-[240px] justify-end">
          {isChat && (
            <Link 
              to="/" 
              className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/5 border border-white/10 text-xs text-white/40 hover:text-white hover:bg-white/10 transition-all"
            >
              <LayoutGrid className="w-4 h-4" />
              <span>Tickets</span>
            </Link>
          )}

          <div className="h-8 w-px bg-white/5 mx-2" />

          <div className="flex items-center gap-3 pl-2">
            <div className="flex flex-col items-end hidden sm:flex">
              <p className="text-xs font-bold text-white tracking-tight">{user?.name || 'User'}</p>
              <p className="text-[10px] text-white/30 font-medium truncate max-w-[100px]">{user?.email}</p>
            </div>
            <div className="w-8 h-8 rounded-full border border-white/10 overflow-hidden bg-white/5">
              {user?.avatar ? (
                <img src={user.avatar} alt="Avatar" className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <User className="w-4 h-4 text-white/20" />
                </div>
              )}
            </div>
            <button 
              onClick={handleLogout}
              className="p-2 rounded-xl bg-white/5 border border-white/10 text-white/40 hover:text-rose-400 hover:bg-rose-500/10 hover:border-rose-500/20 transition-all group"
              title="Logout"
            >
              <LogOut className="w-4 h-4 group-hover:scale-110 transition-transform" />
            </button>
          </div>
        </div>
      </div>
    </header>
  )
}
