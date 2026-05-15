# Person 1 — Database, Models & API Foundation

## Role: Backend Engineer (Infrastructure Lead)

---

## Task Overview

Build the foundational layer of the backend system including database schema, SQLAlchemy models, FastAPI application setup, API router structure, and Pydantic request/response schemas. This is the bedrock that all other team members depend on.

**Priority:** CRITICAL — All other backend and frontend work depends on this.
**Start Time:** Hour 0 (immediate)
**Primary Completion Target:** Hours 2-4

---

## Tech Stack

| Component | Technology | Version |
|-----------|-----------|---------|
| Database | PostgreSQL | 15.x |
| ORM | SQLAlchemy | 2.0+ (async) |
| Migration | Alembic | 1.13+ |
| API Framework | FastAPI | 0.109+ |
| Validation | Pydantic | 2.x |
| Database Driver | asyncpg | 0.29+ |
| Environment | python-dotenv | 1.0+ |

---

## Detailed Task Breakdown

### 1.1 Project Structure Setup

Create the following directory structure under `/backend`:

```
backend/
├── main.py                    # Application entry point
├── config/
│   ├── __init__.py
│   ├── settings.py            # Configuration management
│   └── database.py            # Database connection setup
├── api/
│   ├── __init__.py
│   ├── router.py              # Main API router
│   ├── dependencies.py        # Shared dependencies
│   └── v1/
│       ├── __init__.py
│       ├── chat.py            # Chat endpoints (stub)
│       ├── knowledge.py       # Knowledge endpoints (stub)
│       ├── tickets.py         # Ticket endpoints (stub)
│       └── analytics.py       # Analytics endpoints (stub)
├── models/
│   ├── __init__.py
│   ├── base.py                # Base model class
│   ├── user.py                # User model
│   ├── session.py             # Session model
│   ├── message.py             # Message model
│   ├── ticket.py              # Ticket model
│   ├── knowledge_source.py    # KnowledgeSource model
│   └── metric.py              # Metric model
├── schemas/
│   ├── __init__.py
│   ├── user.py                # User schemas
│   ├── session.py             # Session schemas
│   ├── message.py             # Message schemas
│   ├── ticket.py              # Ticket schemas
│   ├── knowledge.py           # Knowledge schemas
│   ├── analytics.py           # Analytics schemas
│   └── chat.py                # Chat request/response schemas
├── services/                  # Stubbed — Person 3 will implement
├── ai/                        # Stubbed — Person 2 will implement
├── utils/                     # Stubbed — Person 4 will implement
├── tests/                     # Person 7 will populate
├── requirements.txt           # Python dependencies
└── .env.example               # Environment template
```

### 1.2 Configuration Management

**File:** `backend/config/settings.py`

Create a settings module using pydantic-settings:

```python
# Expected structure
from pydantic_settings import BaseSettings
from functools import lru_cache

class Settings(BaseSettings):
    # Application
    APP_NAME: str = "AI L2 Support Copilot"
    APP_VERSION: str = "1.0.0"
    DEBUG: bool = False
    
    # Database
    DATABASE_URL: str = "postgresql+asyncpg://postgres:postgres@db:5432/copilot"
    DATABASE_POOL_SIZE: int = 10
    DATABASE_MAX_OVERFLOW: int = 20
    
    # Redis
    REDIS_URL: str = "redis://redis:6379/0"
    
    # Gemini API
    GEMINI_API_KEY: str = ""
    GEMINI_MODEL: str = "gemini-2.0-flash"
    GEMINI_EMBEDDING_MODEL: str = "text-embedding-004"
    
    # Jira
    JIRA_URL: str = ""
    JIRA_EMAIL: str = ""
    JIRA_API_TOKEN: str = ""
    JIRA_PROJECT_KEY: str = "SUP"
    
    # ChromaDB
    CHROMA_HOST: str = "chromadb"
    CHROMA_PORT: int = 8000
    CHROMA_COLLECTION: str = "knowledge_chunks"
    
    # CORS
    CORS_ORIGINS: list[str] = ["http://localhost:3000", "http://localhost:8000"]
    
    class Config:
        env_file = ".env"

@lru_cache()
def get_settings() -> Settings:
    return Settings()
```

**File:** `backend/config/database.py`

