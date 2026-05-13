import { motion } from 'framer-motion'
import { Bot, User, CheckCircle2, AlertCircle, HelpCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Message } from '../store/userStore'
import { ClarificationChips } from './ClarificationChips'
import { useWebSocket } from '../hooks/useWebSocket'
import { useParams } from 'react-router-dom'
import { useState } from 'react'

import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { RagGraphModal } from './RagGraphModal'

interface MessageBubbleProps {
  message: Message
}

export const MessageBubble = ({ message }: MessageBubbleProps) => {
  const isAI = message.role === 'assistant'
  const { sessionId } = useParams<{ sessionId: string }>()
  const { sendMessage } = useWebSocket(sessionId || null)
  const [isGraphOpen, setIsGraphOpen] = useState(false)

  return (
    <motion.div
      initial={{ opacity: 0, y: 10, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      className={cn(
        "flex w-full gap-4 mb-6",
        isAI ? "justify-start" : "justify-end"
      )}
    >
      {isAI && (
        <div className="w-8 h-8 rounded-lg bg-[#ffffff] border border-[#e0e0e0] flex items-center justify-center flex-shrink-0 mt-1 shadow-sm">
          <Bot className="w-5 h-5 text-[#0f62fe]" />
        </div>
      )}

      <div className="flex flex-col gap-1 max-w-[80%] min-w-0">
        <div
          className={cn(
            "px-5 py-3.5 rounded-2xl relative transition-all",
            isAI 
              ? "bg-white border border-[#e0e0e0] text-[#161616] shadow-sm" 
              : "bg-[#0f62fe] text-white shadow-md shadow-[#0f62fe]/20"
          )}
        >
          <div className={cn(
            "text-sm leading-relaxed prose prose-sm max-w-none text-[#161616] break-words overflow-x-auto",
            "prose-p:leading-relaxed prose-pre:bg-[#f4f4f4] prose-pre:border prose-pre:border-[#e0e0e0] prose-pre:overflow-x-auto prose-p:text-[#161616] prose-strong:text-[#161616]",
            "prose-headings:text-[#161616] prose-headings:font-semibold prose-headings:mt-4 prose-headings:mb-2",
            "prose-a:text-[#0f62fe] hover:prose-a:text-[#0f62fe]/80",
            "prose-code:text-[#0f62fe] prose-code:bg-[#f4f4f4] prose-code:px-1 prose-code:rounded prose-code:before:content-none prose-code:after:content-none",
            !isAI && "prose-headings:text-white prose-p:text-white prose-strong:text-white prose-code:text-white prose-code:bg-black/20"
          )}>
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {message.content}
            </ReactMarkdown>
            {!message.content && isAI && (
              <div className="flex gap-1 items-center py-2">
                <span className="w-1.5 h-1.5 bg-[#0f62fe] rounded-full animate-bounce [animation-delay:-0.3s]" />
                <span className="w-1.5 h-1.5 bg-[#0f62fe] rounded-full animate-bounce [animation-delay:-0.15s]" />
                <span className="w-1.5 h-1.5 bg-[#0f62fe] rounded-full animate-bounce" />
              </div>
            )}
          </div>

          {/* Action Indicators */}
          {isAI && message.action && (
            <div className={cn(
              "mt-3 pt-3 border-t border-[#e0e0e0] flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider",
              message.action === 'resolve' && "text-[#24a148]",
              message.action === 'clarification' && "text-[#f1c21b]",
              message.action === 'escalated' && "text-[#da1e28]"
            )}>
              {message.action === 'resolve' && <CheckCircle2 className="w-3.5 h-3.5" />}
              {message.action === 'clarification' && <HelpCircle className="w-3.5 h-3.5" />}
              {message.action === 'escalated' && <AlertCircle className="w-3.5 h-3.5" />}
              {message.action}
            </div>
          )}

          {/* Source Indicators */}
          {isAI && message.sources && message.sources.length > 0 && (
            <div className="mt-3 pt-3 border-t border-[#e0e0e0] text-xs">
              <div className="flex items-center justify-between mb-2">
                <span className="font-semibold text-[#525252] uppercase tracking-wider text-[10px]">Sources Consulted:</span>
                <button 
                  onClick={() => setIsGraphOpen(true)}
                  className="text-[10px] text-[#0f62fe] font-semibold uppercase tracking-wider hover:underline flex items-center gap-1"
                >
                  View RAG Graph
                </button>
              </div>
              <div className="flex flex-col gap-1.5">
                {message.sources.map((s, idx) => {
                  const isFallback = s.title === "AI Fallback Knowledge";
                  return (
                    <div key={idx} className="flex items-center gap-2 bg-[#ffffff] p-2 rounded border border-[#e0e0e0] shadow-sm">
                      <span className={cn(
                          "w-2 h-2 rounded-full shadow-sm",
                          isFallback ? "bg-[#8a3ffc] shadow-[#8a3ffc]/50" : "bg-[#24a148] shadow-[#24a148]/50"
                        )} />
                      {isFallback ? (
                        <span className="font-medium text-[#161616] truncate flex-1">
                          Base Knowledge (LLM)
                        </span>
                      ) : s.url && s.url.startsWith('http') ? (
                        <a 
                          href={s.url} 
                          target="_blank" 
                          rel="noopener noreferrer" 
                          className="font-medium text-[#161616] truncate flex-1 hover:text-[#0f62fe] hover:underline transition-all"
                        >
                          {s.title}
                        </a>
                      ) : (
                        <span className="font-medium text-[#161616] truncate flex-1">
                          {s.title}
                        </span>
                      )}
                      <span className="text-[10px] text-[#525252] border border-[#e0e0e0] px-1.5 py-0.5 rounded uppercase tracking-wide bg-[#f4f4f4]">
                        {isFallback ? "Generative" : "Document"}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          
          <span className="text-[10px] text-[#a8a8a8] absolute bottom-[-18px] right-2 font-medium">
            {new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </span>
        </div>

        {isAI && message.suggestions && message.suggestions.length > 0 && (
          <ClarificationChips 
            suggestions={message.suggestions} 
            onSuggestionClick={sendMessage}
          />
        )}
      </div>

      {!isAI && (
        <div className="w-8 h-8 rounded-lg bg-[#ffffff] border border-[#e0e0e0] flex items-center justify-center flex-shrink-0 mt-1 shadow-sm">
          <User className="w-5 h-5 text-[#525252]" />
        </div>
      )}

      {isAI && (
        <RagGraphModal 
          isOpen={isGraphOpen} 
          onClose={() => setIsGraphOpen(false)} 
          message={message} 
        />
      )}
    </motion.div>
  )
}
