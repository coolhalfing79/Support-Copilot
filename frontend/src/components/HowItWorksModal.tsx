import React from 'react'
import { X, Search, Database, Share2, CheckCircle, ArrowRight, Zap, Info } from 'lucide-react'

interface HowItWorksModalProps {
  isOpen: boolean
  onClose: () => void
}

export const HowItWorksModal: React.FC<HowItWorksModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null

  const steps = [
    {
      title: 'Select Knowledge',
      description: 'Choose from a variety of sources like program documents, international student guides, or fee structures.',
      icon: Database,
      color: 'bg-blue-500',
      shadow: 'shadow-blue-500/20'
    },
    {
      title: 'Ask Anything',
      description: 'Input your queries in natural language. GraphMind AI understands context and complex requirements.',
      icon: Search,
      color: 'bg-indigo-500',
      shadow: 'shadow-indigo-500/20'
    },
    {
      title: 'Visualize Connections',
      description: 'See how information is linked. Our unique Knowledge Graph maps out relationships in real-time.',
      icon: Share2,
      color: 'bg-purple-500',
      shadow: 'shadow-purple-500/20'
    },
    {
      title: 'Get Verified Answers',
      description: 'Receive precise, data-backed responses with full citations and suggested follow-up questions.',
      icon: CheckCircle,
      color: 'bg-emerald-500',
      shadow: 'shadow-emerald-500/20'
    }
  ]

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-[#0a0a0a]/80 backdrop-blur-md animate-in fade-in duration-300"
        onClick={onClose}
      />
      
      {/* Modal Container */}
      <div className="relative w-full max-w-4xl bg-white rounded-[32px] shadow-2xl overflow-hidden animate-in zoom-in-95 fade-in duration-300 border border-white/20">
        {/* Header Decor */}
        <div className="absolute top-0 inset-x-0 h-2 bg-gradient-to-r from-blue-500 via-indigo-500 to-purple-500" />
        
        <div className="flex flex-col md:flex-row h-full">
          {/* Left Side: Visual/Intro */}
          <div className="w-full md:w-[35%] bg-gray-50 p-8 flex flex-col justify-between border-r border-gray-100">
            <div className="space-y-6">
              <div className="w-12 h-12 rounded-2xl bg-indigo-600 flex items-center justify-center shadow-xl shadow-indigo-600/20">
                <Zap className="w-6 h-6 text-white" />
              </div>
              <div className="space-y-2">
                <h2 className="text-2xl font-bold text-gray-900 leading-tight">
                  How GraphMind AI <span className="text-indigo-600">Works</span>
                </h2>
                <p className="text-gray-500 text-sm leading-relaxed">
                  Discover the future of knowledge exploration. We use advanced RAG and Graph Technology to give you the most accurate support experience.
                </p>
              </div>
            </div>
            
            <div className="p-4 rounded-2xl bg-white border border-gray-100 shadow-sm space-y-3">
              <div className="flex items-center gap-2 text-indigo-600">
                <Info className="w-4 h-4" />
                <span className="text-xs font-bold uppercase tracking-wider">Pro Tip</span>
              </div>
              <p className="text-[11px] text-gray-600 leading-relaxed font-medium">
                Click on any node in the relationship graph to see detailed information about that specific entity.
              </p>
            </div>
          </div>

          {/* Right Side: Steps */}
          <div className="flex-1 p-8 relative">
            <button 
              onClick={onClose}
              className="absolute top-6 right-6 p-2 rounded-xl hover:bg-gray-100 text-gray-400 hover:text-gray-900 transition-all"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="grid grid-cols-1 gap-8 mt-4">
              {steps.map((step, idx) => (
                <div key={idx} className="group flex gap-6 items-start">
                  <div className={`relative shrink-0 w-12 h-12 rounded-2xl ${step.color} flex items-center justify-center shadow-lg ${step.shadow} group-hover:scale-110 transition-transform duration-300`}>
                    <step.icon className="w-6 h-6 text-white" />
                    {idx < steps.length - 1 && (
                      <div className="absolute top-14 left-1/2 -translate-x-1/2 w-0.5 h-6 bg-gray-100" />
                    )}
                  </div>
                  
                  <div className="space-y-1.5 pt-1">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full uppercase tracking-widest">
                        Step 0{idx + 1}
                      </span>
                      <h3 className="text-lg font-bold text-gray-900">{step.title}</h3>
                    </div>
                    <p className="text-gray-500 text-sm leading-relaxed max-w-md">
                      {step.description}
                    </p>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-12 pt-8 border-t border-gray-100 flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="flex -space-x-2">
                  {[1, 2, 3].map(i => (
                    <div key={i} className="w-8 h-8 rounded-full border-2 border-white bg-gray-200" />
                  ))}
                </div>
                <p className="text-[11px] text-gray-500 font-medium italic">
                  Trusted by 1,000+ students and staff
                </p>
              </div>
              
              <button 
                onClick={onClose}
                className="px-6 py-2.5 rounded-xl bg-gray-900 text-white text-sm font-bold flex items-center gap-2 hover:bg-indigo-600 transition-all shadow-lg shadow-gray-900/10 active:scale-95"
              >
                Got it, let's go!
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