```python
# Expected structure
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase
from config.settings import get_settings

settings = get_settings()

engine = create_async_engine(
    settings.DATABASE_URL,
    pool_size=settings.DATABASE_POOL_SIZE,
    max_overflow=settings.DATABASE_MAX_OVERFLOW,
    echo=settings.DEBUG,
)

async_session_factory = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autocommit=False,
    autoflush=False,
)

class Base(DeclarativeBase):
    pass

async def get_db() -> AsyncSession:
    async with async_session_factory() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()
```

### 1.3 Database Schema (SQL)

**File:** `infra/scripts/init_db.sql`

Create the PostgreSQL initialization script:

```sql
-- Database initialization script for AI L2 Support Copilot

-- Create database (if not exists — run as superuser)
-- CREATE DATABASE copilot;

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "vector";  -- Required for pgvector (embedding_vector column)

-- Users table
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    username VARCHAR(100) UNIQUE NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(20) NOT NULL DEFAULT 'agent' CHECK (role IN ('agent', 'manager', 'admin')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Sessions table
CREATE TABLE IF NOT EXISTS sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title VARCHAR(255),
    status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'resolved', 'escalated')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Messages table
CREATE TABLE IF NOT EXISTS messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    role VARCHAR(20) NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
    content TEXT NOT NULL,
    confidence_score FLOAT,
    sources JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Tickets table
CREATE TABLE IF NOT EXISTS tickets (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    jira_issue_key VARCHAR(50),
    jira_issue_id VARCHAR(100),
    session_id UUID REFERENCES sessions(id) ON DELETE SET NULL,
    summary TEXT NOT NULL,
    description TEXT,
    severity VARCHAR(20) NOT NULL DEFAULT 'medium' CHECK (severity IN ('low', 'medium', 'high', 'critical')),
    status VARCHAR(20) NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'resolved', 'closed')),
    product_module VARCHAR(255),
    environment TEXT,
    error_messages TEXT,
    steps_to_reproduce TEXT,
    troubleshooting_attempted TEXT,
    conversation_summary TEXT,
    doc_references JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Knowledge Sources table
CREATE TABLE IF NOT EXISTS knowledge_sources (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    url VARCHAR(500) UNIQUE NOT NULL,
    title VARCHAR(500),
    source_type VARCHAR(20) NOT NULL DEFAULT 'web_page' CHECK (source_type IN ('web_page', 'pdf', 'docx', 'markdown')),
    status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'indexed', 'error')),
    chunk_count INTEGER DEFAULT 0,
    last_indexed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Knowledge Chunks table
CREATE TABLE IF NOT EXISTS knowledge_chunks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    source_id UUID NOT NULL REFERENCES knowledge_sources(id) ON DELETE CASCADE,
    chunk_index INTEGER NOT NULL,
    content TEXT NOT NULL,
    embedding_vector VECTOR(768),
    metadata JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Metrics table
CREATE TABLE IF NOT EXISTS metrics (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    metric_type VARCHAR(50) NOT NULL CHECK (metric_type IN ('query_count', 'resolution_count', 'escalation_count', 'avg_confidence', 'avg_response_time')),
    date DATE NOT NULL,
    value NUMERIC(10, 4) NOT NULL,  -- NUMERIC supports both integer counts AND float scores (avg_confidence)
    metadata JSONB,
    recorded_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for performance
CREATE INDEX idx_messages_session_id ON messages(session_id);
CREATE INDEX idx_messages_created_at ON messages(created_at);
CREATE INDEX idx_tickets_status ON tickets(status);
CREATE INDEX idx_tickets_severity ON tickets(severity);
CREATE INDEX idx_tickets_created_at ON tickets(created_at);
CREATE INDEX idx_knowledge_sources_status ON knowledge_sources(status);
CREATE INDEX idx_knowledge_chunks_source_id ON knowledge_chunks(source_id);
CREATE INDEX idx_metrics_date ON metrics(date);
CREATE INDEX idx_metrics_type ON metrics(metric_type);
CREATE INDEX idx_sessions_user_id ON sessions(user_id);
CREATE INDEX idx_sessions_status ON sessions(status);

-- Updated at trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply updated_at triggers
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_sessions_updated_at BEFORE UPDATE ON sessions FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_tickets_updated_at BEFORE UPDATE ON tickets FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_knowledge_sources_updated_at BEFORE UPDATE ON knowledge_sources FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
```

