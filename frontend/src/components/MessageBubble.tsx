import { motion } from 'framer-motion'
import { Bot, User, CheckCircle2, AlertCircle, HelpCircle, Copy, Check } from 'lucide-react'
import { useState } from 'react'
import { cn } from '@/lib/utils'
import type { Message } from '../store/userStore'
import { ClarificationChips } from './ClarificationChips'
import { useWebSocket } from '../hooks/useWebSocket'
import { useParams } from 'react-router-dom'

import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

interface MessageBubbleProps {
  message: Message
}

export const MessageBubble = ({ message }: MessageBubbleProps) => {
  const isAI = message.role === 'assistant'
  const [copied, setCopied] = useState(false)
  const { sessionId } = useParams<{ sessionId: string }>()
  const { sendMessage } = useWebSocket(sessionId || null)

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(message.content.replace(/[#*`_~]/g, ''))
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      console.error('Failed to copy text')
    }
  }

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
        <div className="w-8 h-8 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center flex-shrink-0 mt-1">
          <Bot className="w-5 h-5 text-nebula-blue" />
        </div>
      )}

      <div className="flex flex-col gap-1 max-w-[80%]">
        <div
          className={cn(
            "px-5 py-3.5 rounded-2xl relative transition-all",
            isAI
              ? "glass-panel text-white/90"
              : "bg-gradient-to-br from-nebula-blue to-nebula-purple text-white shadow-lg shadow-nebula-blue/10"
          )}
        >
          <div className={cn(
            "text-sm leading-relaxed prose prose-invert prose-sm max-w-none",
            "prose-p:leading-relaxed prose-pre:bg-white/5 prose-pre:border prose-pre:border-white/10",
            "prose-headings:text-white prose-headings:font-semibold prose-headings:mt-4 prose-headings:mb-2",
            "prose-a:text-nebula-blue hover:prose-a:text-nebula-blue/80",
            "prose-code:text-nebula-blue prose-code:bg-white/5 prose-code:px-1 prose-code:rounded prose-code:before:content-none prose-code:after:content-none",
            !isAI && "prose-headings:text-white prose-p:text-white prose-strong:text-white prose-code:text-white prose-code:bg-black/20"
          )}>
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {message.content}
            </ReactMarkdown>
            {!message.content && isAI && (
              <div className="flex gap-1 items-center py-2">
                <span className="w-1.5 h-1.5 bg-white/40 rounded-full animate-bounce [animation-delay:-0.3s]" />
                <span className="w-1.5 h-1.5 bg-white/40 rounded-full animate-bounce [animation-delay:-0.15s]" />
                <span className="w-1.5 h-1.5 bg-white/40 rounded-full animate-bounce" />
              </div>
            )}
          </div>

          <span className="text-[10px] text-white/30 absolute bottom-[-18px] right-2 font-medium">
            {new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </span>
        </div>

        {/* Copy Button (below bubble for AI responses) */}
        {isAI && (
          <button
            onClick={handleCopy}
            className="self-start flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-white/40 hover:text-white/70 transition-all text-xs font-medium"
            title="Copy response"
          >
            {copied ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-400" />
                <span className="text-emerald-400">Copied!</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5" />
                <span>Copy</span>
              </>
            )}
          </button>
        )}

        {isAI && message.suggestions && message.suggestions.length > 0 && (
          <ClarificationChips
            suggestions={message.suggestions}
            onSuggestionClick={sendMessage}
          />
        )}
      </div>

      {!isAI && (
        <div className="w-8 h-8 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center flex-shrink-0 mt-1">
          <User className="w-5 h-5 text-white/60" />
        </div>
      )}
    </motion.div>
  )
}
