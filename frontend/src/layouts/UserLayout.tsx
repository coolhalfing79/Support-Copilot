import { type ReactNode, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { Sidebar } from '../components/Sidebar'
import { RightPanel } from '../components/RightPanel'
import { HowItWorksModal } from '../components/HowItWorksModal'
import { Globe, HelpCircle, ExternalLink } from 'lucide-react'
import { KnowledgeSourceSelector } from '../components/KnowledgeSourceSelector'
import { useAuthStore } from '../store/authStore'

interface UserLayoutProps {
  children: ReactNode
}

export const UserLayout = ({ children }: UserLayoutProps) => {
  const [isSidebarOpen, setIsSidebarOpen] = useState(true)
  const [isHowItWorksOpen, setIsHowItWorksOpen] = useState(false)
  const { user } = useAuthStore()
  const location = useLocation()

  const showRightPanel = location.pathname === '/' || location.pathname.startsWith('/chat')

  return (
    <div className="flex h-screen w-full bg-[#f8f9fa] overflow-hidden font-sans">
      {/* Left Sidebar */}
      <Sidebar isOpen={isSidebarOpen} setIsOpen={setIsSidebarOpen} />
      
      <div className="flex-1 flex flex-col min-w-0 h-full relative">
        {/* Unified Top Bar */}
        <header className="h-16 bg-white/80 backdrop-blur-md border-b border-gray-100 flex items-center justify-between px-6 shrink-0 z-20">
          <div className="flex items-center gap-4">
            <h1 className="text-lg font-bold flex items-center gap-2 text-gray-900">
              <span className="text-xl">👋</span> Hello, {user?.name?.split(' ')[0] || 'Alex'}!
            </h1>
            <div className="h-4 w-px bg-gray-200 hidden md:block" />
            <span className="text-gray-400 text-[11px] hidden md:block uppercase tracking-wider font-semibold">GraphMind AI</span>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <KnowledgeSourceSelector />
            </div>

            <button 
              onClick={() => setIsHowItWorksOpen(true)}
              className="flex items-center gap-2 px-3 py-1.5 rounded-xl border border-gray-200 bg-white hover:bg-gray-50 text-[13px] font-medium text-gray-700 transition-all shadow-sm"
            >
              <HelpCircle className="w-3.5 h-3.5 text-gray-400" />
              How it works?
            </button>
          </div>
        </header>

        <div className="flex-1 flex overflow-hidden">
          {/* Main Content Area */}
          <main className="flex-1 flex flex-col min-w-0 h-full relative overflow-hidden">
            <div className="flex-1 overflow-hidden relative">
              {children}
            </div>
          </main>

          {/* Right Sidebar (Below the top bar controls) */}
          {showRightPanel && (
            <div className="w-[420px] shrink-0 border-l border-gray-200 bg-white hidden xl:block">
              <RightPanel />
            </div>
          )}
        </div>
      </div>

      <HowItWorksModal 
        isOpen={isHowItWorksOpen} 
        onClose={() => setIsHowItWorksOpen(false)} 
      />
    </div>
  )
}
