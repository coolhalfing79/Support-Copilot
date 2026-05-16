import { useEffect, useRef, useCallback, useState } from 'react'
import { X, FileText, ExternalLink, BrainCircuit, Search, Plus, Minus } from 'lucide-react'
import { motion, AnimatePresence, type Variants } from 'framer-motion'
import { cn } from '@/lib/utils'
import type { SourceInfo } from '../store/userStore'
import axios from 'axios'
import { API_BASE_URL } from '@/config/api'

// Utility to strip markdown syntax from strings
const stripMarkdown = (s: string) => s.replace(/^[#*\-+\s]+/, '').replace(/[*_`]/g, '').trim()

// Blocklist for navigation headings that should never be highlighted
const NAV_HEADINGS = ['on this page', 'overview', 'introduction', 'table of contents', 'contents', 'in this section']

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */

/** "DocName · Section" capped at 20 chars, no ellipsis */
function chipLabel(source: SourceInfo): string {
  const isFallback = source.title === 'AI Fallback Knowledge'
  if (isFallback) return 'General knowledge'

  const doc = stripMarkdown(source.title || 'Document')
  const rawSection = source.chunk_excerpt ? source.chunk_excerpt.split(/[.\n]/)[0]?.trim() : ''
  const section = stripMarkdown(rawSection)

  if (!section) return doc
  return `${doc} · ${section}`
}

/** Detect whether content looks like code */
function looksLikeCode(text: string): boolean {
  const codeSignals = ['{', '}', '=>', 'function ', 'import ', 'const ', 'class ', '</', '();', '= {']
  let hits = 0
  for (const sig of codeSignals) {
    if (text.includes(sig)) hits++
  }
  return hits >= 2
}

/** Heuristic match score */
function inferScore(source: SourceInfo): number {
  const isFallback = source.title === 'AI Fallback Knowledge'
  if (isFallback) return 0.80
  const len = (source.chunk_excerpt || '').length
  if (len > 400) return 0.92
  if (len > 200) return 0.85
  if (len > 80) return 0.72
  return 0.55
}

/** Derive a section name from the first meaningful line of the excerpt */
function deriveSection(excerpt: string): string {
  if (!excerpt) return ''
  const firstLine = excerpt.split(/[\n.]/)[0]?.trim() || ''
  // If it looks like code or a class list, use a generic label
  if (looksLikeCode(firstLine) || firstLine.length < 3) return 'Component reference'
  return firstLine.length > 50 ? firstLine.slice(0, 50) + '…' : firstLine
}

/* ------------------------------------------------------------------ */
/*  Highlighted excerpt                                                */
/* ------------------------------------------------------------------ */

function HighlightedExcerpt({ text, query }: { text: string; query: string }) {
  const cleanText = stripMarkdown(text)
  if (NAV_HEADINGS.includes(cleanText.toLowerCase())) {
    return <span className="font-semibold text-slate-800">{cleanText}</span>
  }
  if (!query || query.length < 3) {
    return <span className="text-slate-600 leading-relaxed">{cleanText}</span>
  }

  const queryWords = query.toLowerCase().split(/\s+/).filter(w => w.length >= 3)
  if (queryWords.length === 0) return <span className="text-slate-600 leading-relaxed">{cleanText}</span>

  const escapedWords = queryWords.map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  const pattern = new RegExp(`(${escapedWords.join('|')})`, 'gi')
  const parts = cleanText.split(pattern)

  return (
    <span className="text-slate-600 leading-relaxed">
      {parts.map((part, i) =>
        pattern.test(part) ? (
          <mark key={i} className="bg-yellow-200 text-slate-900 rounded-sm px-0.5 font-medium">{part}</mark>
        ) : (
          part
        )
      )}
    </span>
  )
}

/* ------------------------------------------------------------------ */
/*  Source Chips                                                        */
/* ------------------------------------------------------------------ */

interface SourceChipsProps {
  sources: SourceInfo[]
  activeIndex: number | null
  onChipClick: (index: number) => void
}

const chipVariants: Variants = {
  hidden: { opacity: 0, y: 6 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.08, duration: 0.25, ease: 'easeOut' },
  }),
}

