# AI-Powered L2 Support Copilot — Project Summary

> **Purpose**: This document provides complete context about the Support-Copilot project. Load this at the start of any new chat session to instantly understand the codebase, architecture, and what each section of code does.

---

## 1. Project Overview

**What it is**: An AI-powered Level 2 (L2) Support Copilot system that enables support teams to resolve customer issues faster through intelligent document understanding, contextual conversations, confidence-based decision-making, and automated ticket escalation to Jira.

**Architecture Pattern**: Dual-view system — separate interfaces for end users (chat) and administrators (knowledge/ticket management).

**Tech Stack**:
- **Backend**: Python 3.11+, FastAPI (async), SQLAlchemy ORM, Pydantic
- **Frontend**: React 18/19, TypeScript, Vite, Tailwind CSS, Zustand, React Router v6
- **AI/ML**: Google Gemini API (`gemini-2.0-flash`), LangChain, FastEmbed (local `BAAI/bge-small-en-v1.5`)
- **Databases**: PostgreSQL 15 (relational + pgvector), ChromaDB (vector search), Redis (caching)
- **Real-time**: WebSocket streaming for live AI responses
- **Authentication**: JWT-based secure authentication with registration and protected routes
- **External Integrations**: Jira Cloud API (with automatic mock fallback for demo reliability)

---

## 2. Directory Structure

