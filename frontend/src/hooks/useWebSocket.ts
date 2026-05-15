import { useEffect, useRef, useCallback } from 'react'
import { useUserStore, type Message, type SourceInfo } from '../store/userStore'
import { useAuthStore } from '../store/authStore'
import { WS_BASE_URL } from '../config/api'

// Singleton state to survive React re-renders and StrictMode
let globalSocket: WebSocket | null = null
let globalSessionId: string | null = null
let reconnectAttempts = 0
const MAX_RECONNECT_ATTEMPTS = 5

interface WSMessage {
  type: 'start' | 'chunk' | 'final' | 'error'
  content?: string
  message?: string
  action?: 'resolve' | 'clarification' | 'escalated'
  suggestions?: string[]
  sources?: SourceInfo[]
}

export const useWebSocket = (sessionId: string | null) => {
  const { addMessage, updateLastMessage, setStreaming, setConnected } = useUserStore()
  const reconnectTimeoutRef = useRef<number | null>(null)
  const isMounted = useRef(true)
  const connectRef = useRef<() => void>(() => {})
  
  // Use a ref to keep track of the current store functions (avoids stale closures)
  const storeRef = useRef({ addMessage, updateLastMessage, setStreaming, setConnected })
  useEffect(() => {
    storeRef.current = { addMessage, updateLastMessage, setStreaming, setConnected }
    isMounted.current = true
    return () => {
      isMounted.current = false
      if (reconnectTimeoutRef.current) {
        window.clearTimeout(reconnectTimeoutRef.current)
      }
    }
  }, [addMessage, updateLastMessage, setStreaming, setConnected])

  const connect = useCallback(() => {
    if (!sessionId || !isMounted.current) return
    
    // If we already have a socket for THIS session and it's alive, don't do anything
    if (globalSocket && globalSessionId === sessionId) {
      if (globalSocket.readyState <= WebSocket.OPEN) return
    }

    // Clean up any old mismatched socket
    if (globalSocket) {
      globalSocket.onclose = null // Remove handler to prevent loops
      globalSocket.close()
      globalSocket = null
    }

    console.log('🌐 [WebSocket] Connecting to:', `${WS_BASE_URL}/${sessionId}`)
    globalSessionId = sessionId
    
    // Attach the real JWT token so the backend can validate the user
    const token = useAuthStore.getState().token || ''
    const url = token
      ? `${WS_BASE_URL}/${sessionId}?token=${token}`
      : `${WS_BASE_URL}/${sessionId}`
    
    try {
      const ws = new WebSocket(url)
      globalSocket = ws

      ws.onopen = () => {
        console.log('✅ [WebSocket] Connected')
        reconnectAttempts = 0
        if (isMounted.current) {
          storeRef.current.setConnected(true)
        }
      }

      ws.onmessage = (event) => {
        if (!isMounted.current) return
        const data = JSON.parse(event.data) as WSMessage
        console.log('📥 [WebSocket] Message:', data.type)
        
        switch (data.type) {
          case 'start':
            storeRef.current.setStreaming(true)
            storeRef.current.addMessage({
              id: Date.now().toString(),
              role: 'assistant',
              content: '',
              timestamp: new Date().toISOString(),
            })
            break
          
          case 'chunk':
            if (data.content) {
              storeRef.current.updateLastMessage(data.content)
            }
            break
          
          case 'final':
            storeRef.current.setStreaming(false)
            if (data.action || data.suggestions || data.sources) {
               useUserStore.setState((state) => {
                 const newMessages = [...state.messages]
                 if (newMessages.length > 0) {
                   const lastIdx = newMessages.length - 1
                   newMessages[lastIdx] = {
                     ...newMessages[lastIdx],
                     action: data.action,
                     suggestions: data.suggestions,
                     sources: data.sources
                   }
                 }
                 return { messages: newMessages }
               })
            }
            break
          
          case 'error':
            storeRef.current.setStreaming(false)
            console.error('❌ [WebSocket] Error:', data.message)
            break
        }
      }

      ws.onclose = (event) => {
        console.log('🔌 [WebSocket] Disconnected', event.reason)
        if (isMounted.current) {
          storeRef.current.setStreaming(false)
          storeRef.current.setConnected(false)
        }
        globalSocket = null

        // Auto-reconnect logic with exponential backoff
        if (isMounted.current && reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
          const timeout = Math.min(1000 * Math.pow(2, reconnectAttempts), 10000)
          console.log(`🔄 [WebSocket] Reconnecting in ${timeout}ms...`)
          reconnectTimeoutRef.current = window.setTimeout(() => {
            reconnectAttempts++
            connectRef.current()
          }, timeout)
        }
      }

      ws.onerror = (error) => {
        console.error('⚠️ [WebSocket] Socket Error:', error)
        if (isMounted.current) {
          storeRef.current.setStreaming(false)
          storeRef.current.setConnected(false)
        }
      }
    } catch (err) {
      console.error('🚀 [WebSocket] Connection attempt failed:', err)
    }
  }, [sessionId])

  useEffect(() => {
    connectRef.current = connect
  }, [connect])

  useEffect(() => {
    // Small delay to let StrictMode settle or previous cleanup finish
    const timer = window.setTimeout(() => {
      connect()
    }, 200)

    return () => {
      window.clearTimeout(timer)
    }
  }, [connect])

  const sendMessage = (content: string) => {
    const msg = content.trim()
    if (!msg) return

    // If socket is dead, try to connect first
    if (!globalSocket || globalSocket.readyState > WebSocket.OPEN) {
      console.warn('🔄 [WebSocket] Socket closed or closing. Attempting to reconnect...')
      connect()
    }

    // Always add the user message to UI immediately for responsiveness
    const userMessage: Message = {
      id: `local-${Date.now()}`,
      role: 'user',
      content: msg,
      timestamp: new Date().toISOString(),
    }
    console.log('📝 [WebSocket] Adding user message to UI:', msg)
    storeRef.current.addMessage(userMessage)

    // If still connecting, wait a moment then try to send
    if (globalSocket?.readyState === WebSocket.CONNECTING) {
      console.warn('⏳ [WebSocket] Socket is CONNECTING. Message buffered...')
      setTimeout(() => {
        if (globalSocket?.readyState === WebSocket.OPEN) {
          console.log('📤 [WebSocket] Sending buffered message:', msg)
          globalSocket.send(JSON.stringify({ 
            type: 'message',
            content: msg,
            knowledge_sources: useUserStore.getState().selectedSources
          }))
        }
      }, 1000)
      return
    }

    if (globalSocket?.readyState === WebSocket.OPEN) {
      const { selectedSources } = useUserStore.getState()
      console.log('📤 [WebSocket] Sending:', msg)
      globalSocket.send(JSON.stringify({ 
        type: 'message',
        content: msg,
        knowledge_sources: selectedSources.length > 0 ? selectedSources : undefined
      }))
    } else {
      console.error('🚫 [WebSocket] Cannot send. State:', globalSocket?.readyState ?? 'NULL')
    }
  }

  const stopQuery = () => {
    if (globalSocket) {
      console.log('🛑 [WebSocket] Stopping query...')
      globalSocket.close(1000, "User stopped query")
      globalSocket = null
      storeRef.current.setStreaming(false)
    }
  }

  return { sendMessage, stopQuery }
}
