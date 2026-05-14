import { useEffect, useRef, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useUserStore } from '../store/userStore'
import { useWebSocket } from '../hooks/useWebSocket'
import { motion, AnimatePresence } from 'framer-motion'
import { Globe, HelpCircle, Send, Plus, Sparkles, Mic, FileText, ChevronDown, CheckCircle2, ThumbsUp, ThumbsDown, Copy, RefreshCcw, RefreshCw, BrainCircuit, AlertCircle } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { KnowledgeSourceSelector } from '../components/KnowledgeSourceSelector'
import { useAuthStore } from '../store/authStore'
import apiClient from '../config/api'

export const ChatPage = () => {
  const { sessionId } = useParams<{ sessionId: string }>()
  const navigate = useNavigate()
  const { messages, setSessionId, isStreaming, clearMessages, isConnected, fetchSessionHistory, createTicket, selectedSources } = useUserStore()
  const { user } = useAuthStore()
  const { sendMessage } = useWebSocket(sessionId || null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const [input, setInput] = useState('')
  const [suggestions, setSuggestions] = useState<string[]>([])
  const [loadingSuggestions, setLoadingSuggestions] = useState(false)

  useEffect(() => {
    const fetchSuggestions = async () => {
      setLoadingSuggestions(true)
      try {
        const response = await apiClient.post('/chat/suggestions', selectedSources)
        setSuggestions(response.data)
      } catch (err) {
        console.error("Failed to fetch suggestions", err)
        setSuggestions([
            "What kind of information can you provide?",
            "How do I use this knowledge assistant?",
            "Tell me about the sources you have access to.",
            "Show me some key topics you can help with."
        ])
      } finally {
        setLoadingSuggestions(false)
      }
    }
    
    if (messages.length === 0) {
      fetchSuggestions()
    }
  }, [selectedSources, messages.length])

  useEffect(() => {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    if (!sessionId || !uuidRegex.test(sessionId)) {
      const newId = crypto.randomUUID()
      navigate(`/chat/${newId}`, { replace: true })
      return
    }
    setSessionId(sessionId)
    fetchSessionHistory(sessionId)
  }, [sessionId, setSessionId, navigate, fetchSessionHistory])

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!input.trim() || isStreaming) return
    sendMessage(input)
    setInput('')
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit(e as any)
    }
  }

  return (
    <div className="flex flex-col h-full bg-white relative">
      {/* Main Chat Area */}
      <div 
        ref={scrollRef}
        className="flex-1 overflow-y-auto px-6 pt-8 pb-60 scroll-smooth"
      >
        <div className="max-w-3xl mx-auto flex flex-col gap-8">
          <AnimatePresence initial={false}>
            {messages.length === 0 ? (
              <motion.div 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex flex-col items-center justify-center text-center mt-10"
              >
                <div className="w-16 h-16 rounded-2xl bg-indigo-50 flex items-center justify-center mb-6 shadow-sm border border-indigo-100">
                  <Sparkles className="w-8 h-8 text-indigo-600" />
                </div>
                <h2 className="text-2xl font-bold text-gray-900 mb-2">What would you like to know?</h2>
                <p className="text-gray-500 max-w-md text-sm">
                  I can analyze documentation, summarize policies, and provide instant answers grounded in our official sources.
                </p>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-10 w-full">
                  {loadingSuggestions ? (
                    Array(4).fill(0).map((_, i) => (
                      <div key={i} className="h-16 rounded-2xl border border-gray-100 bg-gray-50 animate-pulse" />
                    ))
                  ) : (
                    suggestions.map((suggestion) => (
                      <button
                        key={suggestion}
                        onClick={() => sendMessage(suggestion)}
                        className="p-4 rounded-2xl border border-gray-100 bg-white hover:border-indigo-100 hover:bg-indigo-50/30 text-left transition-all group"
                      >
                        <p className="text-sm font-medium text-gray-700 group-hover:text-indigo-700">{suggestion}</p>
                      </button>
                    ))
                  )}
                </div>
              </motion.div>
            ) : (
              messages.map((msg, index) => {
                const isLast = index === messages.length - 1;
                return (
                  <motion.div 
                    key={msg.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className={`flex flex-col gap-2 w-full ${msg.role === 'user' ? 'items-end' : 'items-start'}`}
                  >
                    {msg.role === 'user' ? (
                      <div className="flex items-start gap-3 flex-row-reverse max-w-[85%]">
                        <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center shrink-0">
                          <span className="text-indigo-700 font-semibold text-xs">AD</span>
                        </div>
                        <div className="bg-indigo-50 text-indigo-900 px-5 py-3 rounded-2xl rounded-tr-sm text-[15px] leading-relaxed shadow-sm">
                          {msg.content}
                          <div className="text-[10px] text-indigo-400 mt-1 text-right">
                            {new Date(msg.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-start gap-4 w-full">
                         <div className="w-8 h-8 rounded-full bg-indigo-600 flex items-center justify-center shrink-0 mt-1 shadow-md">
                           <BrainCircuit className="text-white w-4 h-4" />
                         </div>
                         <div className="flex-1 min-w-0 max-w-[90%]">
                           <div className="bg-white border border-gray-100 shadow-sm rounded-2xl p-5 text-[15px] text-gray-800 leading-relaxed">
                             <div className="flex justify-between items-center mb-2">
                               <span className="text-[11px] text-gray-400 font-medium">
                                 {new Date(msg.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                               </span>
                             </div>
                             
                             <div className="prose prose-sm max-w-none prose-p:leading-relaxed prose-headings:font-semibold prose-a:text-indigo-600 prose-li:marker:text-indigo-400">
                               {msg.content ? (
                                 <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                   {msg.content}
                                 </ReactMarkdown>
                               ) : (
                                 <div className="flex items-center gap-2 text-indigo-600 font-medium italic">
                                   <RefreshCw className="w-4 h-4 animate-spin" />
                                   Analyzing knowledge base...
                                 </div>
                               )}
                             </div>

                             {msg.sources && msg.sources.length > 0 && (
                               <div className="mt-6 pt-4 border-t border-gray-100">
                                 <h4 className="flex items-center gap-2 text-sm font-semibold text-gray-900 mb-3">
                                   <Sparkles className="w-4 h-4 text-indigo-500" /> Key Points
                                 </h4>
                                 <ul className="space-y-2">
                                    {Array.isArray(msg.key_points) && msg.key_points.length > 0 ? (
                                      msg.key_points.map((point, idx) => (
                                        <li key={idx} className="flex items-start gap-2 text-sm text-gray-700">
                                          <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0 mt-0.5" />
                                          {point}
                                        </li>
                                      ))
                                    ) : (msg.key_points ? (
                                      <li className="text-sm text-gray-500 italic">No key points extracted.</li>
                                    ) : (
                                      <li className="text-sm text-gray-500 italic">Extracting key points...</li>
                                    ))}
                                 </ul>

                                 <h4 className="flex items-center gap-2 text-sm font-semibold text-gray-900 mt-6 mb-3">
                                   <FileText className="w-4 h-4 text-gray-500" /> Related Links
                                 </h4>
                                 <ul className="space-y-2 pl-6 list-decimal text-sm">
                                   {msg.sources.map((src, i) => (
                                     <li key={i} className="text-gray-600">
                                       {src.url ? (
                                         <a href={src.url} target="_blank" rel="noopener noreferrer" className="text-indigo-600 hover:underline underline-offset-2">
                                           {src.title}
                                         </a>
                                       ) : (
                                         <span className="text-gray-800">{src.title}</span>
                                       )}
                                     </li>
                                   ))}
                                 </ul>
                               </div>
                             )}

                              {msg.action === 'escalated' && (
                                <div className="mt-4 p-4 bg-indigo-50 border border-indigo-100 rounded-xl flex flex-col gap-3 shadow-sm animate-in fade-in slide-in-from-bottom-2">
                                  <div className="flex items-center gap-2 text-indigo-900 font-semibold text-sm">
                                    <AlertCircle className="w-4 h-4 text-indigo-600" />
                                    Support Escalation Available
                                  </div>
                                  <p className="text-xs text-indigo-700 leading-relaxed">
                                    We couldn't find a definitive answer in the knowledge base. Would you like to raise a Jira ticket for our support team to investigate?
                                  </p>
                                  {msg.ticket ? (
                                    <div className="flex items-center gap-2 px-3 py-2 bg-green-600 text-white rounded-lg text-xs font-bold self-start shadow-sm">
                                      <CheckCircle2 className="w-3.5 h-3.5" /> Ticket #{msg.ticket.key || msg.ticket.jira_issue_key || 'TKT-PENDING'} Created
                                    </div>
                                  ) : (
                                    <button 
                                      onClick={() => sessionId && createTicket(sessionId, msg.id)}
                                      className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg text-xs font-bold hover:bg-indigo-700 transition-all self-start shadow-md shadow-indigo-100"
                                    >
                                      <Plus className="w-3.5 h-3.5" /> Create Jira Ticket
                                    </button>
                                  )}
                                </div>
                              )}

                              {/* Bottom Actions */}
                              <div className="flex items-center justify-between mt-6 pt-2">
                                <div className="flex items-center gap-1">
                                  <button className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-50 rounded-lg transition-colors"><ThumbsUp className="w-4 h-4" /></button>
                                  <button className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-50 rounded-lg transition-colors"><ThumbsDown className="w-4 h-4" /></button>
                                  <button className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-50 rounded-lg transition-colors ml-1"><Copy className="w-4 h-4" /></button>
                                  <button className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-50 rounded-lg transition-colors"><RefreshCcw className="w-4 h-4" /></button>
                                </div>
                                <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 text-sm font-medium text-indigo-600 hover:bg-indigo-50 transition-colors">
                                  <Sparkles className="w-3.5 h-3.5" /> Ask follow up <ChevronDown className="w-3.5 h-3.5 ml-1" />
                                </button>
                              </div>
                            </div>

                           {/* Suggested Follow-ups rendered as pills below the bubble */}
                           {isLast && msg.suggestions && msg.suggestions.length > 0 && (
                             <motion.div 
                               initial={{ opacity: 0, y: 5 }}
                               animate={{ opacity: 1, y: 0 }}
                               className="flex flex-wrap items-center gap-2 mt-4"
                             >
                               {msg.suggestions.map((s, i) => (
                                 <button
                                   key={i}
                                   onClick={() => sendMessage(s)}
                                   className="px-4 py-2 rounded-full bg-indigo-50 text-indigo-700 text-xs font-medium hover:bg-indigo-100 hover:shadow-sm transition-all border border-indigo-100"
                                 >
                                   {s}
                                 </button>
                               ))}
                               <button className="p-2 rounded-full bg-gray-50 text-gray-500 hover:bg-gray-100 hover:text-gray-700 transition-all border border-gray-200">
                                 <RefreshCcw className="w-3.5 h-3.5" />
                               </button>
                             </motion.div>
                           )}
                         </div>
                      </div>
                    )}
                  </motion.div>
                )
              })
            )}
            
            {isStreaming && messages[messages.length - 1]?.role !== 'assistant' && (
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex items-center gap-4 text-gray-500"
              >
                <div className="w-8 h-8 rounded-full bg-indigo-600 flex items-center justify-center shrink-0 mt-1 shadow-md">
                   <BrainCircuit className="text-white w-4 h-4" />
                </div>
                <div className="bg-white border border-gray-100 shadow-sm rounded-2xl px-5 py-4">
                  <div className="flex items-center gap-1">
                    <div className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                    <div className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                    <div className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Input Area */}
      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-white via-white to-transparent pt-10 pb-6 px-6 z-10">
        <div className="max-w-3xl mx-auto flex flex-col items-center">
          <form 
            onSubmit={handleSubmit}
            className="w-full bg-white border border-gray-200 rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] focus-within:ring-2 focus-within:ring-indigo-500/20 focus-within:border-indigo-400 transition-all flex items-end p-2 relative"
          >
            <button 
              type="button" 
              className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-xl transition-colors mb-1 ml-1"
            >
              <Plus className="w-5 h-5" />
            </button>
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask a follow-up question..."
              className="flex-1 max-h-32 min-h-[44px] py-3 px-3 bg-transparent border-none focus:ring-0 resize-none text-[15px] placeholder-gray-400 text-gray-900"
              rows={1}
            />
            <button 
              type="button" 
              className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-xl transition-colors mb-1 mr-1"
            >
              <Mic className="w-5 h-5" />
            </button>
            <button 
              type="submit"
              disabled={!input.trim() || isStreaming}
              className={`p-2.5 rounded-xl flex items-center justify-center transition-all mb-1 ${
                input.trim() && !isStreaming 
                  ? 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-sm' 
                  : 'bg-gray-100 text-gray-400'
              }`}
            >
              <Send className="w-4 h-4" />
            </button>
          </form>
          
          <div className="mt-3 text-center">
            <p className="text-[11px] text-gray-400 font-medium">
              Answers are generated using AI and based on content from the website.
            </p>
            <p className="text-[11px] text-gray-400 font-medium mt-0.5">
              Please verify critical information from the official sources.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
