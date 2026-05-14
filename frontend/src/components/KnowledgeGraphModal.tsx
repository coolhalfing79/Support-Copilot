import React, { useMemo, useState, useEffect } from 'react';
import { X, Share2, Info, Lock, Unlock, Download, Maximize2, Zap } from 'lucide-react';
import { ReactFlow, Controls, Background, useReactFlow, ReactFlowProvider, type Node, type Edge } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useUserStore } from '../store/userStore';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '../lib/utils';

interface KnowledgeGraphModalProps {
  isOpen: boolean;
  onClose: () => void;
}

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

const getNodeStyles = (type: string, isHovered: boolean, hoveredNode: string | null) => {
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

const KnowledgeGraphModalContent = ({ isOpen, onClose }: KnowledgeGraphModalProps) => {
  const currentGraph = useUserStore(state => state.currentGraph);
  const currentGraphQuery = useUserStore(state => state.currentGraphQuery);
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);
  const [isLocked, setIsLocked] = useState(false);
  const { fitView } = useReactFlow();

  useEffect(() => {
    if (isOpen && currentGraph) {
      setTimeout(() => fitView({ duration: 800, padding: 0.1 }), 200);
    }
  }, [isOpen, currentGraph, fitView]);

  const rfNodes: Node[] = useMemo(() => {
    if (!currentGraph || currentGraph.nodes.length === 0) return [];
    
    const count = currentGraph.nodes.length;
    const centerX = 400;
    const centerY = 300;
    const radius = count > 5 ? 200 : 150;
    
    return currentGraph.nodes.map((node, i) => {
      const angle = (i * 2 * Math.PI) / count;
      const x = node.x ?? (centerX + radius * Math.cos(angle));
      const y = node.y ?? (centerY + radius * Math.sin(angle));
      const isHovered = hoveredNode === node.id;

      return {
        id: node.id,
        position: { x, y },
        data: { label: node.label },
        style: getNodeStyles(node.type, isHovered, hoveredNode),
      };
    });
  }, [currentGraph, hoveredNode]);

  const rfEdges: Edge[] = useMemo(() => {
    if (!currentGraph) return [];
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
      };
    });
  }, [currentGraph, hoveredNode]);

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[150] flex items-center justify-center p-4 sm:p-8 bg-[#0a0a0a]/90 backdrop-blur-xl">
        <motion.div 
          initial={{ opacity: 0, scale: 0.9, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.9, y: 20 }}
          className="bg-white w-full max-w-7xl h-[90vh] rounded-[32px] shadow-2xl flex flex-col overflow-hidden border border-white/20"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-8 py-6 bg-white border-b border-gray-100 shrink-0">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-2xl bg-indigo-600 flex items-center justify-center shadow-xl shadow-indigo-600/20">
                <Share2 className="w-6 h-6 text-white" />
              </div>
              <div>
                <h3 className="text-xl font-bold text-gray-900 tracking-tight">Interactive Knowledge Explorer</h3>
                <p className="text-sm text-gray-500 font-medium">Visualizing relationships and data entities across your documentation</p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1 bg-gray-50 p-1.5 rounded-2xl border border-gray-100">
                <button 
                  onClick={() => fitView({ duration: 800 })}
                  className="p-2.5 hover:bg-white hover:shadow-sm rounded-xl text-gray-500 hover:text-indigo-600 transition-all group relative"
                >
                  <Maximize2 className="w-5 h-5" />
                  <span className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 bg-gray-900 text-white text-[10px] px-2 py-1 rounded opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity whitespace-nowrap font-bold">Fit View</span>
                </button>
                <button 
                  onClick={() => setIsLocked(!isLocked)}
                  className={cn(
                    "p-2.5 rounded-xl transition-all group relative",
                    isLocked ? "bg-white shadow-sm text-amber-600" : "hover:bg-white hover:shadow-sm text-gray-500 hover:text-indigo-600"
                  )}
                >
                  {isLocked ? <Lock className="w-5 h-5" /> : <Unlock className="w-5 h-5" />}
                  <span className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 bg-gray-900 text-white text-[10px] px-2 py-1 rounded opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity whitespace-nowrap font-bold">{isLocked ? 'Unlock Graph' : 'Lock Graph'}</span>
                </button>
                <button className="p-2.5 hover:bg-white hover:shadow-sm rounded-xl text-gray-500 hover:text-indigo-600 transition-all group relative">
                  <Download className="w-5 h-5" />
                  <span className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 bg-gray-900 text-white text-[10px] px-2 py-1 rounded opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity whitespace-nowrap font-bold">Export Graph</span>
                </button>
              </div>
              
              <div className="w-px h-8 bg-gray-100 mx-2" />
              
              <button 
                onClick={onClose}
                className="p-3 bg-gray-50 hover:bg-red-50 text-gray-400 hover:text-red-600 rounded-2xl border border-gray-100 transition-all active:scale-95"
              >
                <X className="w-6 h-6" />
              </button>
            </div>
          </div>

          {/* Main Area */}
          <div className="flex-1 flex overflow-hidden">
            {/* Sidebar for details */}
            <div className="w-80 border-r border-gray-100 bg-gray-50/50 p-6 flex flex-col gap-6 overflow-y-auto shrink-0">
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Active Context</label>
                <div className="p-4 bg-white rounded-2xl border border-gray-100 shadow-sm italic text-sm text-gray-600 leading-relaxed">
                  "{currentGraphQuery || 'Global Knowledge Space'}"
                </div>
              </div>

              <div className="space-y-4">
                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Legend</label>
                <div className="grid grid-cols-1 gap-2">
                  {Object.entries(nodeTypeConfig).map(([type, config]) => {
                    const isPresent = currentGraph?.nodes.some(n => n.type.toLowerCase() === type);
                    if (!isPresent) return null;
                    return (
                      <div key={type} className="flex items-center gap-3 p-2 rounded-xl bg-white shadow-sm border border-gray-100 animate-in fade-in zoom-in-95 duration-300">
                        <div className="w-3 h-3 rounded-full" style={{ backgroundColor: config.border }} />
                        <span className="text-xs font-bold text-gray-700 capitalize">{type}</span>
                      </div>
                    );
                  })}
                  {(!currentGraph || currentGraph.nodes.length === 0) && (
                    <p className="text-[11px] text-gray-400 italic px-2">No nodes to categorize</p>
                  )}
                </div>
              </div>

              <div className="mt-auto p-4 bg-indigo-600 rounded-[24px] text-white space-y-3 shadow-xl shadow-indigo-600/20">
                <div className="w-8 h-8 rounded-xl bg-white/20 flex items-center justify-center">
                  <Zap className="w-4 h-4 text-white" />
                </div>
                <h4 className="font-bold text-sm leading-tight">Advanced Discovery</h4>
                <p className="text-[11px] text-indigo-100 leading-relaxed">
                  Drag nodes to explore hidden paths. Use scroll wheel to zoom into specific clusters.
                </p>
              </div>
            </div>

            {/* Graph Canvas */}
            <div className="flex-1 bg-white relative">
              <ReactFlow 
                nodes={rfNodes} 
                edges={rfEdges} 
                nodesDraggable={!isLocked}
                nodesConnectable={false}
                elementsSelectable={!isLocked}
                fitView
                onNodeMouseEnter={(_, node) => setHoveredNode(node.id)}
                onNodeMouseLeave={() => setHoveredNode(null)}
                proOptions={{ hideAttribution: true }}
              >
                <Background color="#cbd5e1" gap={20} size={1} />
                <Controls className="!m-6 !shadow-2xl !border-gray-100 !rounded-2xl overflow-hidden" />
              </ReactFlow>
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};

export const KnowledgeGraphModal = (props: KnowledgeGraphModalProps) => (
  <ReactFlowProvider>
    <KnowledgeGraphModalContent {...props} />
  </ReactFlowProvider>
);
