import { useState, useMemo, useEffect } from 'react'
import { motion } from 'framer-motion'
import { ReactFlow, Background, Controls, useReactFlow, ReactFlowProvider, type Node, type Edge } from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { useUserStore, type GraphData } from '../store/userStore'
import { Info, Maximize2, Download, Filter, FileText, Calendar, ExternalLink, RefreshCw, Lock, Unlock, Zap, Maximize } from 'lucide-react'
import { KnowledgeGraphModal } from './KnowledgeGraphModal'
import { cn } from '../lib/utils'

const initialNodes: Node[] = [
  { id: '1', position: { x: 150, y: 150 }, data: { label: 'GraphMind AI' }, type: 'default', style: { background: '#f3e8ff', border: '2px solid #a855f7', borderRadius: '50%', width: 80, height: 80, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', color: '#6b21a8' } },
]
const initialEdges: Edge[] = []

export const RightPanel = () => (
  <ReactFlowProvider>
    <RightPanelContent />
  </ReactFlowProvider>
)

const RightPanelContent = () => {
  const currentGraph = useUserStore(state => state.currentGraph)
  const currentGraphQuery = useUserStore(state => state.currentGraphQuery)
  const messages = useUserStore(state => state.messages)
  const [hoveredNode, setHoveredNode] = useState<string | null>(null)
  const [isLocked, setIsLocked] = useState(false)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const { fitView } = useReactFlow()
  
  const lastMessage = messages[messages.length - 1]
  const sources = lastMessage?.sources || []

  const nodeTypeConfig: Record<string, { bg: string, border: string, text: string, glow: string }> = {
    program: { bg: '#f5f3ff', border: '#8b5cf6', text: '#5b21b6', glow: '0 0 15px rgba(139, 92, 246, 0.3)' },
    policy: { bg: '#ecfeff', border: '#06b6d4', text: '#155e75', glow: '0 0 15px rgba(6, 182, 212, 0.3)' },
    student: { bg: '#f0fdf4', border: '#22c55e', text: '#166534', glow: '0 0 15px rgba(34, 197, 94, 0.3)' },
    deadline: { bg: '#fff7ed', border: '#f97316', text: '#9a3412', glow: '0 0 15px rgba(249, 115, 22, 0.3)' },
    financial: { bg: '#eff6ff', border: '#3b82f6', text: '#1e40af', glow: '0 0 15px rgba(59, 130, 246, 0.3)' },
    document: { bg: '#fdf2f8', border: '#ec4899', text: '#9d174d', glow: '0 0 15px rgba(236, 72, 153, 0.3)' },
    process: { bg: '#fefce8', border: '#eab308', text: '#854d0e', glow: '0 0 15px rgba(234, 179, 8, 0.3)' },
    api: { bg: '#f0fdfa', border: '#14b8a6', text: '#134e4a', glow: '0 0 15px rgba(20, 184, 166, 0.2)' },
    product: { bg: '#f5f3ff', border: '#a855f7', text: '#6b21a8', glow: '0 0 15px rgba(168, 85, 247, 0.2)' },
    service: { bg: '#eef2ff', border: '#6366f1', text: '#3730a3', glow: '0 0 15px rgba(99, 102, 241, 0.2)' },
    requirement: { bg: '#fff1f2', border: '#f43f5e', text: '#9f1239', glow: '0 0 15px rgba(244, 63, 94, 0.2)' },
    location: { bg: '#f0f9ff', border: '#0ea5e9', text: '#0369a1', glow: '0 0 15px rgba(14, 165, 233, 0.2)' },
    person: { bg: '#fdf4ff', border: '#d946ef', text: '#a21caf', glow: '0 0 15px rgba(217, 70, 239, 0.2)' },
    organization: { bg: '#f8fafc', border: '#64748b', text: '#334155', glow: '0 0 15px rgba(100, 116, 139, 0.2)' },
    event: { bg: '#fffbeb', border: '#f59e0b', text: '#b45309', glow: '0 0 15px rgba(245, 158, 11, 0.2)' },
    tool: { bg: '#f1f5f9', border: '#475569', text: '#1e293b', glow: '0 0 15px rgba(71, 85, 105, 0.2)' },
    concept: { bg: '#faf5ff', border: '#c084fc', text: '#7e22ce', glow: '0 0 15px rgba(192, 132, 252, 0.2)' },
    rule: { bg: '#fef2f2', border: '#ef4444', text: '#b91c1c', glow: '0 0 15px rgba(239, 68, 68, 0.2)' },
  };

  // Color system mapping
  const getNodeStyles = (type: string, isHovered: boolean) => {
    const t = type.toLowerCase()
    const config = nodeTypeConfig[t] || { bg: '#f8fafc', border: '#cbd5e1', text: '#1e293b', glow: 'none' };

    return {
      background: config.bg,
      border: `2px solid ${config.border}`,
      borderRadius: '12px',
      padding: '10px',
      fontSize: '11px',
      fontWeight: '600',
      color: config.text,
      boxShadow: isHovered ? config.glow : '0 2px 5px rgba(0,0,0,0.05)',
      transition: 'all 0.2s ease',
      opacity: hoveredNode && !isHovered ? 0.4 : 1,
      width: 120,
      textAlign: 'center' as const
    }
  }

  // Transform GraphData to ReactFlow format
  const rfNodes: Node[] = useMemo(() => {
    if (!currentGraph || currentGraph.nodes.length === 0) return initialNodes;
    
    // Simple circular layout if positions missing
    const count = currentGraph.nodes.length;
    const centerX = 200;
    const centerY = 160;
    const radius = count > 5 ? 140 : 100;
    
    return currentGraph.nodes.map((node, i) => {
      const angle = (i * 2 * Math.PI) / count;
      const x = node.x ?? (centerX + radius * Math.cos(angle));
      const y = node.y ?? (centerY + radius * Math.sin(angle));
      
      const isHovered = hoveredNode === node.id;

      return {
        id: node.id,
        position: { x, y },
        data: { label: node.label },
        style: getNodeStyles(node.type, isHovered),
      }
    })
  }, [currentGraph, hoveredNode])

  const rfEdges: Edge[] = useMemo(() => {
    if (!currentGraph) return initialEdges;
    return currentGraph.edges.map((edge) => {
      const isRelated = hoveredNode === edge.source || hoveredNode === edge.target;
      return {
        id: edge.id,
        source: edge.source,
        target: edge.target,
        label: edge.label,
        animated: true,
        style: { 
          stroke: isRelated ? '#6366f1' : '#cbd5e1', 
          strokeWidth: isRelated ? 2.5 : 1.5,
          opacity: hoveredNode && !isRelated ? 0.2 : 1
        },
        labelStyle: { fill: isRelated ? '#4338ca' : '#64748b', fontSize: 10, fontWeight: 600 },
        labelBgStyle: { fill: 'white', fillOpacity: 0.9, rx: 4 }
      }
    })
  }, [currentGraph, hoveredNode])

  // Get unique node types present in the graph for the legend
  const activeTypes = useMemo(() => {
    if (!currentGraph) return [];
    const types = new Set(currentGraph.nodes.map(n => n.type.toLowerCase()));
    return Array.from(types).filter(t => nodeTypeConfig[t]);
  }, [currentGraph]);

  useEffect(() => {
    if (currentGraph) {
      setTimeout(() => fitView({ duration: 800, padding: 0.2 }), 100);
    }
  }, [currentGraph, fitView])

  return (
    <div className="flex flex-col h-full bg-white shrink-0 overflow-y-auto">
      {/* Knowledge Graph Section */}
      <div className="p-5 border-b border-gray-200 flex flex-col h-[600px]">
        <div className="flex items-center justify-between mb-4 shrink-0">
          <div className="flex items-center gap-2">
            <h3 className="font-semibold text-gray-900 text-[15px]">Knowledge Graph</h3>
            <span className="text-[11px] text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">(for this query)</span>
            <div className="relative group/info">
              <Info className="w-3.5 h-3.5 text-gray-400 cursor-help" />
              {currentGraphQuery && (
                <div className="absolute left-1/2 -translate-x-1/2 top-full mt-2 w-64 p-3 bg-gray-900/95 backdrop-blur text-white text-[11px] rounded-xl shadow-xl opacity-0 group-hover/info:opacity-100 transition-all pointer-events-none z-[100] border border-white/10 scale-95 group-hover/info:scale-100 origin-top">
                  <p className="font-bold text-indigo-400 mb-1 uppercase tracking-tighter">Original Query</p>
                  <p className="leading-relaxed italic">"{currentGraphQuery}"</p>
                </div>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button 
              onClick={() => setIsModalOpen(true)}
              className="p-1.5 bg-indigo-600 hover:bg-indigo-700 rounded-md text-white shadow-lg shadow-indigo-100 transition-all mr-1" 
              title="Full Screen Explorer"
            >
              <Maximize className="w-4 h-4" />
            </button>
            <button 
              onClick={() => fitView({ duration: 800 })}
              className="p-1.5 hover:bg-indigo-50 rounded-md text-gray-500 hover:text-indigo-600 transition-all" 
              title="Fit View"
            >
              <Maximize2 className="w-4 h-4" />
            </button>
            <button 
              onClick={() => setIsLocked(!isLocked)}
              className={cn(
                "p-1.5 rounded-md transition-all",
                isLocked ? "bg-amber-50 text-amber-600 hover:bg-amber-100" : "hover:bg-gray-100 text-gray-500"
              )}
              title={isLocked ? "Unlock Graph" : "Lock Graph"}
            >
              {isLocked ? <Lock className="w-4 h-4" /> : <Unlock className="w-4 h-4" />}
            </button>
            <button className="p-1.5 hover:bg-gray-100 rounded-md text-gray-500 transition-colors" title="Download Graph"><Download className="w-4 h-4" /></button>
          </div>
        </div>

        <div className="flex-1 rounded-xl border border-gray-100 bg-gray-50/50 overflow-hidden relative shadow-inner">
          <ReactFlow 
            nodes={rfNodes} 
            edges={rfEdges} 
            fitView 
            nodesDraggable={!isLocked}
            nodesConnectable={false}
            elementsSelectable={!isLocked}
            attributionPosition="bottom-right"
            proOptions={{ hideAttribution: true }}
            onNodeMouseEnter={(_, node) => setHoveredNode(node.id)}
            onNodeMouseLeave={() => setHoveredNode(null)}
          >
            <Background color="#cbd5e1" gap={20} size={1} />
            <Controls className="!m-2 !shadow-sm !border-gray-100" />
          </ReactFlow>
        </div>

        {/* Dynamic Legend */}
        <div className="flex items-center justify-center gap-4 mt-4 shrink-0 flex-wrap">
          {activeTypes.map(type => (
            <div key={type} className="flex items-center gap-1.5">
              <div 
                className="w-2.5 h-2.5 rounded-full" 
                style={{ backgroundColor: nodeTypeConfig[type].border }}
              />
              <span className="text-[10px] text-gray-600 font-medium capitalize">
                {type}
              </span>
            </div>
          ))}
          {activeTypes.length === 0 && (
            <span className="text-[10px] text-gray-400 italic">No types detected</span>
          )}
        </div>
      </div>

      {/* Top Sources Section */}
      <div className="p-5 flex-1 flex flex-col">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-gray-900 text-[15px]">Top Sources Used</h3>
          <button className="text-indigo-600 text-xs font-medium hover:text-indigo-700 flex items-center gap-1">
            View all sources <ExternalLink className="w-3 h-3" />
          </button>
        </div>

        <div className="space-y-3 flex-1 overflow-y-auto pr-1">
          {sources.length > 0 ? sources.map((source, idx) => (
            <motion.div 
              key={idx}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.1 }}
              onClick={() => { if (source.url) window.open(source.url, '_blank') }}
              className={cn("group flex gap-3 p-3 rounded-xl border border-gray-100 bg-white transition-all", source.url ? "hover:border-indigo-100 hover:shadow-sm hover:bg-indigo-50/30 cursor-pointer" : "")}
            >
              <div className="w-6 h-6 rounded-full bg-indigo-50 text-indigo-600 flex items-center justify-center text-xs font-bold shrink-0 mt-0.5">
                {idx + 1}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2">
                  <h4 className="text-sm font-semibold text-gray-900 line-clamp-1 group-hover:text-indigo-700 transition-colors">{source.title || "Document Source"}</h4>
                  <ExternalLink className="w-3.5 h-3.5 text-gray-400 group-hover:text-indigo-500 shrink-0 mt-0.5 opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
                <div className="flex items-center gap-2 mt-1.5">
                  <span className="flex items-center gap-1 text-[11px] text-gray-500 bg-gray-50 px-1.5 py-0.5 rounded-md">
                    {source.title?.includes('Policy') ? <FileText className="w-3 h-3" /> : <ExternalLink className="w-3 h-3" />}
                    {source.title?.includes('Policy') ? 'PDF Document' : 'Web Page'}
                  </span>
                  <span className="text-[11px] text-gray-400">•</span>
                  <span className="text-[11px] text-gray-500">Relevance: {98 - idx}%</span>
                </div>
              </div>
            </motion.div>
          )) : (
            <div className="flex flex-col items-center justify-center h-full text-center text-gray-400 space-y-2">
               <FileText className="w-8 h-8 opacity-20" />
               <p className="text-sm">No sources used yet.</p>
            </div>
          )}
        </div>

        <div className="mt-6 pt-4 border-t border-gray-100 bg-gray-50/50 rounded-xl p-3 flex items-center justify-between">
          <div className="text-[10px] text-gray-500 space-y-0.5">
            <p className="font-medium text-gray-700">Content last updated: May 18, 2024, 09:15 AM</p>
            <p>We automatically update our knowledge base when website content changes.</p>
          </div>
          <button className="p-1.5 bg-white border border-gray-200 rounded-lg shadow-sm hover:bg-gray-50 text-indigo-600 transition-colors">
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      <KnowledgeGraphModal 
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
      />
    </div>
  )
}
