# Person 5 — Frontend: User View (Chat Interface)

## Role: Frontend Engineer (User Experience)

---

## Task Overview

Build the user-facing chat interface — a clean, minimal chat UI where end users can ask questions and receive AI-powered responses in real-time. This includes WebSocket integration for streaming responses, conversation history, and ticket notifications.

**Priority:** HIGH — Core user-facing feature
**Start Time:** Hour 2 (can start with mock API)
**Primary Completion Target:** Hours 8-12

---

## Tech Stack

| Component | Technology | Version |
|-----------|-----------|---------|
| Framework | React 18 + TypeScript | 18.x |
| Build Tool | Vite | 5.x |
| UI Components | shadcn/ui | Latest |
| Styling | Tailwind CSS | 3.x |
| State Management | Zustand | 4.x |
| Routing | React Router v6 | 6.x |
| HTTP Client | Axios | 1.x |
| WebSocket | native WebSocket API | — |
| Icons | Lucide React | 0.x |

---

## Detailed Task Breakdown

### 5.1 Project Setup

Run these commands to initialize the project:

```bash
# Create Vite project with React + TypeScript template
npm create vite@latest frontend -- --template react-ts
cd frontend

# Install dependencies
npm install axios zustand react-router-dom lucide-react class-variance-authority clsx tailwind-merge

# Install shadcn/ui
npx shadcn-ui@latest init

# Add shadcn components
npx shadcn-ui@latest add button input textarea card scroll-area badge avatar dialog
```

**File:** `frontend/package.json` (key dependencies):

```json
{
  "name": "copilot-frontend",
  "private": true,
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "react": "^18.2.0",
    "react-dom": "^18.2.0",
    "axios": "^1.6.5",
    "zustand": "^4.4.7",
    "react-router-dom": "^6.21.1",
    "lucide-react": "^0.303.0",
    "class-variance-authority": "^0.7.0",
    "clsx": "^2.1.0",
    "tailwind-merge": "^2.2.0",
    "@radix-ui/react-scroll-area": "^1.0.5",
    "@radix-ui/react-dialog": "^1.0.5",
    "@radix-ui/react-badge": "^1.0.4"
  },
  "devDependencies": {
    "@types/react": "^18.2.43",
    "@types/react-dom": "^18.2.17",
    "@vitejs/plugin-react": "^4.2.1",
    "typescript": "^5.3.3",
    "vite": "^5.0.8",
    "tailwindcss": "^3.4.1",
    "postcss": "^8.4.32",
    "autoprefixer": "^10.4.16"
  }
}
```

### 5.2 Project Structure

```
frontend/
├── src/
│   ├── main.tsx                   # Entry point
│   ├── App.tsx                    # Root component + routing
│   ├── index.css                  # Global styles
│   ├── config/
│   │   └── api.ts                 # API configuration
│   ├── views/
│   │   └── user/
│   │       ├── UserLayout.tsx     # Minimal layout wrapper
│   │       └── ChatPage.tsx       # Main chat page
│   │           ├── ChatWindow.tsx # Message display
│   │           ├── MessageInput.tsx # Input field
│   │           ├── MessageBubble.tsx # Message component
│   │           └── TicketNotification.tsx # Ticket alert
│   ├── components/
│   │   └── common/
│   │       ├── Header.tsx
│   │       ├── LoadingSpinner.tsx
│   │       └── ErrorBoundary.tsx
│   ├── stores/
│   │   └── userStore.ts           # User view state
│   ├── hooks/
│   │   └── useWebSocket.ts        # WebSocket hook
│   └── types/
│       └── index.ts               # TypeScript types
├── public/
├── vite.config.ts
├── tailwind.config.ts
└── tsconfig.json
```

### 5.3 TypeScript Types

**File:** `frontend/src/types/index.ts`

```typescript
export type MessageRole = 'user' | 'assistant' | 'system';

export type Action = 'resolve' | 'clarification' | 'escalated' | 'searching';

export interface SourceInfo {
  source_id: string;
  title: string;
  url?: string;
  chunk_excerpt?: string;
}

export interface TicketInfo {
  id: string;
  jira_issue_key?: string;
  summary: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  status: 'open' | 'in_progress' | 'resolved' | 'closed';
}

export interface Message {
  id: string;
  session_id: string;
  role: MessageRole;
  content: string;
  confidence_score?: number;
  sources?: SourceInfo[];
  created_at: string;
}

export interface ChatResponse {
  session_id: string;
  message_id: string;
  response: string;
  sources: SourceInfo[];
  action: Action;
  follow_up_questions?: string[];
  ticket?: TicketInfo;
}

export interface Session {
  id: string;
  title?: string;
  status: 'active' | 'resolved' | 'escalated';
  created_at: string;
  updated_at: string;
  messages?: Message[];
}

export interface ChatSession {
  currentSession: Session | null;
  messages: Message[];
  isLoading: boolean;
  error: string | null;
}
```

