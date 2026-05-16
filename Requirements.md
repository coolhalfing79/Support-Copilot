# AI-Powered L2 Support Copilot - Requirements & Architecture Document

## 1. Project Overview
The **AI-Powered L2 Support Copilot** is an enterprise-ready system designed to handle customer support through RAG-based document understanding, confidence-based decision logic, and automated Jira ticket escalation. It features a dual-view architecture: a User View for interactive chat and an Admin View for oversight, analytics, and knowledge management.

## 2. Architecture & Technology Stack

### Backend Stack
*   **Framework**: FastAPI (Python 3.11/3.12)
*   **Database**: PostgreSQL 15+ with `pgvector` for vector storage (knowledge chunks & relational data)
*   **ORM**: SQLAlchemy 2.0 (Async) + Alembic for migrations
*   **Vector DB**: ChromaDB 1.5+ (for document retrieval)
*   **AI/LLM**: OpenAI Chat Completions (`gpt-4o-mini` via OpenAI Python client)
*   **Embeddings**: `fastembed` (BAAI/bge-small-en-v1.5, running locally/on-device)
*   **Scraping**: `httpx`, `BeautifulSoup4`, and Jina AI Reader API (`r.jina.ai`)
*   **WebSocket**: Native FastAPI WebSockets for streaming responses.

### Frontend Stack
*   **Framework**: React 18+ with TypeScript (Vite bundler)
*   **State Management**: Zustand
*   **Styling**: Tailwind CSS + Framer Motion (animations)
*   **Icons**: Lucide React
*   **Routing**: React Router DOM

### Infrastructure
*   Docker & Docker Compose (for PostgreSQL + pgvector container)
*   Python Virtual Environment (`.venv`)

---

## 3. Core Modules & Workflows

### 3.1. Chat & Orchestration (`chat_service.py`)
The central orchestrator for the User View.
*   **Message Processing Pipeline**:
    1. Receives user query via REST or WebSocket.
    2. Retrieves conversation history.
    3. Triggers RAG pipeline (`RAGEngine.generate_response`) to search ChromaDB and generate a response.
    4. Evaluates confidence using `ConfidenceService`.
    5. Based on confidence score:
        *   **High (≥ 0.75)**: Resolves the query.
        *   **Medium (0.40 - 0.74)**: Asks clarifying questions using `CLARIFICATION_PROMPT`.
        *   **Low (< 0.40) or "INSUFFICIENT_DOCUMENTATION"**: Escalates to a human agent by creating a ticket.
    6. Returns response (streaming via WebSocket or synchronous via REST).
*   **Anti-Pollution**: Fallback/hallucinated answers are explicitly prevented from being indexed into the vector database.

### 3.2. Knowledge Ingestion (`knowledge_service.py` & Utils)
Manages the RAG knowledge base.
*   **Pipeline**: URL → Fetch (Jina API) → Parse & Clean (`content_cleaner.py`) → Chunk (`text_splitter.py`) → Embed (`embedding_engine.py`) → Store (ChromaDB).
*   **Web Scraper**: Handles raw HTML and React SPAs using Jina Markdown. Implements Storybook iframe extraction heuristics.
*   **Content Cleaner**: Strips markdown links, images, Jina metadata, HTML tags, and navigation boilerplate (e.g., "Skip to content", "Sign in") to ensure high-quality prose.
*   **Text Splitter**: Splits content using `RecursiveCharacterTextSplitter` and filters out low-quality chunks (e.g., class listings, nav menus) using structural heuristics.
*   **Background Tasks**: Ingestion runs asynchronously via FastAPI BackgroundTasks to keep API responsive.

### 3.3. Ticket Escalation (`ticket_service.py` & `jira_client.py`)
Handles transition from AI to Human L2 support.
*   **LLM Extraction**: Uses `TICKET_CREATION_PROMPT` to extract structured fields (summary, severity, product module, environment, steps to reproduce) from the chat history.
*   **Jira Integration**: Syncs ticket creation to Jira Cloud via REST API v3.
*   **Mock Fallback**: If `JIRA_API_TOKEN` is missing, `JiraClient` falls back to generating mock issue keys (e.g., `SUP-A1B2C3`) to prevent demo/dev blockage.

### 3.4. Analytics & Dashboard (`analytics_service.py`)
Provides administrative oversight.
*   Aggregates metrics such as: Total Queries, Resolution Rate, Escalation Rate, Avg Confidence Score, Total Tickets, and Total Sessions.
*   Identifies common issues grouped by `product_module` and `severity`.
*   Generates trend data for charting.

