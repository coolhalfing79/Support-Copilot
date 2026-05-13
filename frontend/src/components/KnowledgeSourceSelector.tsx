import { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { BookOpen, Check, ChevronDown } from 'lucide-react'
import { useUserStore } from '../store/userStore'
import { cn } from '../lib/utils'

export const KnowledgeSourceSelector = () => {
  const { availableSources, selectedSources, fetchAvailableSources, toggleSourceSelection } = useUserStore()
  const [isOpen, setIsOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    fetchAvailableSources()
  }, [fetchAvailableSources])

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // We only show indexed/ready sources
  const readySources = availableSources.filter(s => s.status === 'indexed')

  if (readySources.length === 0) return null

  return (
    <div className="relative w-fit mx-auto" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          "flex items-center gap-2 px-4 py-2 rounded-xl border transition-all text-xs font-bold uppercase tracking-widest",
            selectedSources.length > 0
              ? "bg-[#0f62fe]/10 border-[#0f62fe]/20 text-[#0f62fe]"
              : "bg-white border-[#e0e0e0] text-[#525252] hover:bg-[#f4f4f4] hover:text-[#161616] shadow-sm"
          )}
      >
        <BookOpen className="w-4 h-4" />
        <span>
          {selectedSources.length === 0 
            ? "All Knowledge" 
            : `${selectedSources.length} Source${selectedSources.length > 1 ? 's' : ''}`}
        </span>
        <ChevronDown className={cn("w-3.5 h-3.5 transition-transform duration-200", isOpen && "rotate-180")} />
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 8, scale: 0.95, x: "-50%" }}
            animate={{ opacity: 1, y: 0, scale: 1, x: "-50%" }}
            exit={{ opacity: 0, y: 8, scale: 0.95, x: "-50%" }}
            transition={{ duration: 0.15 }}
            className="absolute top-full mt-3 left-1/2 w-72 bg-white border border-[#e0e0e0] rounded-2xl shadow-xl z-[100] overflow-hidden flex flex-col"
          >
            <div className="px-4 py-3 border-b border-[#e0e0e0] bg-[#f4f4f4]">
              <h4 className="text-[10px] text-[#525252] font-bold uppercase tracking-widest">Select Context</h4>
              <p className="text-[10px] text-[#a8a8a8] mt-0.5">Filter answers by source</p>
            </div>
            <div className="max-h-60 overflow-y-auto p-2 flex flex-col gap-1">
              {readySources.map((source) => {
                const isSelected = selectedSources.includes(source.id)
                return (
                  <button
                    key={source.id}
                    onClick={() => toggleSourceSelection(source.id)}
                    className={cn(
                      "flex items-center justify-between w-full px-3 py-2.5 rounded-xl text-left transition-all",
                      isSelected
                        ? "bg-[#0f62fe]/10 text-[#0f62fe]"
                        : "text-[#525252] hover:bg-[#f4f4f4] hover:text-[#161616]"
                    )}
                  >
                    <div className="flex flex-col min-w-0 pr-2">
                      <span className="text-sm font-medium truncate">
                        {source.title || source.url.split('/').pop() || source.url}
                      </span>
                    </div>
                    <div className={cn(
                      "w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 transition-colors",
                      isSelected 
                        ? "bg-[#0f62fe] border-[#0f62fe] text-white" 
                        : "border-[#c6c6c6]"
                    )}>
                      {isSelected && <Check className="w-3 h-3" />}
                    </div>
                  </button>
                )
              })}
            </div>
            {selectedSources.length > 0 && (
              <div className="p-2 border-t border-[#e0e0e0] bg-[#f4f4f4]">
                <button
                  onClick={() => {
                    // Clear all by toggling them off
                    selectedSources.forEach(id => toggleSourceSelection(id))
                    setIsOpen(false)
                  }}
                  className="w-full py-2 rounded-xl bg-white border border-[#e0e0e0] hover:bg-[#e0e0e0] text-[#525252] hover:text-[#161616] text-xs font-bold uppercase tracking-widest transition-colors shadow-sm"
                >
                  Clear Selection
                </button>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