### 5.4 API Configuration

**File:** `frontend/src/config/api.ts`

```typescript
import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api/v1';

export const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// WebSocket URL
export const WS_BASE_URL = import.meta.env.VITE_WS_URL || 'ws://localhost:8000/api/v1/chat';
```

### 5.5 Zustand Store

**File:** `frontend/src/stores/userStore.ts`

```typescript
import { create } from 'zustand';
import { api } from '../config/api';
import type { Session, Message, ChatResponse } from '../types';

interface UserState {
  // State
  sessions: Session[];
  currentSession: Session | null;
  messages: Message[];
  isLoading: boolean;
  error: string | null;
  
  // Actions
  createSession: () => Promise<void>;
  loadSessions: () => Promise<void>;
  selectSession: (sessionId: string) => Promise<void>;
  sendMessage: (message: string, followUps?: string[]) => Promise<void>;
  clearError: () => void;
}

export const useUserStore = create<UserState>((set, get) => ({
  sessions: [],
  currentSession: null,
  messages: [],
  isLoading: false,
  error: null,
  
  createSession: async () => {
    set({ isLoading: true, error: null });
    try {
      const response = await api.post('/chat/sessions');
      const session: Session = {
        id: response.data.id,
        title: response.data.title || 'New Conversation',
        status: response.data.status,
        created_at: response.data.created_at,
        updated_at: response.data.updated_at,
      };
      set({ currentSession: session, sessions: [session, ...get().sessions], isLoading: false });
    } catch (err: any) {
      set({ error: err.response?.data?.error?.message || 'Failed to create session', isLoading: false });
    }
  },
  
  loadSessions: async () => {
    set({ isLoading: true, error: null });
    try {
      const response = await api.get('/chat/sessions');
      set({ sessions: response.data, isLoading: false });
    } catch (err: any) {
      set({ error: err.response?.data?.error?.message || 'Failed to load sessions', isLoading: false });
    }
  },
  
  selectSession: async (sessionId: string) => {
    set({ isLoading: true, error: null });
    try {
      const response = await api.get(`/chat/sessions/${sessionId}`);
      const session: Session = response.data;
      set({ currentSession: session, messages: session.messages || [], isLoading: false });
    } catch (err: any) {
      set({ error: err.response?.data?.error?.message || 'Failed to load session', isLoading: false });
    }
  },
  
  sendMessage: async (message: string, followUps?: string[]) => {
    set({ isLoading: true, error: null });
    try {
      const response = await api.post(`/chat/sessions/${get().currentSession?.id}/messages`, {
        message,
        follow_up_responses: followUps,
      });
      
      const chatResponse: ChatResponse = response.data;
      
      // Add assistant message
      const newMessage: Message = {
        id: chatResponse.message_id,
        session_id: chatResponse.session_id,
        role: 'assistant',
        content: chatResponse.response,
        sources: chatResponse.sources,
        created_at: new Date().toISOString(),
      };
      
      set((state) => ({
        messages: [...state.messages, newMessage],
        isLoading: false,
        ticket: chatResponse.ticket,
        followUpQuestions: chatResponse.follow_up_questions,
      }));
    } catch (err: any) {
      set({ error: err.response?.data?.error?.message || 'Failed to send message', isLoading: false });
    }
  },
  
  clearError: () => set({ error: null }),
}));
```

### 5.6 WebSocket Hook

**File:** `frontend/src/hooks/useWebSocket.ts`

