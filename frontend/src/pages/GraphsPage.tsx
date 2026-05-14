import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Share2, Search, Calendar, ChevronRight, MessageSquare, BrainCircuit, Info, Maximize2 } from 'lucide-react'
import { ReactFlow, Background, ReactFlowProvider } from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import apiClient from '../config/api'

interface ArchivedGraph {
  message_id: string
  session_id: string
  session_title: string
  query: string
  graph: any
  created_at: string
}

export const GraphsPage = () => {
  const [graphs, setGraphs] = useState<ArchivedGraph[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')

  useEffect(() => {
    const fetchGraphs = async () => {
      try {
        const response = await apiClient.get('/chat/graphs')
        setGraphs(response.data)
      } catch (err) {
        console.error('Failed to fetch graphs', err)
      } finally {
        setLoading(false)
      }
    }
    fetchGraphs()
  }, [])

  const filteredGraphs = graphs.filter(g => 
    g.query.toLowerCase().includes(searchTerm.toLowerCase()) || 
    g.session_title.toLowerCase().includes(searchTerm.toLowerCase())
  )

  return (
    <div className="flex flex-col h-full bg-white">
      <header className="h-20 flex items-center justify-between px-8 border-b border-gray-100 shrink-0 bg-white/80 backdrop-blur-md sticky top-0 z-10">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-3">
            <div className="w-8 h-8 bg-indigo-100 rounded-lg flex items-center justify-center">
              <Share2 className="w-5 h-5 text-indigo-600" />
            </div>
            Graph Library
          </h1>
          <p className="text-sm text-gray-500">A visual record of all knowledge extracted from your queries.</p>
        </div>
        
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input 
              type="text" 
              placeholder="Search by query or session..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 transition-all w-80"
            />
          </div>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-8 custom-scrollbar">
        <div className="max-w-7xl mx-auto">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <BrainCircuit className="w-12 h-12 text-indigo-600 animate-pulse mb-4" />
              <p className="text-gray-500">Loading your knowledge library...</p>
            </div>
          ) : filteredGraphs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <div className="w-16 h-16 rounded-2xl bg-gray-50 flex items-center justify-center mb-6 border border-gray-100">
                <Share2 className="w-8 h-8 text-gray-300" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">No graphs archived yet</h3>
              <p className="text-gray-500 max-w-sm mb-8 text-sm">
                Knowledge graphs are generated automatically when you ask complex questions in the chat.
              </p>
              <Link 
                to="/" 
                className="px-6 py-3 bg-indigo-600 text-white rounded-xl font-medium hover:bg-indigo-700 transition-colors shadow-sm"
              >
                Go to Chat
              </Link>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
              {filteredGraphs.map((item, idx) => (
                <motion.div
                  key={item.message_id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: idx * 0.1 }}
                  className="group bg-white border border-gray-100 rounded-2xl overflow-hidden hover:border-indigo-200 hover:shadow-xl transition-all flex flex-col h-[420px]"
                >
                  <div className="p-5 flex flex-col flex-1 min-h-0">
                    <div className="flex items-start justify-between gap-3 mb-4">
                      <div className="min-w-0">
                        <h3 className="text-sm font-bold text-gray-900 group-hover:text-indigo-700 transition-colors line-clamp-2">
                          "{item.query}"
                        </h3>
                        <p className="text-[11px] text-gray-400 mt-1 flex items-center gap-1.5">
                          <MessageSquare className="w-3 h-3" />
                          {item.session_title}
                        </p>
                      </div>
                      <Link 
                        to={`/chat/${item.session_id}`}
                        className="p-2 bg-gray-50 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all shrink-0"
                        title="View Conversation"
                      >
                        <ExternalLink className="w-4 h-4" />
                      </Link>
                    </div>

                    <div className="flex-1 bg-gray-50 rounded-xl border border-gray-100 overflow-hidden relative shadow-inner">
                      <ReactFlowProvider>
                         <ReactFlow
                            nodes={item.graph.nodes.map((n: any, i: number) => ({
                              id: n.id,
                              data: { label: n.label },
                              position: { x: n.x || (100 + (i % 3) * 80), y: n.y || (50 + Math.floor(i / 3) * 80) },
                              style: { 
                                fontSize: '8px', 
                                padding: '4px', 
                                width: 70, 
                                borderRadius: '6px', 
                                border: '1px solid #cbd5e1',
                                background: 'white'
                              }
                            }))}
                            edges={item.graph.edges.map((e: any) => ({
                              id: e.id,
                              source: e.source,
                              target: e.target,
                              style: { stroke: '#cbd5e1', strokeWidth: 1 }
                            }))}
                            fitView
                            nodesDraggable={false}
                            zoomOnScroll={false}
                            panOnDrag={false}
                            proOptions={{ hideAttribution: true }}
                         >
                            <Background color="#e2e8f0" gap={10} size={0.5} />
                         </ReactFlow>
                      </ReactFlowProvider>
                      <div className="absolute top-2 right-2 bg-white/90 backdrop-blur-sm px-2 py-1 rounded-md border border-gray-100 text-[9px] font-bold text-gray-500 shadow-sm uppercase tracking-tighter">
                        Preview Only
                      </div>
                    </div>

                    <div className="mt-4 pt-4 border-t border-gray-50 flex items-center justify-between">
                      <div className="flex items-center gap-3 text-[11px] text-gray-400 font-medium">
                        <span className="flex items-center gap-1">
                          <Calendar className="w-3 h-3" />
                          {new Date(item.created_at).toLocaleDateString()}
                        </span>
                        <div className="w-1 h-1 rounded-full bg-gray-200" />
                        <span>{item.graph.nodes.length} Nodes</span>
                      </div>
                      <Link 
                        to={`/chat/${item.session_id}`}
                        className="text-xs font-bold text-indigo-600 hover:text-indigo-700 flex items-center gap-1 group/btn"
                      >
                        Explore <ChevronRight className="w-3.5 h-3.5 group-hover/btn:translate-x-0.5 transition-transform" />
                      </Link>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

const ExternalLink = ({ className }: { className?: string }) => (
  <svg 
    xmlns="http://www.w3.org/2000/svg" 
    width="24" 
    height="24" 
    viewBox="0 0 24 24" 
    fill="none" 
    stroke="currentColor" 
    strokeWidth="2" 
    strokeLinecap="round" 
    strokeLinejoin="round" 
    className={className}
  >
    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
    <polyline points="15 3 21 3 21 9" />
    <line x1="10" y1="14" x2="21" y2="3" />
  </svg>
)