```
Support-Copilot/
├── architecture.md              # Full system architecture document (950 lines)
├── summary.md                   # This file — project context summary
├── task-distribution-overview.md  # Team task breakdown
├── RUN_LOCAL_PERSON{1-2}.md     # Local setup guides
│
├── backend/                     # FastAPI Backend
│   ├── main.py                  # Application entry point — FastAPI app setup, CORS, routers, lifespan
│   ├── requirements.txt         # Python dependencies
│   ├── requirements-person1.txt # Person 1 specific dependencies
│   ├── migrate_db.py            # Database migration script
│   ├── pytest.ini               # Pytest configuration
│   │
│   ├── config/
│   │   ├── settings.py          # Pydantic Settings — all env vars (DB, Gemini, Jira, Chroma, CORS)
│   │   └── database.py          # Async PostgreSQL connection pool, session factory
│   │
│   ├── models/                  # SQLAlchemy ORM models (8 tables)
│   │   ├── base.py              # Base classes: Base, TimestampedModel, UUIDCreatedModel
│   │   ├── enums.py             # Enums: UserRole, SessionStatus, MessageRole, TicketSeverity, TicketStatus, KnowledgeSourceType, KnowledgeSourceStatus, MetricType
│   │   ├── user.py              # User model — username, email, password_hash, role
│   │   ├── session.py           # Session model — linked to User, has messages & tickets, status tracking
│   │   ├── message.py           # Message model — session, role (user/assistant/system), content, confidence_score, sources (JSONB)
│   │   ├── ticket.py            # Ticket model — Jira fields, severity, status, conversation_summary, doc_references (JSONB)
│   │   ├── knowledge_source.py  # KnowledgeSource model — URL, title, source_type, status, chunk_count, last_indexed_at
│   │   ├── knowledge_chunk.py   # KnowledgeChunk model — source_id, content, embedding_vector (Vector(768)), chunk_metadata (JSONB)
│   │   └── metric.py            # Metric model — metric_type, date, value, metadata (JSONB), recorded_at
│   │
│   ├── schemas/                 # Pydantic request/response schemas
│   │   ├── chat.py              # ChatRequest, ChatResponse, SessionResponse, MessageResponse, Action enum, SourceInfo, TicketInfo
│   │   ├── ticket.py            # TicketListResponse, TicketResponse, TicketDetailResponse, TicketEscalateRequest, TicketUpdate
│   │   ├── knowledge.py         # KnowledgeSourceCreate, KnowledgeSourceResponse, KnowledgeSourceListResponse
│   │   └── analytics.py         # AnalyticsOverviewResponse, AnalyticsTrendsResponse, AnalyticsIssuesResponse
│   │
│   ├── api/
│   │   ├── router.py            # Main API router — includes all v1 sub-routers under /api/v1
│   │   ├── dependencies.py      # FastAPI dependency injections (DbSession, etc.)
│   │   │
│   │   └── v1/
│   │       ├── chat.py          # Chat endpoints: POST /sessions, POST /sessions/{id}/messages, GET /sessions, GET /sessions/{id}
│   │       ├── tickets.py       # Ticket endpoints: GET /, GET /{id}, POST /escalate, PUT /{id}
│   │       ├── knowledge.py     # Knowledge endpoints: POST /sources, GET /sources, DELETE /sources/{id}, POST /sources/{id}/reindex
│   │       ├── analytics.py     # Analytics endpoints: GET /overview, GET /trends, GET /issues
│   │       ├── auth.py          # Auth endpoints: POST /register, POST /login
│   │       └── ws/
│   │           └── websocket.py # WebSocket endpoint: /ws/{session_id} — handles real-time streaming events (start, chunk, final, error)
│   │
│   ├── services/                # Business logic layer
│   │   ├── service_factory.py   # Factory functions with @lru_cache — wires dependencies between services
│   │   ├── chat_service.py      # Main orchestrator: session CRUD + full message pipeline (confidence → RAG → resolve/clarify/escalate)
│   │   ├── confidence_service.py # Two-phase confidence scoring: initial heuristic + post-retrieval weighted formula
│   │   ├── ticket_service.py    # Ticket creation from chat (LLM-extracted fields) + Jira sync + CRUD
│   │   ├── knowledge_service.py # Knowledge ingestion: add source → crawl → chunk → embed → ChromaDB store
│   │   ├── analytics_service.py # Metrics aggregation and trend analysis
│   │   ├── auth_service.py      # Auth logic: registration, password hashing (bcrypt), JWT generation
│   │   ├── jira_client.py       # Jira REST API wrapper with automatic mock fallback when credentials missing
│   │   └── service_factory.py   # @lru_cache factory: get_chat_service(), get_ticket_service(), get_knowledge_service(), etc.
│   │
│   ├── ai/                      # AI/ML engine layer
│   │   ├── __init__.py          # Exports: LLMEngine, EmbeddingEngine, RAGEngine, compute_completeness_score, truncate_excerpt
│   │   ├── llm_engine.py        # Gemini chat inference: generate_response(), generate_response_stream(), generate_structured_response(), evaluate_relevance() — with retry logic
│   │   ├── embedding_engine.py  # Local FastEmbed model (BAAI/bge-small-en-v1.5): embed_query(), embed_documents() — 384-dim, ONNX Runtime, no API keys
│   │   ├── rag_pipeline.py      # RAGEngine: add_documents() (embed + upsert to Chroma), search() (vector similarity), generate_response_stream(), process_query()
│   │   ├── chroma_utils.py      # ChromaDB client setup and collection access
│   │   ├── prompts.py           # System prompts: CHAT_SYSTEM_PROMPT, CONFIDENCE_EVALUATION_PROMPT, TICKET_CREATION_PROMPT, CLARIFICATION_PROMPT
│   │   └── utils.py             # compute_completeness_score(), truncate_excerpt()
│   │
│   ├── middleware/
│   │   ├── error_handler.py     # Global error handling middleware
│   │   └── rate_limiter.py      # Rate limiting middleware
│   │
│   ├── utils/
│   │   ├── text_splitter.py     # Text splitting for document chunking
│   │   ├── web_scraper.py       # Web scraping with BeautifulSoup — crawl_website(), fetch_content()
│   │   ├── validators.py        # Input validation utilities
│   │   └── formatters.py        # Response formatting utilities
│   │
│   └── tests/                   # Pytest test suite
│       ├── conftest.py          # Test fixtures
│       ├── test_chat.py         # Chat endpoint tests
│       ├── test_tickets.py      # Ticket endpoint tests
│       ├── test_websocket.py    # WebSocket tests
│       └── ...                  # Additional test files
│
├── frontend/                    # React 19 + TypeScript Frontend
│   ├── package.json             # Dependencies: react, zustand, tailwindcss, framer-motion, lucide-react, react-markdown, axios, react-router-dom
│   ├── vite.config.ts           # Vite config with @/ path alias to src/
│   ├── tailwind.config.ts       # Custom theme: "Deep Space" design with glassmorphism, custom colors (nebula-blue, etc.)
│   ├── index.css                # Global styles, CSS variables, Tailwind directives
│   │
│   ├── src/
│   │   ├── App.tsx              # Router: redirects / to /chat, defines User View routes (/chat, /chat/:sessionId) and Admin routes (/admin, /admin/knowledge, /admin/tickets)
│   │   ├── main.tsx             # React root render
│   │   ├── config/api.ts        # API base URLs: VITE_API_BASE_URL, VITE_WS_URL
│   │   │
│   │   ├── pages/
│   │   │   ├── LoginPage.tsx    # Secure login/registration page with success/error handling
│   │   │   ├── TicketsLandingPage.tsx # Root landing page showing ticket history and "New Ticket" entry
│   │   │   ├── ChatPage.tsx     # Main chat page: message display, streaming, knowledge source selector, ticket notification, connection status indicator
│   │   │   └── AdminPages.tsx   # Admin pages: AdminDashboard (metrics), KnowledgePage (source management), TicketsPage (ticket list with filters)
│   │   │
│   │   ├── layouts/
│   │   │   ├── UserLayout.tsx   # User view layout wrapper
│   │   │   └── AdminLayout.tsx  # Admin layout: header with nav (Dashboard, Knowledge Base, Tickets), initial data loading, knowledge polling
│   │   │
│   │   ├── components/
│   │   │   ├── MessageBubble.tsx    # Chat message display: user/assistant bubbles, markdown rendering, source citations, action indicators
│   │   │   ├── MessageInput.tsx     # User message input with send button
│   │   │   ├── KnowledgeSourceSelector.tsx  # Dropdown/multi-select for choosing which knowledge sources to use in a query
│   │   │   ├── TicketNotification.tsx # Visual notification when Jira ticket is auto-created
│   │   │   ├── StatusBadge.tsx      # Status indicator badges (pending, processing, indexed, error, open, resolved, etc.)
│   │   │   ├── StatCard.tsx         # Dashboard statistic cards
│   │   │   └── Header.tsx           # App header component
│   │   │
│   │   ├── store/
│   │   │   ├── userStore.ts     # Zustand store: sessionId, messages[], isStreaming, isConnected, availableSources
│   │   │   ├── authStore.ts     # Auth store: user info, token, isAuthenticated, login/logout/register actions
│   │   │   └── adminStore.ts    # Admin Zustand store: metrics, knowledgeSources[], tickets[] — actions: loadMetrics, loadKnowledgeSources, loadTickets
│   │   │
│   │   ├── hooks/
│   │   │   ├── useWebSocket.ts      # WebSocket hook: singleton pattern, reconnection logic (max 5 attempts), event handling (start→addMessage, chunk→updateLastMessage, final→setStreaming false, error)
│   │   │   └── useKnowledgePolling.ts  # Polls /knowledge/sources to update ingestion status
│   │   │
│   │   └── lib/
│   │       └── utils.ts         # Utility functions (cn() for Tailwind class merging)
│   │
│   └── public/
│       ├── favicon.svg
│       ├── icons.svg
│       └── hero.png
│
├── infra/scripts/
│   ├── init_db.sql              # PostgreSQL database initialization
│   └── seed_data.sql            # Seed data for demo
│
└── plans/                       # Development planning documents
    └── (person1-person8 planning docs)
```