### 3.5. Real-time Communication (WebSocket)
*   Endpoint: `/api/v1/ws/{session_id}`
*   Streams chunks to the frontend as the LLM generates them.
*   Handles automatic reconnection, error serialization, and strict resource management (opening DB sessions only during active message processing).

---

## 4. Database Schema

The system uses PostgreSQL for relational data.

1.  **Users (`users`)**:
    *   `id` (UUID), `username`, `email`, `password_hash`, `role` (agent/manager/admin).
2.  **Sessions (`sessions`)**:
    *   `id` (UUID), `user_id` (FK), `title`, `status` (active/resolved/escalated).
3.  **Messages (`messages`)**:
    *   `id` (UUID), `session_id` (FK), `role` (user/assistant/system), `content`, `confidence_score`, `sources` (JSONB).
4.  **Tickets (`tickets`)**:
    *   `id` (UUID), `jira_issue_key`, `session_id` (FK), `summary`, `description`, `severity`, `status`, `product_module`, `environment`, `error_messages`, `steps_to_reproduce`, `doc_references` (JSONB).
5.  **Knowledge Sources (`knowledge_sources`)**:
    *   `id` (UUID), `url`, `title`, `source_type` (web_page/pdf/docx/markdown), `status` (pending/processing/indexed/error), `chunk_count`.
6.  **Knowledge Chunks (`knowledge_chunks`)**:
    *   `id` (UUID), `source_id` (FK), `chunk_index`, `content`, `embedding_vector` (VECTOR 768), `chunk_metadata` (JSONB).
7.  **Metrics (`metrics`)**:
    *   `id` (UUID), `metric_type`, `date`, `value`, `metadata`.

---

## 5. API Endpoints

### User Chat API
*   `POST /api/v1/chat/sessions` - Create session
*   `GET /api/v1/chat/sessions` - List sessions
*   `GET /api/v1/chat/sessions/{id}` - Get session history
*   `POST /api/v1/chat/sessions/{id}/messages` - Send message (sync fallback)
*   `WS /api/v1/ws/{id}` - WebSocket for streaming chat

### Admin API
*   **Knowledge Base**:
    *   `POST /api/v1/knowledge/sources` - Add URL to ingest (Async)
    *   `GET /api/v1/knowledge/sources` - List sources
    *   `DELETE /api/v1/knowledge/sources/{id}` - Delete source & chunks
    *   `POST /api/v1/knowledge/sources/{id}/reindex` - Force re-ingestion
*   **Tickets**:
    *   `GET /api/v1/tickets` - List tickets (with filters)
    *   `POST /api/v1/tickets/escalate` - Manual escalation
    *   `PUT /api/v1/tickets/{id}` - Update ticket status
*   **Analytics**:
    *   `GET /api/v1/analytics/overview` - Dashboard metrics
    *   `GET /api/v1/analytics/trends` - Charting data
    *   `GET /api/v1/analytics/issues` - Common issue tracking
*   **Auth**:
    *   `POST /api/v1/auth/login` - JWT generation
    *   `POST /api/v1/auth/register` - User creation

---

## 6. Frontend Configuration

### Pages
*   **User View**: `ChatPage.tsx` (WebSocket-based chat), `TicketsLandingPage.tsx`
*   **Admin View**: `AdminPages.tsx` (Dashboard, Knowledge Management, Ticket Oversight)
*   **Auth**: `LoginPage.tsx`

### State Management (`useUserStore`, `useAdminStore`)
*   Manages WebSocket connection lifecycle, message history, streaming state, and admin dashboard data fetching via Axios.

---

## 7. Configuration & Environment Variables
Defined in `.env`:
*   `DATABASE_URL`: PostgreSQL connection string.
*   `OPENAI_API_KEY`: Required for LLM inference.
*   `JIRA_URL`, `JIRA_EMAIL`, `JIRA_API_TOKEN`, `JIRA_PROJECT_KEY`: Required for actual Jira syncing (mocks if empty).
*   `CHROMA_HOST`, `CHROMA_PORT`: Vector DB config.

## 8. Deployment / Local Execution
The repository includes a setup script `scripts/local_test_no_devops.sh` which:
1. Provisions a `pgvector/pgvector:pg15` Docker container.
2. Initializes the DB schema (`init_db.sql`).
3. Creates a Python virtual environment and installs `requirements.txt`.
4. Starts the FastAPI server (`uvicorn`).