```typescript
import { useEffect, useRef, useCallback } from 'react';
import type { ChatResponse } from '../types';

interface UseWebSocketProps {
  sessionId: string | null;
  onMessage: (response: ChatResponse) => void;
  onTyping: (isTyping: boolean) => void;
  onError: (error: string) => void;
}

export function useWebSocket({ sessionId, onMessage, onTyping, onError }: UseWebSocketProps) {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  const connect = useCallback(() => {
    if (!sessionId) return;
    
    const wsUrl = `ws://localhost:8000/api/v1/chat/ws/${sessionId}`;
    wsRef.current = new WebSocket(wsUrl);
    
    wsRef.current.onopen = () => {
      console.log('WebSocket connected');
    };
    
    wsRef.current.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        
        switch (data.type) {
          case 'start':
            onTyping(true);
            break;
          case 'chunk':
            // Handle streaming chunks
            console.log('Received chunk:', data.content);
            break;
          case 'final':
            onTyping(false);
            onMessage({
              session_id: sessionId,
              message_id: data.message_id,
              response: '', // Will be assembled from chunks
              action: data.action,
              sources: data.sources || [],
              ticket: data.ticket,
            });
            break;
          case 'error':
            onError(data.message);
            onTyping(false);
            break;
        }
      } catch (err) {
        onError('Failed to parse WebSocket message');
      }
    };
    
    wsRef.current.onerror = (error) => {
      console.error('WebSocket error:', error);
      onError('Connection error');
    };
    
    wsRef.current.onclose = () => {
      console.log('WebSocket disconnected');
      // Reconnect after 3 seconds
      reconnectTimeoutRef.current = setTimeout(connect, 3000);
    };
  }, [sessionId, onMessage, onTyping, onError]);
  
  const sendMessage = useCallback((message: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'message', content: message }));
    }
  }, []);
  
  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
    }
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
  }, []);
  
  useEffect(() => {
    connect();
    return disconnect;
  }, [connect, disconnect]);
  
  return { sendMessage };
}
```

### 5.7 Main Components

**File:** `frontend/src/App.tsx`

```typescript
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { UserLayout } from './views/user/UserLayout';
import { AdminLayout } from './views/admin/AdminLayout';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/user/*" element={<UserLayout />} />
        <Route path="/admin/*" element={<AdminLayout />} />
        <Route path="*" element={<Navigate to="/user" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
```

**File:** `frontend/src/views/user/UserLayout.tsx`

```typescript
import { Outlet } from 'react-router-dom';
import { Header } from '../../components/common/Header';

export function UserLayout() {
  return (
    <div className="min-h-screen bg-gray-50">
      <Header view="user" />
      <main className="container mx-auto max-w-4xl px-4 py-8">
        <Outlet />
      </main>
    </div>
  );
}
```

**File:** `frontend/src/views/user/ChatPage.tsx`

```typescript
import { useEffect, useState } from 'react';
import { useUserStore } from '../../stores/userStore';
import { ChatWindow } from './ChatWindow';
import { MessageInput } from './MessageInput';
import { TicketNotification } from './TicketNotification';
import { LoadingSpinner } from '../../components/common/LoadingSpinner';

export function ChatPage() {
  const { currentSession, messages, isLoading, error, createSession, sendMessage, clearError } = useUserStore();
  const [ticket, setTicket] = useState<any>(null);
  
  useEffect(() => {
    if (!currentSession) {
      createSession();
    }
  }, [currentSession, createSession]);
  
  const handleSend = async (message: string) => {
    if (currentSession) {
      await sendMessage(message);
    }
  };
  
  const handleTicketCreated = (ticketData: any) => {
    setTicket(ticketData);
  };
  
  if (isLoading && !currentSession) {
    return (
      <div className="flex items-center justify-center h-64">
        <LoadingSpinner />
      </div>
    );
  }
  
  if (error) {
    return (
      <div className="text-center py-8">
        <p className="text-red-600">{error}</p>
        <button onClick={clearError} className="mt-4 px-4 py-2 bg-blue-600 text-white rounded">
          Try Again
        </button>
      </div>
    );
  }
  
  return (
    <div className="flex flex-col h-[calc(100vh-100px)]">
      <TicketNotification ticket={ticket} onClose={() => setTicket(null)} />
      <ChatWindow messages={messages} />
      {currentSession && (
        <MessageInput onSend={handleSend} isLoading={isLoading} />
      )}
    </div>
  );
}
```

**File:** `frontend/src/views/user/ChatWindow.tsx`

```typescript
import { ScrollArea } from '@radix-ui/react-scroll-area';
import type { Message } from '../../types';
import { MessageBubble } from './MessageBubble';

interface ChatWindowProps {
  messages: Message[];
}

export function ChatWindow({ messages }: ChatWindowProps) {
  return (
    <ScrollArea className="flex-1 rounded-lg border bg-white p-4 mb-4">
      <div className="space-y-4">
        {messages.length === 0 ? (
          <div className="text-center text-gray-500 py-8">
            <p className="text-lg">Welcome to AI Support Copilot</p>
            <p className="text-sm mt-2">Ask me about any known issues and I will help you resolve them.</p>
          </div>
        ) : (
          messages.map((message) => (
            <MessageBubble key={message.id} message={message} />
          ))
        )}
      </div>
    </ScrollArea>
  );
}
```

**File:** `frontend/src/views/user/MessageBubble.tsx`

```typescript
import { cn } from '../../lib/utils';
import type { Message } from '../../types';
import { User, Bot } from 'lucide-react';

interface MessageBubbleProps {
  message: Message;
}

export function MessageBubble({ message }: MessageBubbleProps) {
  const isUser = message.role === 'user';
  
  return (
    <div className={cn('flex items-start gap-3', isUser ? 'justify-end' : 'justify-start')}>
      {!isUser && (
        <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center flex-shrink-0">
          <Bot className="w-5 h-5 text-white" />
        </div>
      )}
      
      <div
        className={cn(
          'max-w-[80%] rounded-lg p-4',
          isUser
            ? 'bg-blue-600 text-white'
            : 'bg-white border border-gray-200'
        )}
      >
        <p className="whitespace-pre-wrap">{message.content}</p>
        
        {message.sources && message.sources.length > 0 && (
          <div className="mt-3 pt-3 border-t border-gray-200">
            <p className="text-xs font-medium opacity-70">Sources:</p>
            {message.sources.map((source, idx) => (
              <a
                key={idx}
                href={source.url}
                target="_blank"
                rel="noopener noreferrer"
                className={cn(
                  'block text-xs mt-1 hover:underline',
                  isUser ? 'text-blue-100' : 'text-blue-600'
                )}
              >
                {source.title}
              </a>
            ))}
          </div>
        )}
      </div>
      
      {isUser && (
        <div className="w-8 h-8 rounded-full bg-gray-300 flex items-center justify-center flex-shrink-0">
          <User className="w-5 h-5 text-gray-600" />
        </div>
      )}
    </div>
  );
}
```

**File:** `frontend/src/views/user/MessageInput.tsx`

```typescript
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Send } from 'lucide-react';

interface MessageInputProps {
  onSend: (message: string) => void;
  isLoading: boolean;
}

export function MessageInput({ onSend, isLoading }: MessageInputProps) {
  const [message, setMessage] = useState('');
  
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (message.trim() && !isLoading) {
      onSend(message.trim());
      setMessage('');
    }
  };
  
  return (
    <form onSubmit={handleSubmit} className="flex gap-2 p-4 bg-white rounded-lg border">
      <Input
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        placeholder="Type your question..."
        disabled={isLoading}
        className="flex-1"
      />
      <Button type="submit" disabled={isLoading || !message.trim()}>
        <Send className="w-4 h-4" />
        <span className="sr-only">Send</span>
      </Button>
    </form>
  );
}
```

**File:** `frontend/src/views/user/TicketNotification.tsx`

```typescript
import { AlertTriangle, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

interface TicketNotificationProps {
  ticket: {
    jira_issue_key?: string;
    summary: string;
    severity: string;
  } | null;
  onClose: () => void;
}

export function TicketNotification({ ticket, onClose }: TicketNotificationProps) {
  if (!ticket) return null;
  
  return (
    <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-4">
      <div className="flex items-start gap-3">
        <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <p className="font-medium text-amber-900">Support Ticket Created</p>
            {ticket.jira_issue_key && (
              <Badge variant="secondary">{ticket.jira_issue_key}</Badge>
            )}
          </div>
          <p className="text-sm text-amber-700 mt-1">{ticket.summary}</p>
        </div>
        <Button variant="ghost" size="sm" onClick={onClose}>
          <X className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}
```

### 5.8 Configuration Files

**File:** `frontend/vite.config.ts`

```typescript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 3000,
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
    },
  },
});
```

**File:** `frontend/tailwind.config.ts`

```typescript
/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {},
  },
  plugins: [],
};
```

---

## Acceptance Criteria

- [ ] React app starts with `npm run dev` on port 3000
- [ ] Chat page loads with empty state message
- [ ] User can type and send messages
- [ ] Messages display correctly (user on right, assistant on left)
- [ ] Sources are displayed as clickable links when present
- [ ] Ticket notification appears when ticket is created
- [ ] Loading states show during API calls
- [ ] Error states show with retry option
- [ ] WebSocket connection works for streaming (if backend ready)
- [ ] Responsive design works on mobile

---

## Dependencies

| Dependency | Owner | Status |
|------------|-------|--------|
| API endpoints | Person 3 | Required for real data |
| WebSocket | Person 4 | Required for streaming |
| API schemas | Person 1 | Required for types |

## Deliverables To

| Recipient | What They Get |
|-----------|--------------|
| Person 7 | Testable frontend components |

---

## Tips for AI-Assisted Implementation

1. Start with the component structure — build static components first
2. Use shadcn/ui components for rapid development
3. Mock the API responses initially, then connect to real backend
4. Test the chat flow end-to-end with mock data
5. Focus on clean, minimal UI — this is the user's primary interaction
6. Use Tailwind for all styling — it's fast and consistent
7. The WebSocket integration can be added last if time is tight