---

## 3. Database Schema

### Tables (PostgreSQL + pgvector)

| Table | Key Columns | Relationships |
|-------|------------|---------------|
| `users` | id (UUID), username, email, password_hash, role (agent/manager/admin), created_at, updated_at | 1→N sessions |
| `sessions` | id (UUID), user_id (FK), title, status (active/resolved/escalated), created_at, updated_at | N→1 users, 1→N messages, 1→N tickets |
| `messages` | id (UUID), session_id (FK), role (user/assistant/system), content, confidence_score, sources (JSONB), created_at | N→1 sessions |
| `tickets` | id (UUID), jira_issue_key, jira_issue_id, session_id (FK), summary, description, severity, status, product_module, environment, error_messages, steps_to_reproduce, troubleshooting_attempted, conversation_summary, doc_references (JSONB), created_at, updated_at | N→1 sessions |
| `knowledge_sources` | id (UUID), url, title, source_type (web_page/pdf/docx/markdown), status (pending/processing/indexed/error), chunk_count, max_pages, last_indexed_at, created_at, updated_at | 1→N knowledge_chunks |
| `knowledge_chunks` | id (UUID), source_id (FK), chunk_index, content, embedding_vector (Vector(768)), chunk_metadata (JSONB), created_at | N→1 knowledge_sources |
| `metrics` | id (UUID), metric_type (query_count/resolution_count/escalation_count/avg_confidence/avg_response_time), date, value, metadata (JSONB), recorded_at | — |

