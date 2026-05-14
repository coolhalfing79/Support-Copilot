import { useEffect, useRef, useCallback } from 'react'
import { useUserStore } from '../store/userStore'
import { WS_BASE_URL } from '../config/api'

// Singleton state to survive React re-renders and StrictMode
let globalSocket: WebSocket | null = null
let globalSessionId: string | null = null
let reconnectAttempts = 0
const MAX_RECONNECT_ATTEMPTS = 5

export const useWebSocket = (sessionId: string | null) => {
  const { addMessage, updateLastMessage, setStreaming, setConnected } = useUserStore()
  const reconnectTimeoutRef = useRef<number | null>(null)
  const isMounted = useRef(true)
  const lastSentQueryRef = useRef<string | null>(null)
  
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
    
    // Add auth token placeholder for future security implementation
    const token = 'demo-token-placeholder'
    const url = `${WS_BASE_URL}/${sessionId}?token=${token}`
    
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
        const data = JSON.parse(event.data)
        console.log('📥 [WebSocket] Message:', data.type, data.action ? `Action: ${data.action}` : '')
        
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
            storeRef.current.updateLastMessage(data.content)
            break
          
          case 'final':
            storeRef.current.setStreaming(false)
            if (data.action || data.suggestions || data.sources || data.graph || data.key_points) {
               useUserStore.setState((state) => {
                 const newMessages = [...state.messages]
                 if (newMessages.length > 0) {
                   const lastIdx = newMessages.length - 1
                   newMessages[lastIdx] = {
                     ...newMessages[lastIdx],
                     action: data.action,
                     suggestions: data.suggestions,
                     sources: data.sources,
                     graph: data.graph,
                     key_points: data.key_points || []
                   }
                 }
                 if (data.graph) {
                   return { 
                     messages: newMessages, 
                     currentGraph: data.graph,
                     currentGraphQuery: lastSentQueryRef.current 
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
        if (isMounted.current && reconnectAttempts < MAX_RECONNECT_ATTEMPTS && !event.wasClean) {
          const timeout = Math.min(1000 * Math.pow(2, reconnectAttempts), 10000)
          console.log(`🔄 [WebSocket] Reconnecting in ${timeout}ms...`)
          reconnectTimeoutRef.current = window.setTimeout(() => {
            reconnectAttempts++
            connect()
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

    if (globalSocket?.readyState === WebSocket.OPEN) {
      console.log('📤 [WebSocket] Sending:', msg)
      lastSentQueryRef.current = msg
      const userMessage = {
        id: Date.now().toString(),
        role: 'user',
        content: msg,
        timestamp: new Date().toISOString(),
      }
      storeRef.current.addMessage(userMessage as any)
      
      const { selectedSources } = useUserStore.getState()
      
      globalSocket.send(JSON.stringify({ 
        type: 'message',
        content: msg,
        knowledge_sources: selectedSources.length > 0 ? selectedSources : undefined
      }))
    } else {
      console.error('🚫 [WebSocket] Cannot send. State:', globalSocket?.readyState ?? 'NULL')
    }
  }

  return { sendMessage }
}
