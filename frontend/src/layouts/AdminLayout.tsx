import { ReactNode, useEffect } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { LayoutDashboard, Database, Ticket, ArrowLeft, Shield, MessageSquare } from 'lucide-react'
import { useAdminStore } from '../store/adminStore'
import { useKnowledgePolling } from '../hooks/useKnowledgePolling'

interface AdminLayoutProps {
  children: ReactNode
}

export const AdminLayout = ({ children }: AdminLayoutProps) => {
  const location = useLocation()
  const { loadMetrics, loadKnowledgeSources, loadTickets, loadFeedbacks } = useAdminStore()
  
  // Start polling for knowledge status
  useKnowledgePolling()

  useEffect(() => {
    // Initial data load
    loadMetrics()
    loadKnowledgeSources()
    loadTickets()
    loadFeedbacks()
  }, [loadMetrics, loadKnowledgeSources, loadTickets, loadFeedbacks])

  const navItems = [
    { path: '/admin', label: 'Dashboard', icon: LayoutDashboard },
    { path: '/admin/knowledge', label: 'Knowledge Base', icon: Database },
    { path: '/admin/tickets', label: 'Tickets', icon: Ticket },
    { path: '/admin/feedback', label: 'Feedback', icon: MessageSquare },
  ]

  return (
    <div className="flex flex-col h-screen bg-[#161616] text-[#f4f4f4] font-sans">
      {/* Admin Header */}
      <header className="flex-shrink-0 h-16 border-b border-[#393939] bg-[#161616] flex items-center justify-between px-8 z-50">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-[#0f62fe] flex items-center justify-center shadow-lg shadow-[#0f62fe]/20">
              <Shield className="w-4 h-4 text-white" />
            </div>
            <div>
              <h1 className="text-sm font-bold tracking-tight uppercase">Admin Console</h1>
              <p className="text-[10px] text-[#c6c6c6] uppercase tracking-widest font-bold leading-none">Control Center</p>
            </div>
          </div>
          
          <nav className="flex items-center gap-1 ml-4">
            {navItems.map((item) => {
              const Icon = item.icon
              const isActive = location.pathname === item.path
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  className={`
                    flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-medium transition-all
                    ${isActive 
                      ? 'bg-[#262626] text-[#f4f4f4] border border-[#393939] shadow-xl' 
                      : 'text-[#c6c6c6] hover:text-[#f4f4f4] hover:bg-[#393939]'}
                  `}
                >
                  <Icon className={`w-3.5 h-3.5 ${isActive ? 'text-[#0f62fe]' : ''}`} />
                  {item.label}
                </Link>
              )
            })}
          </nav>
        </div>

        <Link 
          to="/chat"
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[#262626] border border-[#393939] text-[10px] uppercase tracking-widest font-bold text-[#c6c6c6] hover:text-[#f4f4f4] hover:bg-[#393939] transition-all group"
        >
          <ArrowLeft className="w-3 h-3 group-hover:-translate-x-1 transition-transform" />
          Back to User View
        </Link>
      </header>

      {/* Admin Content */}
      <main className="flex-1 overflow-y-auto p-8 bg-[#161616]">
        <div className="max-w-6xl mx-auto">
          {children}
        </div>
      </main>
    </div>
  )
}