### 1.4 SQLAlchemy Models

Create all SQLAlchemy model classes. Here are the key models:

**File:** `backend/models/base.py`

```python
import uuid
from sqlalchemy import Column, DateTime, func
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import DeclarativeBase


class DeclarativeBase_(DeclarativeBase):
    pass


class BaseModel(DeclarativeBase_):
    __abstract__ = True

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


# Alias so all models can do `from models.base import Base` unchanged
Base = BaseModel
```

**File:** `backend/models/user.py`

```python
from sqlalchemy import Column, String, Enum
from sqlalchemy.orm import relationship
from models.base import Base  # Base is aliased to BaseModel — inherits id, created_at, updated_at

class User(Base):
    __tablename__ = "users"
    
    username = Column(String(100), unique=True, nullable=False)
    email = Column(String(255), unique=True, nullable=False)
    password_hash = Column(String(255), nullable=False)
    role = Column(Enum('agent', 'manager', 'admin'), default='agent')
    
    sessions = relationship("Session", back_populates="user")
```

**File:** `backend/models/session.py`

```python
from sqlalchemy import Column, String, ForeignKey
from sqlalchemy.orm import relationship
from models.base import Base

class Session(Base):
    __tablename__ = "sessions"
    
    user_id = Column(UUID, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    title = Column(String(255))
    status = Column(Enum('active', 'resolved', 'escalated'), default='active')
    
    user = relationship("User", back_populates="sessions")
    messages = relationship("Message", back_populates="session", order_by="Message.created_at")
    ticket = relationship("Ticket", back_populates="session", uselist=False)
```

**File:** `backend/models/message.py`

```python
from sqlalchemy import Column, String, Text, Float, ForeignKey
from sqlalchemy.orm import relationship
from models.base import Base

class Message(Base):
    __tablename__ = "messages"
    
    session_id = Column(UUID, ForeignKey("sessions.id", ondelete="CASCADE"), nullable=False)
    role = Column(Enum('user', 'assistant', 'system'), nullable=False)
    content = Column(Text, nullable=False)
    confidence_score = Column(Float, nullable=True)
    sources = Column(JSONB, nullable=True)
    
    session = relationship("Session", back_populates="messages")
```

**File:** `backend/models/ticket.py`

```python
from sqlalchemy import Column, String, Text, ForeignKey
from sqlalchemy.orm import relationship
from models.base import Base

class Ticket(Base):
    __tablename__ = "tickets"
    
    jira_issue_key = Column(String(50), nullable=True)
    jira_issue_id = Column(String(100), nullable=True)
    session_id = Column(UUID, ForeignKey("sessions.id", ondelete="SET NULL"), nullable=True)
    summary = Column(Text, nullable=False)
    description = Column(Text)
    severity = Column(Enum('low', 'medium', 'high', 'critical'), default='medium')
    status = Column(Enum('open', 'in_progress', 'resolved', 'closed'), default='open')
    product_module = Column(String(255))
    environment = Column(Text)
    error_messages = Column(Text)
    steps_to_reproduce = Column(Text)
    troubleshooting_attempted = Column(Text)
    conversation_summary = Column(Text)
    doc_references = Column(JSONB)
    
    session = relationship("Session", back_populates="ticket")
```

**File:** `backend/models/knowledge_source.py`

```python
from sqlalchemy import Column, String, Integer, ForeignKey
from sqlalchemy.orm import relationship
from models.base import Base

class KnowledgeSource(Base):
    __tablename__ = "knowledge_sources"
    
    url = Column(String(500), unique=True, nullable=False)
    title = Column(String(500))
    source_type = Column(Enum('web_page', 'pdf', 'docx', 'markdown'), default='web_page')
    status = Column(Enum('pending', 'processing', 'indexed', 'error'), default='pending')
    chunk_count = Column(Integer, default=0)
    last_indexed_at = Column(DateTime(timezone=True), nullable=True)
    
    chunks = relationship("KnowledgeChunk", back_populates="source")
```

**File:** `backend/models/metric.py`

