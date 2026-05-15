import React, { useEffect, useState } from 'react';
import {
  ReactFlow,
  Controls,
  Background,
  useNodesState,
  useEdgesState,
  MarkerType,
  Handle,
  Position,
  type Node,
  type Edge
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import axios from 'axios';
import { FileText, Database, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface GraphNodeData extends Record<string, unknown> {
  label: string;
  status?: string;
  chunk_count?: number;
  content?: string;
  url?: string;
  isActive?: boolean;
}

type CustomNode = Node<GraphNodeData>;

// --- Custom Nodes ---
const RootNode = ({ data }: { data: GraphNodeData }) => (
  <div className="flex flex-col items-center justify-center w-24 h-24 bg-[#0f62fe] rounded-full text-white shadow-lg border-4 border-[#e5f0ff]">
    <Database className="w-6 h-6 mb-1" />
    <span className="text-[10px] font-bold text-center leading-tight px-2">{data.label}</span>
    <Handle type="source" position={Position.Right} className="opacity-0" />
  </div>
);

const SourceNode = ({ data }: { data: GraphNodeData }) => (
  <div className={`flex flex-col p-3 rounded-xl border-2 transition-all w-48 shadow-sm ${data.isActive ? 'border-[#0f62fe] bg-[#f4f8ff] shadow-[#0f62fe]/20' : 'border-[#e0e0e0] bg-white'}`}>
    <Handle type="target" position={Position.Left} className="opacity-0" />
    <div className="flex items-start gap-2 mb-2">
      <FileText className={`w-4 h-4 shrink-0 mt-0.5 ${data.isActive ? 'text-[#0f62fe]' : 'text-gray-400'}`} />
      <span className="text-[11px] font-bold text-gray-800 leading-tight break-words line-clamp-3">
        {data.label}
      </span>
    </div>
    <div className="flex justify-between items-center mt-auto pt-2 border-t border-gray-100">
      <span className="text-[9px] text-gray-500 font-medium uppercase">{data.status}</span>
      <span className="text-[9px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-600 font-bold">{data.chunk_count} chunks</span>
    </div>
  </div>
);

const nodeTypes = {
  rootNode: RootNode,
  sourceNode: SourceNode,
};

interface KnowledgeGraphProps {
  activeSourceIds?: string[];
}

interface ServerNode {
  id: string;
  type: string;
  label: string;
  status?: string;
  chunk_count?: number;
  content?: string;
  url?: string;
}

interface ServerEdge {
  id: string;
  source: string;
  target: string;
}

export const KnowledgeGraph: React.FC<KnowledgeGraphProps> = ({ activeSourceIds = [] }) => {
  const [nodes, setNodes, onNodesChange] = useNodesState<CustomNode>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [loading, setLoading] = useState(true);
  const [selectedNodeData, setSelectedNodeData] = useState<GraphNodeData | null>(null);

  useEffect(() => {
    const fetchGraph = async () => {
      try {
        const response = await axios.get('http://localhost:8000/api/v1/knowledge/graph');
        const data = response.data as { nodes: ServerNode[], edges: ServerEdge[] };
        
        const newNodes: CustomNode[] = data.nodes.map((n: ServerNode, i: number) => {
           if (n.type === 'root') {
               return {
                   id: n.id,
                   type: 'rootNode',
                   position: { x: 50, y: 300 },
                   data: { label: n.label }
               };
           } else {
               // Layout in a semi-circle to the right of the root
               const totalSources = data.nodes.length - 1;
               const index = i - 1; // 0-indexed for sources
               
               // Spread angle between -60 and +60 degrees
               const spread = Math.PI / 1.5; 
               const angle = totalSources > 1 ? -spread/2 + (spread * (index / (totalSources - 1))) : 0;
               const radius = 300;
               
               return {
                   id: n.id,
                   type: 'sourceNode',
                   position: { 
                       x: 50 + 100 + radius * Math.cos(angle), 
                       y: 300 + radius * Math.sin(angle) 
                   },
                   data: { 
                       label: n.label,
                       status: n.status,
                       chunk_count: n.chunk_count,
                       content: n.content,
                       url: n.url,
                       isActive: false
                   }
               };
           }
        });

        const newEdges: Edge[] = data.edges.map((e: ServerEdge) => ({
            id: e.id,
            source: e.source,
            target: e.target,
            animated: true,
            style: { stroke: '#e0e0e0', strokeWidth: 1.5 },
            markerEnd: { type: MarkerType.ArrowClosed, color: '#e0e0e0' }
        }));

        setNodes(newNodes);
        setEdges(newEdges);
      } catch (err: unknown) {
        console.error("Failed to fetch graph", err);
      } finally {
        setLoading(false);
      }
    };
    fetchGraph();
  }, [setNodes, setEdges]);

  useEffect(() => {
      setNodes(nds => nds.map(n => {
          if (n.id === 'root') return n;
          const isActive = activeSourceIds.includes(n.id);
          return {
              ...n,
              data: { ...n.data, isActive }
          };
      }));
      setEdges(eds => eds.map(e => {
          const isActive = activeSourceIds.includes(e.target);
          return {
              ...e,
              animated: isActive,
              style: { stroke: isActive ? '#0f62fe' : '#e0e0e0', strokeWidth: isActive ? 2 : 1.5 },
              markerEnd: { type: MarkerType.ArrowClosed, color: isActive ? '#0f62fe' : '#e0e0e0' }
          };
      }));
  }, [activeSourceIds, setNodes, setEdges]);

  const onNodeClick = (_: React.MouseEvent, node: CustomNode) => {
      if (node.id !== 'root') {
          setSelectedNodeData(node.data);
      }
  };

  if (loading) {
      return <div className="w-full h-full flex items-center justify-center text-xs text-[#a8a8a8]">Loading Graph...</div>;
  }

  return (
    <div className="relative w-full h-full bg-[#f4f4f4] rounded-2xl overflow-hidden border border-[#e0e0e0] flex">
      <div className="flex-1 h-full">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onNodeClick={onNodeClick}
            fitView
            fitViewOptions={{ padding: 0.2 }}
          >
            <Background color="#ccc" gap={16} size={1} />
            <Controls showInteractive={false} />
          </ReactFlow>
      </div>

      <AnimatePresence>
          {selectedNodeData && (
              <motion.div 
                  initial={{ x: '100%', opacity: 0 }}
                  animate={{ x: 0, opacity: 1 }}
                  exit={{ x: '100%', opacity: 0 }}
                  transition={{ type: "spring", damping: 25, stiffness: 200 }}
                  className="absolute right-0 top-0 bottom-0 w-80 bg-white border-l border-[#e0e0e0] shadow-2xl flex flex-col z-10"
              >
                  <div className="p-4 border-b border-[#e0e0e0] flex justify-between items-start bg-gray-50">
                      <div>
                          <h3 className="text-sm font-bold text-gray-900 leading-tight pr-4">{selectedNodeData.label}</h3>
                          <p className="text-[10px] text-gray-500 mt-1 uppercase tracking-wider font-semibold">{selectedNodeData.status} • {selectedNodeData.chunk_count} Chunks</p>
                      </div>
                      <button onClick={() => setSelectedNodeData(null)} className="p-1 hover:bg-gray-200 rounded-md transition-colors text-gray-500 shrink-0">
                          <X className="w-4 h-4" />
                      </button>
                  </div>
                  <div className="p-4 flex-1 overflow-y-auto">
                      <h4 className="text-xs font-bold text-gray-800 mb-2 uppercase tracking-wide">RAG Context Snapshot</h4>
                      {selectedNodeData.content ? (
                          <div className="text-[11px] text-gray-700 font-mono bg-gray-50 p-3 rounded-lg border border-gray-100 whitespace-pre-wrap leading-relaxed">
                              {selectedNodeData.content}
                          </div>
                      ) : (
                          <p className="text-xs text-gray-400 italic">No context available. Content may not have been fully ingested.</p>
                      )}
                  </div>
              </motion.div>
          )}
      </AnimatePresence>
    </div>
  );
};