---

## 4. API Endpoints Reference

### Chat API (`/api/v1/chat`)

| Method | Endpoint | Request Body | Response | Description |
|--------|----------|-------------|----------|-------------|
| POST | `/sessions` | `{}` (optional) | `SessionResponse` | Create new chat session |
| POST | `/sessions/{id}/messages` | `{ "message": str, "follow_up_responses": str[]? }` | `ChatResponse` | Send message, get AI response with action |
| GET | `/sessions` | — | `{ sessions: SessionResponse[] }` | List all sessions |
| GET | `/sessions/{id}` | — | `{ id, title, status, messages: MessageResponse[] }` | Get session with full message history |

### Auth API (`/api/v1/auth`)

| Method | Endpoint | Request Body | Response | Description |
|--------|----------|-------------|----------|-------------|
| POST | `/register` | `{ username, email, password }` | `UserResponse` | Create new user account |
| POST | `/login` | `{ email, password }` | `{ access_token, token_type }` | Authenticate and get JWT token |

**ChatResponse fields**: `session_id`, `message_id`, `response`, `sources: SourceInfo[]`, `action` (resolve/clarification/escalated/searching), `follow_up_questions`, `ticket: TicketInfo?`

### Tickets API (`/api/v1/tickets`)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/?status=&severity=` | List tickets with optional filters |
| GET | `/{id}` | Get single ticket details |
| POST | `/escalate` | Manually escalate a session to ticket |
| PUT | `/{id}` | Update ticket status/severity |

### Knowledge API (`/api/v1/knowledge`)

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/sources` | Add URL, returns 202, triggers background ingestion |
| GET | `/sources` | List all sources with status |
| DELETE | `/sources/{id}` | Delete source and its chunks |
| POST | `/sources/{id}/reindex` | Re-index an existing source |

### Analytics API (`/api/v1/analytics`)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/overview?date_range=` | Overview metrics + trends + common issues |
| GET | `/trends?date_range=&granularity=` | Trend data |
| GET | `/issues?limit=` | Common issues list |

### WebSocket (`/api/v1/chat/ws/{session_id}`)

**Client → Server**: `{ "type": "message", "content": "user message" }`

**Server → Client Events**:
- `start`: Begin processing — frontend adds empty assistant message
- `chunk`: Streaming text fragment — frontend appends to last message
- `final`: Processing complete — frontend sets streaming=false, adds action/suggestions
- `error`: Error occurred — frontend displays error message

---

## 5. Core Business Logic

### Message Processing Pipeline (`ChatService.process_message()`)

```
1. Load session + conversation history
2. Calculate initial confidence (heuristic based on follow_up_responses, history length)
3. If low confidence → generate clarifying questions → return to user
4. If medium/high → RAG search (embed query → ChromaDB similarity search)
5. Calculate post-retrieval confidence (weighted: retrieval 40% + relevance 35% + completeness 25%)
6. If confidence >= HIGH (0.60) → generate answer from retrieved docs → return with action=resolve
7. If confidence < HIGH but docs found → generate answer anyway → return with action=resolve
8. If no docs or confidence too low after RAG → create Jira ticket → return with action=escalated
```

### Confidence Scoring (`ConfidenceService`)