```python
from sqlalchemy import Column, String, Integer, Date, ForeignKey
from sqlalchemy.orm import relationship
from models.base import Base

class Metric(Base):
    __tablename__ = "metrics"
    
    metric_type = Column(Enum('query_count', 'resolution_count', 'escalation_count', 'avg_confidence', 'avg_response_time'), nullable=False)
    date = Column(Date, nullable=False)
    value = Column(Integer, nullable=False)
    metadata = Column(JSONB, nullable=True)
```

**File:** `backend/models/knowledge_chunk.py`

> ⚠️ This model was MISSING from the original task — added to match the `knowledge_chunks` table in `init_db.sql`.

```python
import uuid
from sqlalchemy import Column, Integer, Text, ForeignKey
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import relationship
from pgvector.sqlalchemy import Vector
from models.base import Base


class KnowledgeChunk(Base):
    __tablename__ = "knowledge_chunks"

    source_id = Column(UUID(as_uuid=True), ForeignKey("knowledge_sources.id", ondelete="CASCADE"), nullable=False)
    chunk_index = Column(Integer, nullable=False)
    content = Column(Text, nullable=False)
    embedding_vector = Column(Vector(768), nullable=True)  # 768-dim from text-embedding-004
    chunk_metadata = Column(JSONB, nullable=True)          # named chunk_metadata to avoid SQLAlchemy reserved word conflict

    source = relationship("KnowledgeSource", back_populates="chunks")
```

---

### 1.5 Pydantic Schemas

Create request/response schemas for all endpoints.

**File:** `backend/schemas/chat.py`

```python
from pydantic import BaseModel, Field
from typing import Optional, List, Any
from datetime import datetime
from enum import Enum

class MessageRole(str, Enum):
    user = "user"
    assistant = "assistant"
    system = "system"

class Action(str, Enum):
    resolve = "resolve"
    clarification = "clarification"
    escalated = "escalated"
    searching = "searching"

class SourceInfo(BaseModel):
    source_id: str
    title: str
    url: Optional[str] = None
    chunk_excerpt: Optional[str] = None

class TicketInfo(BaseModel):
    id: str
    jira_issue_key: Optional[str] = None
    summary: str
    severity: str
    status: str

class ChatRequest(BaseModel):
    message: str
    follow_up_responses: Optional[List[str]] = None

class ChatResponse(BaseModel):
    session_id: str
    message_id: str
    response: str
    sources: List[SourceInfo] = []
    action: Action
    follow_up_questions: Optional[List[str]] = None
    ticket: Optional[TicketInfo] = None

class SessionCreate(BaseModel):
    pass  # Empty — uses default values

class SessionResponse(BaseModel):
    id: str
    title: Optional[str] = None
    status: str
    created_at: datetime
    updated_at: datetime

# MessageResponse must be defined BEFORE SessionDetailResponse (forward reference fix)
class MessageResponse(BaseModel):
    id: str
    session_id: str
    role: MessageRole
    content: str
    confidence_score: Optional[float] = None
    sources: Optional[List[SourceInfo]] = None
    created_at: datetime


class SessionDetailResponse(SessionResponse):
    messages: List[MessageResponse]
```

**File:** `backend/schemas/knowledge.py`

```python
from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime
from enum import Enum

class KnowledgeSourceType(str, Enum):
    web_page = "web_page"
    pdf = "pdf"
    docx = "docx"
    markdown = "markdown"

class KnowledgeSourceStatus(str, Enum):
    pending = "pending"
    processing = "processing"
    indexed = "indexed"
    error = "error"

class KnowledgeSourceCreate(BaseModel):
    url: str
    title: Optional[str] = None
    source_type: KnowledgeSourceType = KnowledgeSourceType.web_page

class KnowledgeSourceResponse(BaseModel):
    id: str
    url: str
    title: Optional[str] = None
    source_type: KnowledgeSourceType
    status: KnowledgeSourceStatus
    chunk_count: int
    last_indexed_at: Optional[datetime] = None
    created_at: datetime
```

**File:** `backend/schemas/ticket.py`

