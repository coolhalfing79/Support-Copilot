import { motion } from 'framer-motion'
import { Sparkles, Zap, Shield, Rocket, ArrowRight, Bell, History, Star } from 'lucide-react'

export const UpdatesPage = () => {
  const updates = [
    {
      version: 'v1.4.0',
      date: 'May 18, 2024',
      title: 'Dynamic Suggestion Engine',
      description: 'The home page and chat responses now suggest follow-up questions in real-time based on your current knowledge source selection.',
      type: 'feature',
      icon: Sparkles,
      color: 'bg-indigo-500'
    },
    {
      version: 'v1.3.5',
      date: 'May 16, 2024',
      title: 'Graph Tooltip Context',
      description: 'Hovering over the Knowledge Graph info icon now displays the exact user query that generated the visualization.',
      type: 'improvement',
      icon: Zap,
      color: 'bg-amber-500'
    },
    {
      version: 'v1.3.0',
      date: 'May 15, 2024',
      title: 'Unified Dashboard Layout',
      description: 'A completely redesigned top bar and sidebar system for a more cohesive navigation experience across the platform.',
      type: 'feature',
      icon: Rocket,
      color: 'bg-blue-500'
    },
    {
      version: 'v1.2.0',
      date: 'May 12, 2024',
      title: 'Graph Mind Rebranding',
      description: 'Official launch of GraphMind AI with updated visual identity and core knowledge graph enhancements.',
      type: 'news',
      icon: Star,
      color: 'bg-purple-500'
    },
    {
      version: 'v1.1.0',
      date: 'May 10, 2024',
      title: 'Advanced RAG Pipeline',
      description: 'Improved retrieval accuracy for C++ and MCP related documentation with better chunking strategies.',
      type: 'improvement',
      icon: Shield,
      color: 'bg-green-500'
    }
  ]

  return (
    <div className="flex-1 h-full overflow-y-auto bg-gray-50/30 p-8 custom-scrollbar">
      <div className="max-w-4xl mx-auto">
        <header className="mb-12">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-2xl bg-indigo-600 flex items-center justify-center shadow-lg shadow-indigo-200">
              <Bell className="text-white w-5 h-5" />
            </div>
            <h1 className="text-3xl font-bold text-gray-900">Latest Updates</h1>
          </div>
          <p className="text-gray-600 text-[15px] max-w-2xl">
            Stay informed about the latest features, security patches, and performance improvements we're bringing to GraphMind AI.
          </p>
        </header>

        <div className="relative">
          {/* Timeline Line */}
          <div className="absolute left-8 top-0 bottom-0 w-px bg-gray-200 hidden md:block" />

          <div className="space-y-12">
            {updates.map((update, idx) => (
              <motion.div 
                key={update.version}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: idx * 0.1 }}
                className="relative md:pl-20"
              >
                {/* Timeline Dot */}
                <div className={cn(
                  "absolute left-[26px] top-0 w-4 h-4 rounded-full border-4 border-white shadow-sm hidden md:block z-10",
                  update.color
                )} />

                <div className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden hover:shadow-md transition-shadow">
                  <div className="p-6">
                    <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
                      <div className="flex items-center gap-3">
                        <div className={cn("p-2 rounded-xl text-white", update.color)}>
                          <update.icon className="w-5 h-5" />
                        </div>
                        <div>
                          <h2 className="text-xl font-bold text-gray-900">{update.title}</h2>
                          <div className="flex items-center gap-2 mt-1">
                            <span className="text-xs font-bold text-indigo-600 uppercase tracking-widest">{update.version}</span>
                            <span className="text-gray-300">•</span>
                            <span className="text-xs text-gray-400 font-medium">{update.date}</span>
                          </div>
                        </div>
                      </div>
                      <span className={cn(
                        "px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-tighter",
                        update.type === 'feature' ? 'bg-indigo-50 text-indigo-600' :
                        update.type === 'improvement' ? 'bg-amber-50 text-amber-600' :
                        'bg-blue-50 text-blue-600'
                      )}>
                        {update.type}
                      </span>
                    </div>

                    <p className="text-gray-600 leading-relaxed text-[15px]">
                      {update.description}
                    </p>

                    <div className="mt-6 pt-6 border-t border-gray-50 flex items-center justify-between">
                      <button className="text-indigo-600 text-sm font-semibold hover:text-indigo-700 flex items-center gap-2 group">
                        Read full release notes
                        <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
                      </button>
                      <div className="flex items-center gap-1">
                         <History className="w-3.5 h-3.5 text-gray-400" />
                         <span className="text-[11px] text-gray-400 font-medium">Updated 2 days ago</span>
                      </div>
                    </div>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </div>

        <footer className="mt-20 text-center pb-12">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-indigo-50 text-indigo-600 text-xs font-bold uppercase tracking-widest cursor-pointer hover:bg-indigo-100 transition-colors">
            <History className="w-4 h-4" />
            View Archive
          </div>
        </footer>
      </div>
    </div>
  )
}

function cn(...classes: any[]) {
  return classes.filter(Boolean).join(' ')
}
