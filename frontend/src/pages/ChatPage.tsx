import { useEffect, useRef, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { MessageBubble } from '../components/MessageBubble'
import { MessageInput } from '../components/MessageInput'
import { useUserStore } from '../store/userStore'
import { useWebSocket } from '../hooks/useWebSocket'
import { motion, AnimatePresence } from 'framer-motion'
import { Sparkles, MessageSquare, AlertTriangle, RefreshCcw } from 'lucide-react'
import { TicketNotification } from '../components/TicketNotification'

export const ChatPage = () => {
  const { sessionId } = useParams<{ sessionId: string }>()
  const navigate = useNavigate()
  const { messages, setSessionId, isStreaming, clearMessages, isConnected, fetchSessionHistory } = useUserStore()
  const { sendMessage } = useWebSocket(sessionId || null)
  const scrollRef = useRef<HTMLDivElement>(null)

  const lastMessage = messages[messages.length - 1]
  const isEscalated = lastMessage?.role === 'assistant' && lastMessage?.action === 'escalated'

  // Initialize session
  useEffect(() => {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

    if (!sessionId || !uuidRegex.test(sessionId)) {
      // Generate a valid UUID v4
      const newId = crypto.randomUUID()
      navigate(`/chat/${newId}`, { replace: true })
      return
    }
    setSessionId(sessionId)
    fetchSessionHistory(sessionId)
  }, [sessionId, setSessionId, navigate, fetchSessionHistory])

  // Auto-scroll
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages])

  return (
    <div className="flex flex-col h-full gap-6">
      {!isConnected && (
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center justify-between gap-3 px-4 py-2 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs font-medium"
        >
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4" />
            <span>Disconnected from AI Service. Check if backend is running.</span>
          </div>
          <button
            onClick={() => window.location.reload()}
            className="flex items-center gap-1.5 hover:text-white transition-colors"
          >
            <RefreshCcw className="w-3.5 h-3.5" />
            Retry
          </button>
        </motion.div>
      )}

      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto pr-4 scroll-smooth"
      >
        <AnimatePresence initial={false}>
          {messages.length === 0 ? (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="h-full flex flex-col items-center justify-center text-center px-6"
            >
              <div className="w-16 h-16 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center mb-6">
                <Sparkles className="w-8 h-8 text-nebula-blue" />
              </div>
              <h2 className="text-2xl font-bold text-white mb-2">How can I help you today?</h2>
              <p className="text-white/40 max-w-sm text-sm">
                I'm your AI-powered L2 support agent. I can help resolve technical issues, clarify documentation, or escalate to a human if needed.
              </p>

            </motion.div>
          ) : (
            <div className="flex flex-col">
              {messages.map((msg) => (
                <MessageBubble key={msg.id} message={msg} />
              ))}
              {isEscalated && (
                <TicketNotification
                  ticketId={`TKT-${sessionId?.toUpperCase()}`}
                  status="IN_REVIEW"
                />
              )}
            </div>
          )}
        </AnimatePresence>
      </div>

      <div className="flex-shrink-0">
        <MessageInput
          onSendMessage={sendMessage}
          disabled={isStreaming || !isConnected}
        />
        <div className="mt-3 flex items-center justify-center gap-4">
          <p className="text-[10px] text-white/20 uppercase tracking-widest font-medium">
            Shift + Enter for new line
          </p>
          <button
            onClick={() => {
              clearMessages()
              const newId = crypto.randomUUID()
              navigate(`/chat/${newId}`)
            }}
            className="text-[10px] text-nebula-blue/40 hover:text-nebula-blue/80 uppercase tracking-widest font-bold transition-colors"
          >
            New Ticket
          </button>
        </div>
      </div>
    </div>
  )
}