export const SourceChips = ({ sources, activeIndex, onChipClick }: SourceChipsProps) => {
  return (
    <div className="flex flex-wrap gap-1.5 mt-2">
      {sources.map((s, idx) => {
        const isFallback = s.title === 'AI Fallback Knowledge'
        const isActive = activeIndex === idx

        return (
          <motion.button
            key={idx}
            custom={idx}
            variants={chipVariants}
            initial="hidden"
            animate="visible"
            onClick={() => onChipClick(idx)}
            title={chipLabel(s)}
            className={cn(
              'inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[11px] font-medium',
              'border transition-colors cursor-pointer select-none max-w-[180px]',
              isActive
                ? 'border-[#3B5BDB] bg-[#EEF2FF] text-[#3B5BDB]'
                : 'border-[#e0e0e0] bg-[#f4f4f4] text-[#525252] hover:bg-[#e8e8e8] hover:border-[#c6c6c6]'
            )}
          >
            {isFallback
              ? <BrainCircuit className="w-3 h-3 flex-shrink-0" />
              : <FileText className="w-3 h-3 flex-shrink-0" />
            }
            <span className="truncate">{chipLabel(s)}</span>
          </motion.button>
        )
      })}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  D3 Knowledge Graph Component                                      */
/* ------------------------------------------------------------------ */

interface D3Node {
  id: string
  label: string
  type: 'hub' | 'source' | 'chunk' | 'content' | 'more'
  matched: boolean
  tooltip: string
  content?: string
  width?: number
  height?: number
  x?: number
  y?: number
  vx?: number
  vy?: number
  fx?: number | null
  fy?: number | null
}

interface D3Edge {
  source: string | D3Node
  target: string | D3Node
  type: 'retrieval' | 'chunk'
}


interface D3KnowledgeGraphProps {
  nodes: D3Node[]
  edges: D3Edge[]
  expandedNodeId: string | null
  onNodeToggle: (id: string | null) => void
}

// Minimal D3 types since we're using a script tag
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type D3Any = any;

function useD3(callback: (d3: D3Any) => void, dependencies: unknown[]) {
  useEffect(() => {
    let isMounted = true
    const windowWithD3 = window as unknown as { d3: D3Any }
    if (windowWithD3.d3) {
      callback(windowWithD3.d3)
      return
    }
    const script = document.createElement('script')
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/d3/7.8.5/d3.min.js'
    script.async = true
    script.onload = () => {
      if (isMounted) callback(windowWithD3.d3)
    }
    document.head.appendChild(script)
    return () => { isMounted = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, dependencies)
}

function D3KnowledgeGraph({ nodes, edges, expandedNodeId, onNodeToggle }: D3KnowledgeGraphProps) {
  const svgRef = useRef<SVGSVGElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const zoomRef = useRef<D3Any>(null)
  const [zoomLevel, setZoomLevel] = useState("1.0x") 
  const [tooltip, setTooltip] = useState<{ show: boolean, text: string, x: number, y: number }>({ show: false, text: '', x: 0, y: 0 })

  useD3((d3) => {
    if (!svgRef.current || !containerRef.current) return
    const svg = d3.select(svgRef.current)
    const width = containerRef.current.clientWidth || 480
    const height = 320

    svg.selectAll("*").remove()

    // Setup zoom
    const g = svg.append("g")
    const zoom = d3.zoom()
      .scaleExtent([0.5, 3])
      .on("zoom", (e: D3Any) => {
        g.attr("transform", e.transform)
        setZoomLevel(e.transform.k.toFixed(1) + "x")
      })
    zoomRef.current = zoom
    svg.call(zoom)
      .on("click", (e: MouseEvent) => {
        if (e.target === svgRef.current) {
          onNodeToggle(null)
        }
      })

    // Defs for arrows
    const defs = svg.append("defs")
    defs.append("marker")
      .attr("id", "arrow-retrieval")
      .attr("viewBox", "0 -5 10 10")
      .attr("refX", 40)
      .attr("refY", 0)
      .attr("markerWidth", 6)
      .attr("markerHeight", 6)
      .attr("orient", "auto")
      .append("path")
      .attr("d", "M0,-5L10,0L0,5")
      .attr("fill", "#3B5BDB")

    defs.append("marker")
      .attr("id", "arrow-chunk")
      .attr("viewBox", "0 -5 10 10")
      .attr("refX", 45)
      .attr("refY", 0)
      .attr("markerWidth", 5)
      .attr("markerHeight", 5)
      .attr("orient", "auto")
      .append("path")
      .attr("d", "M0,-5L10,0L0,5")
      .attr("fill", "#2EAF7D")

    // Separate content nodes from regular nodes for force logic
    const hubNode = nodes.find(n => n.type === 'hub')
    const srcNode = nodes.find(n => n.type === 'source')
    const chunkNodes = nodes.filter(n => n.type === 'chunk')
    const contentNode = nodes.find(n => n.type === 'content')
    
    // Phase 1 Simulation (Non-content nodes)
    const baseNodes = nodes.filter(n => n.type !== 'content' && n.type !== 'more')
    const baseEdges = edges.filter(e => {
        const sId = typeof e.source === 'string' ? e.source : (e.source as unknown as D3Node).id
        const tId = typeof e.target === 'string' ? e.target : (e.target as unknown as D3Node).id
        return baseNodes.some(n => n.id === sId) && baseNodes.some(n => n.id === tId)
    })

    if (hubNode) { hubNode.x = 80; hubNode.y = height / 2; }
    if (srcNode) { srcNode.x = 220; srcNode.y = height / 2; }
    chunkNodes.forEach((n, i) => {
      n.x = 380; 
      n.y = height / 2 + (i - (chunkNodes.length - 1) / 2) * 55;
    })

    const simulation = d3.forceSimulation(baseNodes)
      .force("link", d3.forceLink(baseEdges).id((d: D3Node) => d.id).distance((d: D3Edge) => d.type === 'retrieval' ? 140 : 160))
      .force("collide", d3.forceCollide().radius((d: D3Node) => {
          if (d.type === 'hub') return 65;
          if (d.type === 'source') return 50;
          const cleanLabel = stripMarkdown(d.label)
          const w = Math.max(110, cleanLabel.length * 7.5 + 24)
          return w / 2 + 16;
      }))
      .force("charge", d3.forceManyBody().strength(-280))
      .force("x", d3.forceX((d: D3Node) => {
          if (d.type === 'hub') return 80;
          if (d.type === 'source') return 220;
          return 380;
      }).strength(0.5))
      .force("y", d3.forceY((d: D3Node) => {
         if (d.type === 'hub' || d.type === 'source') return height / 2;
         const idx = chunkNodes.indexOf(d);
         return height / 2 + (idx - (chunkNodes.length - 1) / 2) * 55;
      }).strength((d: D3Node) => (d.type === 'hub' || d.type === 'source') ? 0.9 : 0.25))

    simulation.tick(500)
    simulation.stop()

    // Phase 2 Simulation (If content node exists)
    if (contentNode && expandedNodeId) {
      const parentChunk = chunkNodes.find(n => n.id === expandedNodeId)
      if (parentChunk) {
        contentNode.x = (parentChunk.x || 0) + 50
        contentNode.y = parentChunk.y || 0
        
        const phase2Simulation = d3.forceSimulation(nodes.filter(n => n.type !== 'more'))
          .force("link", d3.forceLink(edges).id((d: D3Node) => d.id).distance((d: D3Edge) => (d.target as unknown as D3Node).type === 'content' ? 120 : 160))
          .force("collide", d3.forceCollide().radius((d: D3Node) => d.type === 'content' ? 115 : 110))
          .force("charge", d3.forceManyBody().strength(-300))
          .force("x", d3.forceX((d: D3Node) => {
            if (d.type === 'content') return (parentChunk.x || 0) + 220;
            if (d.type === 'hub') return 80;
            if (d.type === 'source') return 220;
            return 380;
          }).strength(0.5))
          .force("y", d3.forceY((d: D3Node) => {
            if (d.type === 'content') return parentChunk.y || height / 2;
            if (d.type === 'hub' || d.type === 'source') return height / 2;
            const idx = chunkNodes.indexOf(d);
            return height / 2 + (idx - (chunkNodes.length - 1) / 2) * 55;
          }).strength((d: D3Node) => d.type === 'content' ? 0.6 : (d.type === 'chunk' ? 0.25 : 0.9)))

        phase2Simulation.tick(200)
        phase2Simulation.stop()
      }
    }

    // Draw Edges
    const link = g.append("g")
      .attr("class", "links")
      .selectAll("path")
      .data(edges)
      .enter().append("path")
      .attr("class", (d: D3Edge) => `link ${(d.source as unknown as D3Node).id} ${(d.target as unknown as D3Node).id}`)
      .attr("fill", "none")
      .attr("stroke", (d: D3Edge) => d.type === 'retrieval' ? "#3B5BDB" : "#2EAF7D")
      .attr("stroke-width", (d: D3Edge) => d.type === 'retrieval' ? 2 : 1.5)
      .attr("stroke-dasharray", (d: D3Edge) => d.type === 'retrieval' ? "6,3" : "none")
      .attr("marker-end", (d: D3Edge) => d.type === 'retrieval' ? "url(#arrow-retrieval)" : "url(#arrow-chunk)")
      .attr("d", (d: D3Edge) => {
        const s = d.source as unknown as D3Node;
        const t = d.target as unknown as D3Node;
        return `M${s.x},${s.y} L${t.x},${t.y}`
      })

    // Draw Nodes
    const nodeGroup = g.append("g")
      .attr("class", "nodes")
      .selectAll("g")
      .data(nodes.filter(n => n.type !== 'more'))
      .enter().append("g")
      .attr("transform", (d: D3Node) => `translate(${d.x},${d.y})`)
      .style("cursor", (d: D3Node) => d.type === 'chunk' ? 'pointer' : 'default')

    // Shapes
    nodeGroup.each(function(this: SVGElement, d: D3Node) {
      const el = d3.select(this)
      if (d.type === 'hub') {
        el.append("circle").attr("r", 52).attr("fill", "#3B5BDB").attr("fill-opacity", 1)
      } else if (d.type === 'source') {
        el.append("rect").attr("width", 80).attr("height", 36).attr("x", -40).attr("y", -18).attr("rx", 8).attr("fill", "#0E7490").attr("fill-opacity", 1)
      } else if (d.type === 'chunk') {
        const cleanLabel = stripMarkdown(d.label)
        const nodeWidth = Math.max(110, cleanLabel.length * 7.5 + 24)
        const nodeHeight = d.matched ? 30 : 28
        
        d.width = nodeWidth
        d.height = nodeHeight

        el.append("rect")
          .attr("width", nodeWidth)
          .attr("height", nodeHeight)
          .attr("x", -nodeWidth/2)
          .attr("y", -nodeHeight/2)
          .attr("rx", d.matched ? 15 : 14)
          .attr("fill", d.matched ? "#2EAF7D" : "#D4CFC6")
          .attr("fill-opacity", 1)
          .attr("opacity", d.matched ? 1 : 0.8)

        if (d.matched) {
          el.append("circle")
            .attr("r", 4)
            .attr("cx", nodeWidth/2 + 4)
            .attr("cy", -nodeHeight/2 - 4)
            .attr("fill", "#1A7A54")
            .attr("fill-opacity", 1)
        }
      } else if (d.type === 'content') {
        const nodeWidth = 200
        const nodeHeight = 80 
        el.append("rect")
          .attr("width", nodeWidth)
          .attr("height", nodeHeight)
          .attr("x", -nodeWidth/2)
          .attr("y", -nodeHeight/2)
          .attr("rx", 8)
          .attr("fill", "#F0FDF9")
          .attr("fill-opacity", 1)
          .attr("stroke", "#2EAF7D")
          .attr("stroke-width", 1.5)

        const fo = el.append("foreignObject")
          .attr("x", -nodeWidth/2 + 10)
          .attr("y", -nodeHeight/2 + 10)
          .attr("width", nodeWidth - 20)
          .attr("height", nodeHeight - 20)

        fo.append("xhtml:div")
          .style("font-family", "sans-serif")
          .style("font-size", "9px")
          .style("color", "#0A4A33")
          .style("overflow", "hidden")
          .style("display", "-webkit-box")
          .style("-webkit-line-clamp", "5")
          .style("-webkit-box-orient", "vertical")
          .style("line-height", "1.4")
          .html(`${d.label || 'No content available'}`)
      }
    })

    // Node Labels
    nodeGroup.append("text")
      .text((d: D3Node) => {
        if (d.type === 'more') return "" 
        const clean = stripMarkdown(d.label)
        if (d.type === 'hub') return "Knowledge Base"
        if (d.type === 'source') return clean
        return clean
      })
      .attr("text-anchor", "middle")
      .attr("dy", 4)
      .attr("fill", (d: D3Node) => {
        if (d.type === 'hub') return "#E8EEFF"
        if (d.type === 'source') return "#E0F7FA"
        return d.matched ? "#0A4A33" : "#7A756C"
      })
      .attr("font-size", "10px")
      .attr("font-weight", "bold")
      .attr("font-family", "sans-serif")
      .style("visibility", (d: D3Node) => d.type === 'content' ? "hidden" : "visible")

    // Hover interactions
    nodeGroup.on("mouseover", function(this: SVGElement, e: MouseEvent, d: D3Node) {
      nodeGroup.style("opacity", (n: D3Node) => (n.id === d.id || isConnected(n, d)) ? 1 : 0.3)
      link.style("opacity", (l: D3Edge) => {
          const s = l.source as unknown as D3Node;
          const t = l.target as unknown as D3Node;
          return (s.id === d.id || t.id === d.id) ? 1 : 0.15
      })
      
      link.filter((l: D3Edge) => {
          const s = l.source as unknown as D3Node;
          const t = l.target as unknown as D3Node;
          return s.id === d.id || t.id === d.id
      })
        .attr("stroke-width", 3)
        .attr("stroke-opacity", 1)
      
      if (d.type !== 'content') {
        let ttText = d.tooltip
        if (d.type === 'chunk') {
          ttText = (expandedNodeId === d.id) ? "Click to collapse" : d.tooltip
        }
        setTooltip({ show: true, text: ttText, x: e.pageX, y: e.pageY })
      }
    }).on("mouseout", function() {
      nodeGroup.style("opacity", 1)
      link.style("opacity", 1)
      link.attr("stroke-width", (d: D3Edge) => d.type === 'retrieval' ? 2 : 1.5)
      setTooltip({ show: false, text: '', x: 0, y: 0 })
    }).on("click", function(this: SVGElement, e: MouseEvent, d: D3Node) {
      e.stopPropagation()
      if (d.type === 'chunk') {
        onNodeToggle(expandedNodeId === d.id ? null : d.id)
      } else if (d.label && d.label.startsWith('+ ') && d.label.endsWith(' more')) {
        onNodeToggle('SHOW_MORE_ACTION')
      }
    })

    function isConnected(a: D3Node, b: D3Node) {
      return edges.some((e: D3Edge) => {
          const s = e.source as unknown as D3Node;
          const t = e.target as unknown as D3Node;
          return (s.id === a.id && t.id === b.id) || (s.id === b.id && t.id === a.id)
      })
    }

    const validNodes = nodes.filter(n => typeof n.x === 'number' && typeof n.y === 'number')
    if (validNodes.length === 0) return

    const allX = validNodes.map(n => n.x as number)
    const allY = validNodes.map(n => n.y as number)
    const minX = Math.min(...allX)
    const maxX = Math.max(...allX)
    const minY = Math.min(...allY)
    const maxY = Math.max(...allY)
    const scale = Math.min(width / (maxX - minX + 80), height / (maxY - minY + 80), 1)
    const translate = [
      (width - (maxX + minX) * scale) / 2,
      (height - (maxY + minY) * scale) / 2
    ]
    svg.call(zoom.transform, d3.zoomIdentity.translate(translate[0], translate[1]).scale(scale))
    setZoomLevel(scale.toFixed(1) + "x")
  }, [nodes, edges, expandedNodeId])

  const moreNode = nodes.find(n => n.id === 'more-pill')

  return (
    <div ref={containerRef} className="w-full h-full relative bg-transparent overflow-hidden group" style={{ isolation: 'isolate' }}>
      <svg ref={svgRef} className="w-full h-full" />
      
      <div className="absolute bottom-4 left-4 flex flex-col items-start gap-4">
        {moreNode && (
          <motion.button
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            onClick={(e: React.MouseEvent) => {
              e.stopPropagation()
              onNodeToggle('SHOW_MORE_ACTION')
            }}
            className="flex items-center gap-2 px-3 py-1.5 bg-[#F4F3F0] border border-[#B4B0A8] border-dashed rounded-full text-[10px] font-bold text-[#7A756C] hover:bg-[#E8E4D8] hover:border-solid transition-all shadow-sm"
          >
            {moreNode.label}
          </motion.button>
        )}

        <div className="flex flex-col gap-2">
          <button 
            onClick={() => {
              if (svgRef.current && zoomRef.current) {
                 const d3 = (window as unknown as { d3: D3Any }).d3
                 d3.select(svgRef.current).transition().duration(300).call(zoomRef.current.scaleBy, 1.3)
              }
            }}
            className="p-1.5 bg-white shadow-md border border-[#e0e0e0] rounded-md hover:bg-[#EEF2FF] text-[#3B5BDB] transition-colors"
            title="Zoom In"
          >
            <Plus size={14} />
          </button>
          <button 
            onClick={() => {
              if (svgRef.current && zoomRef.current) {
                const d3 = (window as unknown as { d3: D3Any }).d3
                d3.select(svgRef.current).transition().duration(300).call(zoomRef.current.scaleBy, 0.7)
              }
            }}
            className="p-1.5 bg-white shadow-md border border-[#e0e0e0] rounded-md hover:bg-[#EEF2FF] text-[#3B5BDB] transition-colors"
            title="Zoom Out"
          >
            <Minus size={14} />
          </button>
        </div>
      </div>

      <div className="absolute bottom-4 right-4 text-[11px] font-mono pointer-events-none px-2 py-1 bg-white/50 backdrop-blur-sm rounded border border-[#e0e0e0]/50" style={{ color: '#7A756C' }}>
        {zoomLevel}
      </div>
      
      <AnimatePresence>
        {tooltip.show && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.15 }}
            className="fixed z-[100] bg-[#1E1E2E] text-[#E8EEFF] text-[12px] font-medium py-[6px] px-[10px] rounded-[6px] border border-[#3B5BDB] shadow-lg pointer-events-none whitespace-pre-wrap max-w-[220px]"
            style={{ left: tooltip.x + 10, top: tooltip.y + 10 }}
          >
            {tooltip.text}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function GraphDataWrapper({ activeSourceId, source, answerContent }: { activeSourceId: string, source: SourceInfo | null, answerContent?: string }) {
  const [nodes, setNodes] = useState<D3Node[]>([])
  const [edges, setEdges] = useState<D3Edge[]>([])
  const [loading, setLoading] = useState(true)
  const [showAll, setShowAll] = useState(false)
  const [expandedNodeId, setExpandedNodeId] = useState<string | null>(null)

  useEffect(() => {
    let isMounted = true
    const fetchGraph = async () => {
      try {
        const response = await axios.get(`${API_BASE_URL}/knowledge/graph`)
        if (!isMounted) return
        const data = response.data

        const activeSourceNode = data.nodes.find((n: { id: string }) => n.id === activeSourceId)
        if (!activeSourceNode) {
            setLoading(false)
            return
        }

        const newNodes: D3Node[] = [
            { id: 'root', type: 'hub', label: 'Knowledge Base', matched: false, tooltip: `${data.nodes.length - 1} sources indexed` },
            { id: activeSourceId, type: 'source', label: activeSourceNode.label, matched: false, tooltip: `${activeSourceNode.chunk_count || 0} chunks · last indexed 2h ago` }
        ]

        const newEdges: D3Edge[] = [
            { source: 'root', target: activeSourceId, type: 'retrieval' }
        ]

        interface Chunk {
          excerpt: string;
        }
        const chunks = (activeSourceNode.chunks as Chunk[]) || []
        const totalChunks = chunks.length > 0 ? chunks.length : (activeSourceNode.chunk_count || 0)
        const initialLimit = 7
        const displayLimit = showAll ? Math.min(totalChunks, 20) : initialLimit
        const hasMore = totalChunks > initialLimit && !showAll
        
        const normalize = (s: string) => s.toLowerCase().replace(/[#*\-_`\s]+/g, '')
        
        const isFallbackAnswer = !answerContent || /general knowledge|does not contain information|not mentioned in the provided|not found in the provided|cannot answer this based on/i.test(answerContent)

        const retrievedSources: string[] = []
        if (!isFallbackAnswer && source) {
            if (source.title) retrievedSources.push(source.title)
            if (source.chunk_excerpt) {
                source.chunk_excerpt.split(/[.\n]+/).forEach((b: string) => {
                    if (b.trim().length > 10) retrievedSources.push(b)
                })
            }
            if (answerContent) retrievedSources.push(answerContent)
        }

        for (let i = 0; i < displayLimit; i++) {
            let label = `Chunk ${i + 1}`
            if (chunks[i]) {
                const derived = deriveSection(chunks[i].excerpt)
                if (derived) label = derived
            }
            const cleanLabel = label.replace(/^[\s#*]+/, '')
            
            const normLabel = normalize(cleanLabel)
            const isMatched = retrievedSources.some(rs => {
                const normRs = normalize(rs)
                return normLabel.includes(normRs) || normRs.includes(normLabel)
            })

            const chunkId = `chunk-${i}`
            
            const tooltipStr = `${cleanLabel}\n\n${isMatched ? '✅ matched' : '❌ not matched'}`

            newNodes.push({
                id: chunkId,
                type: 'chunk',
                label: cleanLabel,
                content: chunks[i]?.excerpt || '',
                matched: isMatched,
                tooltip: tooltipStr
            })
            
            newEdges.push({
                source: activeSourceId,
                target: chunkId,
                type: 'chunk'
            })

            if (expandedNodeId === chunkId) {
                const contentNodeId = `${chunkId}-content`
                newNodes.push({
                    id: contentNodeId,
                    type: 'content',
                    label: stripMarkdown(chunks[i]?.excerpt || 'No content'),
                    matched: isMatched,
                    tooltip: 'Full excerpt'
                })
                newEdges.push({
                    source: chunkId,
                    target: contentNodeId,
                    type: 'chunk'
                })
            }
        }

        if (hasMore) {
            const moreId = 'more-pill'
            newNodes.push({
                id: moreId,
                type: 'more',
                label: `+ ${totalChunks - initialLimit} more`,
                matched: false,
                tooltip: 'Click to expand all chunks'
            })
        }

        setNodes(newNodes)
        setEdges(newEdges)
      } catch (err: unknown) {
        console.error("Failed to fetch graph", err)
      } finally {
        if (isMounted) setLoading(false)
      }
    }
    fetchGraph()
    return () => { isMounted = false }
  }, [activeSourceId, source, showAll, expandedNodeId, answerContent])

  if (loading) {
      return <div className="w-full h-full flex items-center justify-center text-xs text-[#a8a8a8]">Loading Graph...</div>
  }

  return (
    <D3KnowledgeGraph 
      nodes={nodes} 
      edges={edges} 
      expandedNodeId={expandedNodeId}
      onNodeToggle={(id) => {
        if (id === 'SHOW_MORE_ACTION') {
            setShowAll(true)
        } else {
            setExpandedNodeId(id)
        }
      }} 
    />
  )
}

/* ------------------------------------------------------------------ */
/*  Source Detail Panel                                                 */
/* ------------------------------------------------------------------ */

interface SourceDetailPanelProps {
  source: SourceInfo | null
  isOpen: boolean
  onClose: () => void
  userQuery: string
  answerContent: string
}

export const SourceDetailPanel = ({ source, isOpen, onClose, userQuery, answerContent }: SourceDetailPanelProps) => {
  const panelRef = useRef<HTMLDivElement>(null)

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') onClose()
  }, [onClose])

  useEffect(() => {
    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown)
      return () => document.removeEventListener('keydown', handleKeyDown)
    }
  }, [isOpen, handleKeyDown])

  const handleBackdropClick = useCallback((e: React.MouseEvent) => {
    if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
      onClose()
    }
  }, [onClose])

  if (!source) return null

  const score = inferScore(source)
  const pct = Math.round(score * 100)

  const bullets = source.chunk_excerpt
    ? source.chunk_excerpt.split(/[.\n]+/).filter(s => s.trim().length > 10).slice(0, 6)
    : []

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <div className="fixed inset-0 z-40 bg-black/5" onClick={handleBackdropClick} />

          <motion.div
            ref={panelRef}
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'tween', duration: 0.3, ease: 'easeOut' }}
            className="fixed top-0 right-0 z-50 h-full w-[480px] bg-white flex flex-col shadow-2xl border-l border-[#e0e0e0] max-sm:w-full"
          >
            <div className="h-[60%] w-full relative" style={{
              background: '#f4f4f4',
              border: '0.5px solid #e0e0e0',
              borderRadius: '8px',
              overflow: 'hidden'
            }}>
              <GraphDataWrapper activeSourceId={source.source_id} source={source} answerContent={answerContent} />
              <button
                onClick={onClose}
                className="absolute top-4 left-4 p-1.5 bg-white shadow-sm border border-[#e0e0e0] rounded-md hover:bg-gray-50 z-10 text-gray-600"
              >
                <X size={16} />
              </button>
            </div>

            <div className="h-[40%] flex flex-col bg-white">
              <div className="flex-1 overflow-y-auto p-5">
                
                <section className="mb-6">
                  <h4 className="mb-2" style={{ fontVariantCaps: 'small-caps', fontSize: '11px', letterSpacing: '0.06em', color: '#8d8d8d' }}>Why this was retrieved</h4>
                  <div className="flex items-start gap-2">
                    <Search className="w-4 h-4 text-[#a8a8a8] shrink-0 mt-0.5" />
                    <p className="text-sm text-[#393939] italic">
                      "{userQuery}"
                    </p>
                  </div>
                </section>

                <div style={{ borderBottom: '0.5px solid #e0e0e0', marginBottom: '24px' }} />

                <section className="mb-6">
                  <h4 className="mb-2" style={{ fontVariantCaps: 'small-caps', fontSize: '11px', letterSpacing: '0.06em', color: '#8d8d8d' }}>Match Score</h4>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs text-[#525252] font-medium">Relevance</span>
                    <span className="text-xs font-bold text-[#24a148]">{pct}%</span>
                  </div>
                  <div className="w-full h-1.5 bg-[#e0e0e0] rounded-full overflow-hidden">
                    <div className="h-full bg-[#24a148]" style={{ width: `${pct}%` }} />
                  </div>
                </section>

                <div style={{ borderBottom: '0.5px solid #e0e0e0', marginBottom: '24px' }} />

                <section className="mb-6">
                  <h4 className="mb-2" style={{ fontVariantCaps: 'small-caps', fontSize: '11px', letterSpacing: '0.06em', color: '#8d8d8d' }}>Relevant Excerpt</h4>
                  <ul className="list-disc pl-5 space-y-1.5">
                    {bullets.map((b, i) => {
                      const cleanB = stripMarkdown(b)
                      if (!cleanB) return null
                      return (
                        <li key={i} className="text-xs text-[#393939] leading-relaxed">
                          <HighlightedExcerpt text={cleanB} query={userQuery} />
                        </li>
                      )
                    })}
                  </ul>
                </section>

                <div style={{ borderBottom: '0.5px solid #e0e0e0', marginBottom: '24px' }} />

                <section className="mb-6">
                  <h4 className="mb-2" style={{ fontVariantCaps: 'small-caps', fontSize: '11px', letterSpacing: '0.06em', color: '#8d8d8d' }}>Used to answer</h4>
                  {(!answerContent || /general knowledge|does not contain information|not mentioned in the provided|not found in the provided|cannot answer this based on/i.test(answerContent)) ? (
                    <p className="text-xs text-[#da1e28] leading-relaxed">
                      This source was retrieved but <span className="font-semibold">not used</span> for the response due to insufficient relevance.
                    </p>
                  ) : (
                    <p className="text-xs text-[#393939] leading-relaxed">
                      Provided supporting context from <span className="font-semibold">{stripMarkdown(source.title)}</span> for the response.
                    </p>
                  )}
                </section>

              </div>

              <div className="px-5 py-3 border-t border-[#e0e0e0] bg-[#f4f4f4] flex items-center justify-between shrink-0">
                {(() => {
                  let finalUrl = source.url || '#'
                  if (source.chunk_excerpt && finalUrl !== '#') {
                    const section = deriveSection(source.chunk_excerpt)
                    if (section) {
                      const anchor = section.toLowerCase()
                        .replace(/[^\w\s-]/g, '')
                        .split(/\s+/).slice(0, 5).join('-')
                        .substring(0, 40)
                      finalUrl = `${finalUrl.split('#')[0]}#${anchor}`
                    }
                  }
                  return (
                    <a
                      href={finalUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1.5 text-[11px] font-bold text-[#0f62fe] hover:underline uppercase tracking-wide"
                    >
                      Open full document
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  )
                })()}
                <span className="text-[9px] font-bold tracking-wider px-2.5 py-1 rounded bg-[#e5f0ff] text-[#0043ce] border border-[#0f62fe]/20 uppercase">
                  RAG
                </span>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