**Phase 1 — Initial (before RAG)**:
- Base score: 0.30
- Boost to 0.50 if user answered clarification questions
- Boost by 0.15 if conversation history > 2 messages
- Action: clarification if score < 0.20

**Phase 2 — Post-Retrieval**:
- `retrieval_score`: Average cosine similarity of retrieved chunks
- `relevance_score`: LLM evaluates context relevance to query (1-5 scale)
- `completeness_score`: Heuristic from `ai/utils.py`
- `confidence = 0.40 × retrieval + 0.35 × relevance + 0.25 × completeness`
- Action thresholds: < 0.20 = escalated, 0.20-0.60 = clarification, >= 0.60 = resolve

### Knowledge Ingestion Pipeline (`KnowledgeService.ingest_source()`)

Runs as FastAPI BackgroundTask (separate DB session):
1. Fetch content via WebScraper (BeautifulSoup crawling for web_page type)
2. Split text via TextSplitter (configurable chunk size/overlap)
3. Generate embeddings via EmbeddingEngine (local FastEmbed)
4. Upsert to ChromaDB with metadata (source_id, source_title, chunk_index)
5. Update KnowledgeSource status to "indexed" with chunk_count

### Ticket Creation (`TicketService.create_ticket_from_chat()`)

1. Take last 20 messages from conversation
2. Build prompt with conversation + TICKET_CREATION_PROMPT
3. Call LLM for structured JSON extraction (summary, severity, product_module, environment, error_messages, steps_to_reproduce, troubleshooting_attempted, conversation_summary)
4. Create Ticket ORM record
5. Best-effort sync to Jira via JiraClient (mock if no credentials)
6. Mark session status as "escalated"

---

## 6. AI/ML Components

### LLM Engine (`ai/llm_engine.py`)

- Uses `ChatGoogleGenerativeAI` from LangChain with `gemini-2.0-flash`
- Methods:
  - `generate_response()`: Single-shot generation with retry (3 attempts, exponential backoff)
  - `generate_response_stream()`: Streaming chunks via `astream()`
  - `generate_structured_response()`: Parses LLM output as JSON (strips markdown fences)
  - `evaluate_relevance()`: Returns 0.0-1.0 relevance score for query-context pair
- Temperature: 0.3, max_tokens: 1024

### Embedding Engine (`ai/embedding_engine.py`)

- Uses FastEmbed with `BAAI/bge-small-en-v1.5` model
- Runs entirely on-device via ONNX Runtime — no API keys, no rate limits
- Embedding dimension: 384 (FastEmbed BAAI/bge-small-en-v1.5)
- Methods: `embed_query(text)`, `embed_documents(documents[])`

### RAG Engine (`ai/rag_pipeline.py`)

- Manages ChromaDB collection (`knowledge_chunks` by default)
- Methods:
  - `add_documents(source_id, source_title, chunks[])`: Embeds and upserts to ChromaDB
  - `search(query, top_k=5, filters?)`: Vector similarity search returning docs with similarity scores
  - `generate_response_stream(query, context_docs[])`: Streams Gemini response using retrieved context
  - `process_query(query)`: Full pipeline — search → generate → return response with sources

### System Prompts (`ai/prompts.py`)

- `CHAT_SYSTEM_PROMPT`: Defines AI behavior — professional, helpful, cite sources, don't make things up, ask clarifying questions if vague
- `TICKET_CREATION_PROMPT`: Instructs LLM to extract 8 structured fields from conversation
- `CLARIFICATION_PROMPT`: Instructs LLM to ask 2-3 focused clarifying questions
- `CONFIDENCE_EVALUATION_PROMPT`: Instructs LLM to return 0-1 confidence score

---

## 7. Frontend Architecture

### State Management (Zustand)

**`userStore.ts`**:
- `sessionId`: Current session UUID
- `messages[]`: Array of {id, role, content, timestamp, action?, suggestions?}
- `isStreaming`: Whether AI is currently generating
- `isConnected`: WebSocket connection status
- `availableSources[]`: Knowledge sources fetched from API
- `selectedSources[]`: User-selected sources for current query
- Actions: `addMessage()`, `updateLastMessage()` (streaming append), `setStreaming()`, `fetchAvailableSources()`

