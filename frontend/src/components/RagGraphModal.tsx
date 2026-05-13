import React, { useMemo } from 'react';
import { X, Database, BrainCircuit, MessageSquare, Search, FileText } from 'lucide-react';
import { ReactFlow, Controls, Background, MarkerType, useNodesState, useEdgesState } from '@xyflow/react';
import type { Node, Edge } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import type { Message } from '../store/userStore';
import { useUserStore } from '../store/userStore';
import { motion, AnimatePresence } from 'framer-motion';

interface RagGraphModalProps {
  isOpen: boolean;
  onClose: () => void;
  message: Message;
}

export const RagGraphModal = ({ isOpen, onClose, message }: RagGraphModalProps) => {
  const { messages } = useUserStore();

  const userQuery = useMemo(() => {
    const idx = messages.findIndex(m => m.id === message.id);
    if (idx > 0 && messages[idx - 1].role === 'user') {
      return messages[idx - 1].content;
    }
    return "User Query";
  }, [messages, message.id]);

  const { initialNodes, initialEdges } = useMemo(() => {
    const nodes: Node[] = [];
    const edges: Edge[] = [];
    const edgeStyle = { stroke: '#8a3ffc', strokeWidth: 2 };
    const markerEnd = { type: MarkerType.ArrowClosed, color: '#8a3ffc' };

    // 1. User Query
    nodes.push({
      id: 'user_query',
      position: { x: 400, y: 50 },
      data: {
        label: (
          <div className="flex flex-col items-center gap-2 p-2 w-64">
            <div className="bg-[#f4f4f4] p-2 rounded-full"><MessageSquare className="w-5 h-5 text-[#0f62fe]" /></div>
            <span className="font-bold text-[#161616] text-sm text-center">User Query</span>
            <span className="text-xs text-[#525252] truncate w-full text-center" title={userQuery}>"{userQuery}"</span>
          </div>
        )
      },
      style: { background: '#ffffff', border: '2px solid #0f62fe', borderRadius: '12px', width: '256px' }
    });

    // 2. Vector Search
    nodes.push({
      id: 'vector_search',
      position: { x: 400, y: 200 },
      data: {
        label: (
          <div className="flex flex-col items-center gap-2 p-2 w-48" title="Executing k-NN search against ChromaDB using BAAI/bge-small-en-v1.5 embeddings to find semantically similar documentation.">
            <div className="bg-[#f4f4f4] p-2 rounded-full"><Search className="w-5 h-5 text-[#0043ce]" /></div>
            <span className="font-bold text-[#161616] text-sm text-center">Semantic Search</span>
            <span className="text-xs text-[#525252] text-center">Querying ChromaDB</span>
          </div>
        )
      },
      style: { background: '#ffffff', border: '2px solid #0043ce', borderRadius: '12px', width: '192px' }
    });
    edges.push({ id: 'e-uq-vs', source: 'user_query', target: 'vector_search', animated: true, style: edgeStyle, markerEnd });

    // 3. Retrieved Context Chunks
    const sources = message.sources || [];
    const xStart = 400 - ((sources.length - 1) * 160); // Center the chunks
    
    if (sources.length === 0) {
      nodes.push({
        id: 'no_chunks',
        position: { x: 400, y: 350 },
        data: {
          label: (
            <div className="flex flex-col items-center gap-2 p-2 w-48">
              <div className="bg-[#fff0f1] p-2 rounded-full"><Database className="w-5 h-5 text-[#da1e28]" /></div>
              <span className="font-bold text-[#161616] text-sm text-center">No Context Found</span>
            </div>
          )
        },
        style: { background: '#ffffff', border: '2px solid #da1e28', borderRadius: '12px', width: '200px' }
      });
      edges.push({ id: 'e-vs-nc', source: 'vector_search', target: 'no_chunks', style: edgeStyle, markerEnd });
    } else {
      sources.forEach((source, idx) => {
        const isFallback = source.title === "AI Fallback Knowledge";
        const nId = `chunk_${idx}`;
        nodes.push({
          id: nId,
          position: { x: xStart + (idx * 320), y: 350 },
          data: {
            label: (
              <div className="flex flex-col gap-2 p-3 w-[280px] text-left">
                <div className="flex items-center gap-2 mb-1">
                  {isFallback ? <BrainCircuit className="w-4 h-4 text-[#8a3ffc]" /> : <FileText className="w-4 h-4 text-[#24a148]" />}
                  <span className="font-bold text-[#161616] text-xs truncate uppercase tracking-wider">{isFallback ? "LLM Base Knowledge" : "Document Context"}</span>
                </div>
                <div className="text-[11px] font-medium text-[#0f62fe] truncate bg-[#e5f0ff] px-2 py-1 rounded">{source.title}</div>
                <div className="text-[10px] text-[#525252] mt-2 whitespace-pre-wrap break-all overflow-x-hidden w-full max-h-[150px] overflow-y-auto bg-[#f4f4f4] p-2 rounded border border-[#e0e0e0] font-mono leading-relaxed text-left" style={{ textAlign: 'left', wordBreak: 'break-all', overflowWrap: 'anywhere' }}>
                  {source.chunk_excerpt}
                </div>
              </div>
            )
          },
          style: { background: '#ffffff', border: `2px solid ${isFallback ? '#8a3ffc' : '#24a148'}`, borderRadius: '12px', padding: 0, width: '280px' }
        });
        edges.push({ id: `e-vs-${nId}`, source: 'vector_search', target: nId, animated: true, style: { stroke: isFallback ? '#8a3ffc' : '#24a148', strokeWidth: 2 }, markerEnd: { type: MarkerType.ArrowClosed, color: isFallback ? '#8a3ffc' : '#24a148' } });
        
        // Edge to LLM
        edges.push({ id: `e-${nId}-llm`, source: nId, target: 'llm', animated: true, style: { stroke: isFallback ? '#8a3ffc' : '#24a148', strokeWidth: 2 }, markerEnd: { type: MarkerType.ArrowClosed, color: isFallback ? '#8a3ffc' : '#24a148' } });
      });
    }

    // 4. LLM Generation
    nodes.push({
      id: 'llm',
      position: { x: 400, y: 600 },
      data: {
        label: (
          <div className="flex flex-col items-center gap-2 p-2 w-48" title="Synthesizing the final answer using the Gemini LLM, strictly grounded in the provided context chunks.">
            <div className="bg-[#f4f4f4] p-2 rounded-full"><BrainCircuit className="w-5 h-5 text-[#8a3ffc]" /></div>
            <span className="font-bold text-[#161616] text-sm text-center">Gemini 2.0 Flash</span>
            <span className="text-xs text-[#525252] text-center">Synthesizing Answer</span>
          </div>
        )
      },
      style: { background: '#ffffff', border: '2px solid #8a3ffc', borderRadius: '12px', width: '192px' }
    });

    if (sources.length === 0) {
      edges.push({ id: 'e-nc-llm', source: 'no_chunks', target: 'llm', animated: true, style: edgeStyle, markerEnd });
    }

    // 5. Final Output
    nodes.push({
      id: 'final_answer',
      position: { x: 400, y: 750 },
      data: {
        label: (
          <div className="flex flex-col items-center gap-2 p-2 w-64" title="The final response delivered to the user UI.">
            <span className="font-bold text-[#161616] text-sm text-center">Final AI Response</span>
            <span className="text-xs text-[#525252] truncate w-full text-center">"{message.content.slice(0, 60)}..."</span>
          </div>
        )
      },
      style: { background: '#ffffff', border: '2px solid #161616', borderRadius: '12px', width: '256px' }
    });
    edges.push({ id: 'e-llm-fa', source: 'llm', target: 'final_answer', animated: true, style: edgeStyle, markerEnd });

    return { initialNodes: nodes, initialEdges: edges };
  }, [message.sources, message.content, userQuery]);

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  React.useEffect(() => {
    setNodes(initialNodes);
    setEdges(initialEdges);
  }, [initialNodes, initialEdges, setNodes, setEdges]);

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-8 bg-black/60 backdrop-blur-sm">
        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          className="bg-[#f4f4f4] w-full max-w-6xl h-[85vh] rounded-2xl shadow-2xl flex flex-col overflow-hidden border border-[#e0e0e0]"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 bg-white border-b border-[#e0e0e0]">
            <div className="flex items-center gap-3">
              <div className="bg-[#e5f0ff] p-2 rounded-lg">
                <BrainCircuit className="w-5 h-5 text-[#0f62fe]" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-[#161616]">RAG Pipeline Visualization</h3>
                <p className="text-xs text-[#525252]">Retrieval-Augmented Generation context map for this response</p>
              </div>
            </div>
            <button 
              onClick={onClose}
              className="p-2 hover:bg-[#f4f4f4] rounded-full transition-colors"
            >
              <X className="w-5 h-5 text-[#161616]" />
            </button>
          </div>

          {/* Graph Canvas */}
          <div className="flex-1 w-full bg-[#f4f4f4] relative">
            <ReactFlow 
              nodes={nodes} 
              edges={edges} 
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              fitView
              minZoom={0.2}
              defaultViewport={{ x: 0, y: 0, zoom: 0.8 }}
              attributionPosition="bottom-right"
            >
              <Background color="#c6c6c6" gap={16} />
              <Controls className="bg-white border-[#e0e0e0] fill-[#161616]" />
            </ReactFlow>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
