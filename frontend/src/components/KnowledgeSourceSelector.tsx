import { useEffect, useRef, useState, useMemo } from 'react'
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

  const displayLabel = useMemo(() => {
    if (selectedSources.length === 0) return "Website: All Sources"
    if (selectedSources.length === 1) {
      const source = availableSources.find(s => s.id === selectedSources[0])
      if (source) return `Website: ${source.title}`
    }
    return `${selectedSources.length} Sources`
  }, [selectedSources, availableSources])

  // We show all sources but only allow selection of indexed ones
  const allSources = availableSources

  return (
    <div className="relative w-fit mx-auto" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          "flex items-center gap-2 px-3 py-1.5 rounded-full border transition-all text-[13px] font-medium shadow-sm",
            selectedSources.length > 0
              ? "bg-indigo-50 border-indigo-200 text-indigo-700"
              : "bg-white border-gray-200 text-gray-600 hover:bg-gray-50"
          )}
      >
        <BookOpen className={cn("w-3.5 h-3.5", selectedSources.length > 0 ? "text-indigo-500" : "text-gray-400")} />
        <span className="truncate max-w-[150px]">
          {displayLabel}
        </span>
        <ChevronDown className={cn("w-3.5 h-3.5 text-gray-400 ml-0.5 transition-transform duration-200", isOpen && "rotate-180")} />
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 8, scale: 0.95, x: "-50%" }}
            animate={{ opacity: 1, y: 0, scale: 1, x: "-50%" }}
            exit={{ opacity: 0, y: 8, scale: 0.95, x: "-50%" }}
            transition={{ duration: 0.15 }}
            className="absolute top-full mt-3 left-1/2 w-72 bg-white border border-gray-200 rounded-2xl shadow-xl z-[100] overflow-hidden flex flex-col"
          >
            <div className="px-4 py-3 border-b border-gray-100 bg-gray-50/50">
              <h4 className="text-[10px] text-gray-500 font-bold uppercase tracking-widest">Select Context</h4>
              <p className="text-[10px] text-gray-400 mt-0.5">Filter answers by source</p>
            </div>
            <div className="max-h-60 overflow-y-auto p-2 flex flex-col gap-1">
              {allSources.length === 0 ? (
                <div className="p-4 text-center text-sm text-gray-500">
                  No sources available.
                </div>
              ) : (
                allSources.map((source) => {
                  const isSelected = selectedSources.includes(source.id)
                  const isReady = source.status === 'indexed'
                  return (
                    <button
                      key={source.id}
                      disabled={!isReady}
                      onClick={() => toggleSourceSelection(source.id)}
                      className={cn(
                        "flex items-center justify-between w-full px-3 py-2.5 rounded-xl text-left transition-all",
                        isSelected
                          ? "bg-indigo-50 text-indigo-700"
                          : isReady 
                            ? "text-gray-700 hover:bg-gray-50"
                            : "text-gray-400 cursor-not-allowed opacity-60"
                      )}
                    >
                      <div className="flex flex-col min-w-0 pr-2">
                        <span className="text-sm font-medium truncate">
                          {source.title || source.url.split('/').pop() || source.url}
                        </span>
                        {!isReady && (
                          <span className="text-[9px] uppercase tracking-tighter font-bold text-amber-500">
                            {source.status}...
                          </span>
                        )}
                      </div>
                      {isReady && (
                        <div className={cn(
                          "w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 transition-colors",
                          isSelected 
                            ? "bg-indigo-600 border-indigo-600 text-white" 
                            : "border-gray-300"
                        )}>
                          {isSelected && <Check className="w-3 h-3" />}
                        </div>
                      )}
                    </button>
                  )
                })
              )}
            </div>
            {selectedSources.length > 0 && (
              <div className="p-2 border-t border-gray-100 bg-gray-50/50">
                <button
                  onClick={() => {
                    // Clear all by toggling them off
                    selectedSources.forEach(id => toggleSourceSelection(id))
                    setIsOpen(false)
                  }}
                  className="w-full py-2 rounded-xl bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 text-xs font-bold uppercase tracking-widest transition-colors shadow-sm"
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