```python
from pydantic import BaseModel
from typing import Optional
from datetime import datetime
from enum import Enum

class TicketSeverity(str, Enum):
    low = "low"
    medium = "medium"
    high = "high"
    critical = "critical"

class TicketStatus(str, Enum):
    open = "open"
    in_progress = "in_progress"
    resolved = "resolved"
    closed = "closed"

class TicketCreate(BaseModel):
    session_id: Optional[str] = None
    summary: str
    description: Optional[str] = None
    severity: TicketSeverity = TicketSeverity.medium
    product_module: Optional[str] = None
    environment: Optional[str] = None
    error_messages: Optional[str] = None
    steps_to_reproduce: Optional[str] = None
    troubleshooting_attempted: Optional[str] = None
    conversation_summary: Optional[str] = None

class TicketResponse(BaseModel):
    id: str
    jira_issue_key: Optional[str] = None
    jira_issue_id: Optional[str] = None
    session_id: Optional[str] = None
    summary: str
    description: Optional[str] = None
    severity: TicketSeverity
    status: TicketStatus
    product_module: Optional[str] = None
    environment: Optional[str] = None
    error_messages: Optional[str] = None
    steps_to_reproduce: Optional[str] = None
    troubleshooting_attempted: Optional[str] = None
    conversation_summary: Optional[str] = None
    doc_references: Optional[dict] = None
    created_at: datetime
    updated_at: datetime
```

**File:** `backend/schemas/analytics.py`

```python
from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime, date

class MetricOverview(BaseModel):
    total_queries: int
    resolution_rate: float
    escalation_rate: float
    avg_confidence_score: float
    total_tickets: int
    total_sessions: int

class TrendPoint(BaseModel):
    date: date
    value: int
    label: str

class CommonIssue(BaseModel):
    pattern: str
    count: int
    severity: str
    last_seen: datetime

class AnalyticsOverviewResponse(BaseModel):
    metrics: MetricOverview
    trends: List[TrendPoint]
    common_issues: List[CommonIssue]
```

### 1.6 FastAPI Application Setup

**File:** `backend/main.py`

```python
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from config.settings import get_settings
from api.router import api_router

settings = get_settings()

app = FastAPI(
    title=settings.APP_NAME,
    version=settings.APP_VERSION,
    docs_url="/docs",
    redoc_url="/redoc",
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include API router
app.include_router(api_router, prefix="/api/v1")

@app.get("/health")
async def health_check():
    return {"status": "healthy", "version": settings.APP_VERSION}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
```

**File:** `backend/api/router.py`

```python
from fastapi import APIRouter
from api.v1.chat import router as chat_router
from api.v1.knowledge import router as knowledge_router
from api.v1.tickets import router as tickets_router
from api.v1.analytics import router as analytics_router

api_router = APIRouter()

api_router.include_router(chat_router, prefix="/chat", tags=["chat"])
api_router.include_router(knowledge_router, prefix="/knowledge", tags=["knowledge"])
api_router.include_router(tickets_router, prefix="/tickets", tags=["tickets"])
api_router.include_router(analytics_router, prefix="/analytics", tags=["analytics"])
```

**File:** `backend/api/dependencies.py`

```python
from fastapi import Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from config.database import get_db
from config.settings import get_settings

# NOTE: Do NOT redefine get_settings() here — it shadows the import and causes infinite recursion.
# Import directly in route files: from config.settings import get_settings

async def get_current_user(db: AsyncSession = Depends(get_db)):
    # Placeholder — no auth for hackathon demo; implement later
    pass
```

### 1.7 Stub API Routers

Create stub routers for all endpoints. These should return proper HTTP status codes and follow the schema definitions. Person 3 and Person 4 will replace the stubs with actual implementations.

**File:** `backend/api/v1/chat.py`

```python
from fastapi import APIRouter, Depends, HTTPException
from schemas.chat import ChatRequest, ChatResponse, SessionCreate, SessionResponse, SessionDetailResponse
# Person 3 will implement the actual service calls

router = APIRouter()

@router.post("/sessions", response_model=SessionResponse)
async def create_session(session: SessionCreate = None):
    # TODO: Person 3 will implement
    raise HTTPException(status_code=501, detail="Not implemented")

@router.post("/sessions/{session_id}/messages", response_model=ChatResponse)
async def send_message(session_id: str, message: ChatRequest):
    # TODO: Person 3 will implement
    raise HTTPException(status_code=501, detail="Not implemented")

@router.get("/sessions", response_model=list[SessionResponse])
async def list_sessions():
    # TODO: Person 3 will implement
    raise HTTPException(status_code=501, detail="Not implemented")

@router.get("/sessions/{session_id}", response_model=SessionDetailResponse)
async def get_session(session_id: str):
    # TODO: Person 3 will implement
    raise HTTPException(status_code=501, detail="Not implemented")
```