**`adminStore.ts`**:
- `metrics`: Dashboard metrics object
- `knowledgeSources[]`: Sources with status for polling
- `tickets[]`: Filtered ticket list
- Actions: `loadMetrics()`, `loadKnowledgeSources()`, `loadTickets()`

### WebSocket Hook (`useWebSocket.ts`)

- Uses global singleton pattern to survive React re-renders/StrictMode
- Auto-reconnects up to 5 times with backoff
- Event mapping:
  - `start` → setStreaming(true) + add empty assistant message
  - `chunk` → append content to last message (streaming)
  - `final` → setStreaming(false) + add action/suggestions
  - `error` → display error

### Routing

```
/          → UserView (TicketsLandingPage) - Protected
/login     → LoginPage
/chat/:sessionId → UserView (ChatPage with session history) - Protected
/admin     → AdminView (AdminDashboard) - Protected
/admin/knowledge → AdminView (KnowledgePage) - Protected
/admin/tickets   → AdminView (TicketsPage) - Protected
```

---

## 8. Configuration

All settings in [`backend/config/settings.py`](backend/config/settings.py) via Pydantic Settings (reads from `.env`):

| Variable | Default | Description |
|----------|---------|-------------|
| `DATABASE_URL` | `postgresql+asyncpg://postgres:postgres@localhost:5432/copilot` | PostgreSQL connection |
| `GEMINI_API_KEY` | (empty) | Google Gemini API key |
| `GEMINI_MODEL` | `gemini-2.0-flash` | LLM model name |
| `JIRA_URL` | (empty) | Jira Cloud instance URL |
| `JIRA_EMAIL` | (empty) | Jira email |
| `JIRA_API_TOKEN` | (empty) | Jira API token |
| `JIRA_PROJECT_KEY` | `SUP` | Jira project key |
| `CHROMA_HOST` | `localhost` | ChromaDB host |
| `CHROMA_PORT` | `8001` | ChromaDB port |
| `CHROMA_COLLECTION` | `knowledge_chunks` | ChromaDB collection name |
| `CORS_ORIGINS` | `http://localhost:3000,http://localhost:8000,http://localhost:5173` | Allowed origins |

Frontend env vars (in `frontend/.env`):
| Variable | Description |
|----------|-------------|
| `VITE_API_BASE_URL` | REST API base (e.g., `http://localhost:8000/api/v1`) |
| `VITE_WS_URL` | WebSocket URL (e.g., `ws://localhost:8000/api/v1/chat/ws`) |

---

## 9. Key Design Patterns & Notes

- **Service Factory Pattern**: [`service_factory.py`](backend/services/service_factory.py) uses `@lru_cache` to wire services with lazy singleton instances — avoids module-level instantiation failures when external services aren't available
- **Mock Fallback**: `JiraClient` automatically uses mock mode when `JIRA_API_TOKEN` is empty — ensures demo reliability
- **Background Tasks**: Knowledge ingestion runs as FastAPI `BackgroundTasks` with its own DB session to avoid connection pool exhaustion
- **WebSocket Resource Management**: DB session opened only for duration of message processing, then closed
- **ChromaDB Upsert**: Uses upsert (not insert) for re-indexing — handles duplicate IDs gracefully
- **Retry Logic**: LLM calls wrapped with tenacity retry (3 attempts, exponential backoff 2-10s)
- **Secure Auth**: Full JWT implementation with `bcrypt` for password hashing
- **Protected Routes**: Frontend navigation guarded by `ProtectedRoute` HOC
- **Path Alias**: Frontend uses `@/` alias pointing to `src/` (configured in `vite.config.ts`)

---

## 10. Current Development Status

This is a hackathon-project in active development. The core pipeline (chat → confidence → RAG → response/escalation) is implemented. Key areas under development:
- WebSocket streaming for real-time responses
- Full JWT Authentication and User Registration system
- Tickets Landing Page and Session History management
- Knowledge ingestion background pipeline
- Admin dashboard with metrics and ticket management

---

*Document generated from codebase analysis. Last updated: 2026-05-12*
