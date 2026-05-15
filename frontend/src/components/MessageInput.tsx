import { useState, useRef, useEffect } from 'react'
import { Square, Send, Sparkles } from 'lucide-react'
import { cn } from '@/lib/utils'

interface MessageInputProps {
  onSendMessage: (content: string) => void
  onStop?: () => void
  disabled?: boolean
  isStreaming?: boolean
}

export const MessageInput = ({ onSendMessage, onStop, disabled, isStreaming }: MessageInputProps) => {
  const [content, setContent] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const handleSend = () => {
    if (content.trim() && !disabled && !isStreaming) {
      onSendMessage(content.trim())
      setContent('')
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'inherit'
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`
    }
  }, [content])

  return (
    <div className="relative group">
      <div className="relative bg-[#ffffff] border border-[#e0e0e0] shadow-sm rounded-[20px] p-2 flex items-end gap-2 pr-4 focus-within:border-[#0f62fe] transition-all">
        <div className="flex-1 relative">
          <textarea
            ref={textareaRef}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type your support request..."
            disabled={disabled}
            className="w-full bg-transparent border-none focus:ring-0 text-[#161616] placeholder:text-[#a8a8a8] text-sm py-3 px-4 resize-none outline-none overflow-y-auto max-h-[200px]"
            rows={1}
          />
        </div>
        
        <button
          onClick={isStreaming ? onStop : handleSend}
          disabled={(isStreaming ? false : !content.trim()) || disabled}
          className={cn(
            "w-10 h-10 rounded-xl flex items-center justify-center transition-all",
            (isStreaming || (content.trim() && !disabled))
              ? "bg-[#0f62fe] text-white shadow-md shadow-[#0f62fe]/20 scale-100"
              : "bg-[#e0e0e0] text-[#a8a8a8] scale-95 cursor-not-allowed"
          )}
        >
          {isStreaming ? (
            <Square className="w-4 h-4 fill-current" />
          ) : disabled ? (
            <Sparkles className="w-5 h-5 animate-spin" />
          ) : (
            <Send className="w-5 h-5" />
          )}
        </button>
      </div>
    </div>
  )
}