Create similar stub routers for `knowledge.py`, `tickets.py`, and `analytics.py`.

### 1.8 Requirements File

**File:** `backend/requirements.txt`

```
# Web Framework
fastapi==0.109.2
uvicorn[standard]==0.27.1
python-multipart==0.0.6

# Database
sqlalchemy==2.0.25
asyncpg==0.29.0
alembic==1.13.1
psycopg2-binary==2.9.9

# Validation
pydantic==2.5.3
pydantic-settings==2.1.0

# AI/ML
langchain==0.1.9
langchain-google-genai==0.0.6
langchain-community==0.0.21
google-generativeai==0.5.2

# Vector Database
chromadb==0.4.24
pgvector==0.2.4           # Required for Vector column type in SQLAlchemy

# Utilities
python-dotenv==1.0.0
httpx==0.26.0
aiohttp==3.9.1

# Testing
pytest==7.4.4
pytest-asyncio==0.23.3
# httpx already listed above under Utilities — removed duplicate

# Development
black==24.1.1
ruff==0.2.1
```

### 1.9 Environment Template

**File:** `backend/.env.example`

```env
# Application
APP_NAME=AI L2 Support Copilot
DEBUG=true

# Database
DATABASE_URL=postgresql+asyncpg://postgres:postgres@db:5432/copilot

# Redis
REDIS_URL=redis://redis:6379/0

# Gemini API
GEMINI_API_KEY=your_gemini_api_key_here
GEMINI_MODEL=gemini-2.0-flash
GEMINI_EMBEDDING_MODEL=text-embedding-004

# Jira
JIRA_URL=https://your-domain.atlassian.net
JIRA_EMAIL=your_email@example.com
JIRA_API_TOKEN=your_jira_api_token
JIRA_PROJECT_KEY=SUP

# ChromaDB
CHROMA_HOST=chromadb
CHROMA_PORT=8000
CHROMA_COLLECTION=knowledge_chunks

# CORS
CORS_ORIGINS=["http://localhost:3000","http://localhost:8000"]
```

---

## Acceptance Criteria

- [ ] All model files created with correct SQLAlchemy relationships
- [ ] All Pydantic schemas created matching the API specification
- [ ] FastAPI app starts successfully with `uvicorn main:app --reload`
- [ ] `/health` endpoint returns 200 OK
- [ ] `/docs` (Swagger UI) is accessible and shows all planned endpoints
- [ ] Database connection works with Docker Compose PostgreSQL
- [ ] `init_db.sql` creates all tables, indexes, and triggers correctly
- [ ] All stub API endpoints return 501 Not Implemented with proper JSON responses
- [ ] CORS is configured for localhost:3000 (frontend)
- [ ] `requirements.txt` includes all necessary dependencies
- [ ] `.env.example` has all required environment variables documented

---

## Dependencies

| Dependency | Owner | Status |
|------------|-------|--------|
| Architecture document | — | Available |
| Database schema | — | Defined in architecture.md |
| API contracts | — | Defined in architecture.md |

## Deliverables To

| Recipient | What They Get |
|-----------|--------------|
| Person 2 | Database session, models, settings |
| Person 3 | Models, schemas, API router structure |
| Person 4 | Models, schemas, API router structure |
| Person 5 | API endpoint contracts, Pydantic schemas |
| Person 6 | API endpoint contracts, Pydantic schemas |
| Person 7 | API endpoints to test, database structure |
| Person 8 | Docker init script, requirements.txt |

---

## Tips for AI-Assisted Implementation

1. Start with `config/settings.py` and `config/database.py` — these are the foundation
2. Create models one at a time, verifying relationships
3. Use the Pydantic schemas exactly as defined — they are the contract with frontend
4. Generate stub endpoints that match the API spec in architecture.md section 6
5. Test the FastAPI app locally before handing off
6. Use `uvicorn main:app --reload` for hot-reload during development
