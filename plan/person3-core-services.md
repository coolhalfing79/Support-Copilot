# Person 3 — Core Services & External Integrations

## Role: Backend Engineer (Business Logic)

---

## Task Overview

Implement all core business logic services including chat service, confidence scoring engine, ticket escalation service, knowledge ingestion service, and external integrations (Jira API, web crawler). This is the brain that orchestrates all AI components and external systems.

**Priority:** CRITICAL — Core business logic
**Start Time:** Hour 4 (after Person 1 provides models, Person 2 provides RAG)
**Primary Completion Target:** Hours 10-14

---

## Tech Stack

| Component | Technology | Version |
|-----------|-----------|---------|
| API Framework | FastAPI | 0.109+ |
| HTTP Client | httpx | 0.26+ |
| Web Scraping | BeautifulSoup4 | 4.12+ |
| Document Parsing | PyPDF2, python-docx | Latest |
| Task Queue | Redis (simple) | 7.x |
| Confidence Scoring | Custom (LLM + Heuristic) | — |

---

## Detailed Task Breakdown

### 3.1 Directory Structure

Create the following structure under `/backend/services`:

```
backend/services/
├── __init__.py
├── chat_service.py        # Conversation management
├── confidence_service.py  # Confidence scoring engine
├── ticket_service.py      # Ticket escalation
├── knowledge_service.py   # Knowledge ingestion
├── analytics_service.py   # Analytics aggregation
└── jira_client.py         # Jira API wrapper
```

### 3.2 Chat Service

**File:** `backend/services/chat_service.py`

```python
"""
Chat Service
Manages chat sessions and messages.
"""
from typing import List, Optional, Dict, Any
from datetime import datetime
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from sqlalchemy.orm import selectinload

from models.session import Session
from models.message import Message
from models.ticket import Ticket
from schemas.chat import (
    ChatRequest,
    ChatResponse,
    SessionResponse,
    SessionDetailResponse,
    MessageResponse,
    SourceInfo,
    TicketInfo,
    Action,
)
from ai.rag_pipeline import RAGEngine
from services.confidence_service import ConfidenceService
from services.ticket_service import TicketService

class ChatService:
    """Service for managing chat sessions and messages."""
    
    def __init__(self, rag_engine: RAGEngine, confidence_service: ConfidenceService, ticket_service: TicketService):
        self.rag_engine = rag_engine
        self.confidence_service = confidence_service
        self.ticket_service = ticket_service
    
    async def create_session(self, db: AsyncSession, user_id: str, title: Optional[str] = None) -> Session:
        """Create a new chat session."""
        session = Session(
            user_id=user_id,
            title=title or "New Conversation",
            status="active",
        )
        db.add(session)
        await db.flush()
        await db.refresh(session)
        return session
    
    async def get_session(self, db: AsyncSession, session_id: str) -> Optional[Session]:
        """Get a session with its messages."""
        result = await db.execute(
            select(Session)
            .where(Session.id == session_id)
            .options(selectinload(Session.messages))
        )
        return result.scalar_one_or_none()
    
    async def list_sessions(self, db: AsyncSession, user_id: str) -> List[Session]:
        """List all sessions for a user."""
        result = await db.execute(
            select(Session)
            .where(Session.user_id == user_id)
            .order_by(Session.updated_at.desc())
        )
        return list(result.scalars().all())
    
    async def add_message(
        self,
        db: AsyncSession,
        session_id: str,
        role: str,
        content: str,
        confidence_score: Optional[float] = None,
        sources: Optional[List[Dict]] = None,
    ) -> Message:
        """Add a message to a session."""
        message = Message(
            session_id=session_id,
            role=role,
            content=content,
            confidence_score=confidence_score,
            sources=sources,
        )
        db.add(message)
        await db.flush()
        await db.refresh(message)
        
        # Update session's updated_at
        session = await db.get(Session, session_id)
        if session:
            session.updated_at = datetime.utcnow()
        
        return message
    
    async def process_message(
        self,
        db: AsyncSession,
        session_id: str,
        user_message: str,
        follow_up_responses: Optional[List[str]] = None,
    ) -> ChatResponse:
        """
        Process a user message through the full pipeline.
        
        Flow:
        1. Store user message
        2. Calculate confidence
        3. Based on confidence: clarify, search, or resolve
        4. Store assistant response
        5. Return formatted response
        """
        # Store user message
        await self.add_message(db, session_id, "user", user_message)
        
        # Get conversation history for context
        session = await self.get_session(db, session_id)
        if not session:
            raise ValueError(f"Session {session_id} not found")
        
        # Get recent messages for context
        recent_messages = session.messages[-10:]  # Last 10 messages
        
        # Calculate initial confidence
        confidence_result = await self.confidence_service.calculate_confidence(
            query=user_message,
            conversation_history=[m.content for m in recent_messages],
            follow_up_responses=follow_up_responses,
        )
        
        action = confidence_result["action"]
        
        if action == "clarification":
            # Ask clarifying questions
            follow_up_questions = confidence_result.get("follow_up_questions", [])
            response_text = "I found some potentially relevant information, but I need more details to provide an accurate answer."
            
            assistant_msg = await self.add_message(
                db, session_id, "assistant",
                response_text,
                confidence_score=confidence_result.get("score"),
            )
            
            return ChatResponse(
                session_id=session_id,
                message_id=assistant_msg.id,
                response=response_text,
                sources=[],
                action=Action.clarification,
                follow_up_questions=follow_up_questions,
                ticket=None,
            )
        
        elif action == "searching":
            # Search knowledge base
            rag_result = await self.rag_engine.process_query(user_message)
            
            if rag_result["action"] == "resolve":
                # High confidence — return solution
                assistant_msg = await self.add_message(
                    db, session_id, "assistant",
                    rag_result["response"],
                    confidence_score=rag_result.get("confidence"),
                    sources=rag_result.get("sources", []),
                )
                
                return ChatResponse(
                    session_id=session_id,
                    message_id=assistant_msg.id,
                    response=rag_result["response"],
                    sources=[SourceInfo(**s) for s in rag_result.get("sources", [])],
                    action=Action.resolve,
                    ticket=None,
                )
            else:
                # No solution found — escalate
                ticket = await self.ticket_service.create_ticket_from_chat(
                    db=db,
                    session_id=session_id,
                    query=user_message,
                    conversation_history=[m.content for m in recent_messages],
                    severity=confidence_result.get("severity", "medium"),
                )
                
                assistant_msg = await self.add_message(
                    db, session_id, "assistant",
                    "I was unable to find a definitive resolution. I've created a support ticket for your issue.",
                    confidence_score=0.0,
                )
                
                return ChatResponse(
                    session_id=session_id,
                    message_id=assistant_msg.id,
                    response="I was unable to find a definitive resolution. I've created a support ticket for your issue.",
                    sources=[],
                    action=Action.escalated,
                    ticket=TicketInfo(
                        id=ticket.id,
                        jira_issue_key=ticket.jira_issue_key,
                        summary=ticket.summary,
                        severity=ticket.severity,
                        status=ticket.status,
                    ),
                )
        
        elif action == "resolve":
            # Direct resolve — search and return
            rag_result = await self.rag_engine.process_query(user_message)
            
            assistant_msg = await self.add_message(
                db, session_id, "assistant",
                rag_result["response"],
                confidence_score=rag_result.get("confidence"),
                sources=rag_result.get("sources", []),
            )
            
            return ChatResponse(
                session_id=session_id,
                message_id=assistant_msg.id,
                response=rag_result["response"],
                sources=[SourceInfo(**s) for s in rag_result.get("sources", [])],
                action=Action.resolve,
                ticket=None,
            )
        
        # Fallback
        raise ValueError(f"Unknown action: {action}")
```

### 3.3 Confidence Scoring Engine

**File:** `backend/services/confidence_service.py`

```python
"""
Confidence Scoring Engine
Calculates confidence scores for user queries using multi-factor approach.

confidence = (w1 * retrieval_score) + (w2 * relevance_score) + (w3 * completeness_score)

Where:
  w1 = 0.40 (retrieval similarity weight)
  w2 = 0.35 (LLM relevance assessment weight)
  w3 = 0.25 (documentation completeness weight)
"""
from typing import Dict, Any, Optional, List
from ai.llm_engine import LLMEngine

class ConfidenceService:
    """Service for calculating confidence scores."""
    
    # Confidence thresholds
    LOW_THRESHOLD = 0.40
    MEDIUM_THRESHOLD = 0.75
    
    # Weights
    W_RETRIEVAL = 0.40
    W_RELEVANCE = 0.35
    W_COMPLETENESS = 0.25
    
    def __init__(self, llm_engine: Optional[LLMEngine] = None):
        self.llm_engine = llm_engine or LLMEngine()
    
    async def calculate_confidence(
        self,
        query: str,
        conversation_history: Optional[List[str]] = None,
        follow_up_responses: Optional[List[str]] = None,
        retrieved_docs: Optional[List[Dict[str, Any]]] = None,
    ) -> Dict[str, Any]:
        """
        Calculate confidence score for a query.
        
        Args:
            query: User's question
            conversation_history: Previous messages in the conversation
            follow_up_responses: User's answers to clarifying questions
            retrieved_docs: Retrieved documents (if already searched)
            
        Returns:
            Dict with score, action, and optional metadata
        """
        # If we have follow-up responses, boost confidence
        if follow_up_responses:
            # User has provided more context — higher baseline confidence
            base_score = 0.50
        else:
            base_score = 0.30
        
        # If we have conversation history, use it to understand context
        if conversation_history and len(conversation_history) > 1:
            base_score = min(base_score + 0.15, 0.70)
        
        # Calculate factors
        if retrieved_docs:
            retrieval_score = self._calculate_retrieval_score(retrieved_docs)
            relevance_score = await self._calculate_relevance_score(query, retrieved_docs)
            completeness_score = self._calculate_completeness_score(retrieved_docs)
            
            confidence = (
                self.W_RETRIEVAL * retrieval_score +
                self.W_RELEVANCE * relevance_score +
                self.W_COMPLETENESS * completeness_score
            )
        else:
            # No documents retrieved yet — use initial assessment
            confidence = base_score
        
        # Determine action
        if confidence < self.LOW_THRESHOLD:
            action = "clarification"
        elif confidence < self.MEDIUM_THRESHOLD:
            action = "searching"
        else:
            action = "resolve"
        
        result = {
            "score": confidence,
            "action": action,
            "retrieval_score": retrieval_score if retrieved_docs else None,
            "relevance_score": relevance_score if retrieved_docs else None,
            "completeness_score": completeness_score if retrieved_docs else None,
        }
        
        if action == "clarification":
            result["follow_up_questions"] = await self._generate_clarification_questions(query)
        
        return result
    
    def _calculate_retrieval_score(self, docs: List[Dict[str, Any]]) -> float:
        """Calculate retrieval score from average similarity."""
        if not docs:
            return 0.0
        avg_similarity = sum(doc.get("similarity", 0) for doc in docs) / len(docs)
        return avg_similarity
    
    async def _calculate_relevance_score(
        self,
        query: str,
        docs: List[Dict[str, Any]],
    ) -> float:
        """Calculate relevance score using LLM evaluation."""
        if not docs:
            return 0.0
        
        # Evaluate top document
        top_doc = docs[0]
        score = await self.llm_engine.evaluate_relevance(query, top_doc["content"])
        return score
    
    def _calculate_completeness_score(self, docs: List[Dict[str, Any]]) -> float:
        """
        Calculate completeness score based on heuristics.
        Checks if retrieved chunks contain key elements.
        """
        if not docs:
            return 0.0
        
        scores = []
        for doc in docs:
            content = doc.get("content", "").lower()
            score = 0.0
            
            # Check for error codes/IDs
            if any(keyword in content for keyword in ["error", "err_", "exception", "fail"]):
                score += 0.3
            
            # Check for solution indicators
            if any(keyword in content for keyword in ["solution", "fix", "resolve", "step", "how to"]):
                score += 0.4
            
            # Check for procedural content
            if any(keyword in content for keyword in ["first", "then", "next", "finally"]):
                score += 0.3
            
            scores.append(min(score, 1.0))
        
        return sum(scores) / len(scores)
    
    async def _generate_clarification_questions(self, query: str) -> List[str]:
        """Generate clarifying questions for vague queries."""
        from ai.prompts import CLARIFICATION_PROMPT
        
        prompt = CLARIFICATION_PROMPT.format(query=query)
        response = await self.llm_engine.generate_response([{"role": "user", "content": prompt}])
        
        # Parse questions from response
        # Simple parsing — split by newlines and filter
        lines = [line.strip() for line in response.split("\n") if line.strip()]
        # Filter out numbers and return clean questions
        questions = []
        for line in lines:
            # Remove leading numbers/bullets
            cleaned = line.lstrip("0123456789.-* ")
            if cleaned and len(cleaned) > 10:
                questions.append(cleaned)
        
        return questions[:3]  # Max 3 questions
```

### 3.4 Ticket Escalation Service

**File:** `backend/services/ticket_service.py`

```python
"""
Ticket Escalation Service
Handles Jira ticket creation and management.
"""
from typing import Optional, List, Dict, Any
from datetime import datetime
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from models.ticket import Ticket
from models.session import Session
from schemas.ticket import TicketCreate, TicketResponse
from services.jira_client import JiraClient
from ai.llm_engine import LLMEngine
from ai.prompts import TICKET_CREATION_PROMPT

class TicketService:
    """Service for managing ticket escalation."""
    
    def __init__(self, jira_client: Optional[JiraClient] = None, llm_engine: Optional[LLMEngine] = None):
        self.jira_client = jira_client or JiraClient()
        self.llm_engine = llm_engine or LLMEngine()
    
    async def create_ticket_from_chat(
        self,
        db: AsyncSession,
        session_id: str,
        query: str,
        conversation_history: List[str],
        severity: str = "medium",
    ) -> Ticket:
        """
        Create a ticket from a chat conversation.
        Uses LLM to extract ticket information.
        """
        # Build conversation text
        conversation_text = "\n\n".join(conversation_history)
        
        # Generate ticket details using LLM
        prompt = TICKET_CREATION_PROMPT.format(
            conversation=conversation_text,
            query=query,
        )
        
        response = await self.llm_engine.generate_response(
            [{"role": "user", "content": prompt}]
        )
        
        # Parse LLM response (expecting JSON)
        import json
        try:
            ticket_data = json.loads(response)
        except json.JSONDecodeError:
            # Fallback: use query as summary
            ticket_data = {
                "summary": query[:100],
                "severity": severity,
                "description": conversation_text,
            }
        
        # Create ticket in database
        ticket = Ticket(
            session_id=session_id,
            summary=ticket_data.get("summary", query),
            description=ticket_data.get("description", conversation_text),
            severity=ticket_data.get("severity", severity),
            product_module=ticket_data.get("product_module"),
            environment=ticket_data.get("environment"),
            error_messages=ticket_data.get("error_messages"),
            steps_to_reproduce=ticket_data.get("steps_to_reproduce"),
            troubleshooting_attempted=ticket_data.get("troubleshooting_attempted"),
            conversation_summary=conversation_text[:1000],  # Truncate
            status="open",
        )
        
        db.add(ticket)
        await db.flush()
        
        # Create Jira ticket (async, don't block)
        try:
            jira_response = await self.jira_client.create_ticket(ticket)
            ticket.jira_issue_key = jira_response.get("key")
            ticket.jira_issue_id = jira_response.get("id")
        except Exception as e:
            # Log error but don't fail — Jira might be down
            print(f"Failed to create Jira ticket: {e}")
        
        await db.flush()
        await db.refresh(ticket)
        
        return ticket
    
    async def create_manual_ticket(
        self,
        db: AsyncSession,
        ticket_data: TicketCreate,
    ) -> Ticket:
        """Create a ticket manually (from admin interface)."""
        ticket = Ticket(
            session_id=ticket_data.session_id,
            summary=ticket_data.summary,
            description=ticket_data.description,
            severity=ticket_data.severity,
            product_module=ticket_data.product_module,
            environment=ticket_data.environment,
            error_messages=ticket_data.error_messages,
            steps_to_reproduce=ticket_data.steps_to_reproduce,
            troubleshooting_attempted=ticket_data.troubleshooting_attempted,
            status="open",
        )
        
        db.add(ticket)
        await db.flush()
        
        # Create Jira ticket
        try:
            jira_response = await self.jira_client.create_ticket(ticket)
            ticket.jira_issue_key = jira_response.get("key")
            ticket.jira_issue_id = jira_response.get("id")
        except Exception as e:
            print(f"Failed to create Jira ticket: {e}")
        
        await db.refresh(ticket)
        return ticket
    
    async def get_ticket(self, db: AsyncSession, ticket_id: str) -> Optional[Ticket]:
        """Get a ticket by ID."""
        result = await db.execute(select(Ticket).where(Ticket.id == ticket_id))
        return result.scalar_one_or_none()
    
    async def list_tickets(
        self,
        db: AsyncSession,
        status: Optional[str] = None,
        severity: Optional[str] = None,
    ) -> List[Ticket]:
        """List tickets with optional filters."""
        query = select(Ticket)
        
        if status:
            query = query.where(Ticket.status == status)
        if severity:
            query = query.where(Ticket.severity == severity)
        
        query = query.order_by(Ticket.created_at.desc())
        
        result = await db.execute(query)
        return list(result.scalars().all())
    
    async def update_ticket(
        self,
        db: AsyncSession,
        ticket_id: str,
        **kwargs,
    ) -> Optional[Ticket]:
        """Update a ticket."""
        ticket = await db.get(Ticket, ticket_id)
        if not ticket:
            return None
        
        for key, value in kwargs.items():
            if hasattr(ticket, key):
                setattr(ticket, key, value)
        
        await db.flush()
        await db.refresh(ticket)
        return ticket
```

### 3.5 Jira Client

**File:** `backend/services/jira_client.py`

```python
"""
Jira Client
Wrapper for Jira Cloud API.
Includes mock fallback for demo reliability.
"""
import os
import base64
from typing import Dict, Any, Optional
import httpx
from config.settings import get_settings

class JiraClient:
    """Client for Jira Cloud API."""
    
    def __init__(self):
        settings = get_settings()
        self.base_url = settings.JIRA_URL.rstrip("/")
        self.email = settings.JIRA_EMAIL
        self.api_token = settings.JIRA_API_TOKEN
        self.project_key = settings.JIRA_PROJECT_KEY
        self.use_mock = not settings.JIRA_API_TOKEN  # Use mock if no token
    
    async def create_ticket(
        self,
        ticket,
    ) -> Dict[str, Any]:
        """
        Create a Jira issue.
        
        Args:
            ticket: Ticket model instance
            
        Returns:
            Jira response with issue key and ID
        """
        if self.use_mock:
            return self._mock_create_ticket(ticket)
        
        url = f"{self.base_url}/rest/api/3/issue"
        
        headers = {
            "Accept": "application/json",
            "Content-Type": "application/json",
            "Authorization": f"Basic {self._get_auth_header()}",
        }
        
        payload = {
            "fields": {
                "project": {"key": self.project_key},
                "summary": ticket.summary[:255],
                "description": ticket.description or "",
                "issuetype": {"name": "Task"},
                "priority": self._map_severity_to_priority(ticket.severity),
                "labels": ["copilot-escalation"],
            }
        }
        
        async with httpx.AsyncClient() as client:
            response = await client.post(url, json=payload, headers=headers, timeout=30.0)
            response.raise_for_status()
            return response.json()
    
    def _get_auth_header(self) -> str:
        """Get base64-encoded auth header."""
        credentials = f"{self.email}:{self.api_token}"
        return base64.b64encode(credentials.encode()).decode()
    
    def _map_severity_to_priority(self, severity: str) -> str:
        """Map our severity to Jira priority."""
        mapping = {
            "low": "Low",
            "medium": "Medium",
            "high": "High",
            "critical": "Highest",
        }
        return mapping.get(severity, "Medium")
    
    def _mock_create_ticket(self, ticket) -> Dict[str, Any]:
        """
        Mock Jira ticket creation for demo.
        Returns a fake issue key.
        """
        import uuid
        mock_key = f"SUP-{uuid.uuid4().hex[:6].upper()}"
        return {
            "key": mock_key,
            "id": str(ticket.id),
            "self": f"{self.base_url}/browse/{mock_key}",
        }
    
    async def get_ticket(self, issue_key: str) -> Optional[Dict[str, Any]]:
        """Get a Jira issue by key."""
        if self.use_mock:
            return {"key": issue_key, "status": "Open"}
        
        url = f"{self.base_url}/rest/api/3/issue/{issue_key}"
        headers = {
            "Accept": "application/json",
            "Authorization": f"Basic {self._get_auth_header()}",
        }
        
        async with httpx.AsyncClient() as client:
            response = await client.get(url, headers=headers, timeout=30.0)
            response.raise_for_status()
            return response.json()
```

### 3.6 Knowledge Ingestion Service

**File:** `backend/services/knowledge_service.py`

```python
"""
Knowledge Ingestion Service
Handles adding, processing, and managing knowledge sources.
"""
from typing import Optional, List
from datetime import datetime
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from models.knowledge_source import KnowledgeSource
from services.jira_client import JiraClient  # For potential error reporting
from ai.rag_pipeline import RAGEngine
from utils.text_splitter import TextSplitter
from utils.web_scraper import WebScraper

class KnowledgeService:
    """Service for managing knowledge sources and ingestion."""
    
    def __init__(
        self,
        rag_engine: RAGEngine,
        scraper: Optional[WebScraper] = None,
    ):
        self.rag_engine = rag_engine
        self.scraper = scraper or WebScraper()
        self.text_splitter = TextSplitter()
    
    async def add_source(
        self,
        db: AsyncSession,
        url: str,
        title: Optional[str] = None,
        source_type: str = "web_page",
    ) -> KnowledgeSource:
        """Add a new knowledge source."""
        source = KnowledgeSource(
            url=url,
            title=title or url,
            source_type=source_type,
            status="pending",
        )
        db.add(source)
        await db.flush()
        await db.refresh(source)
        return source
    
    async def ingest_source(self, source_id: str) -> bool:
        """
        Ingest a knowledge source.
        1. Fetch content from URL
        2. Parse and split into chunks
        3. Generate embeddings
        4. Store in ChromaDB
        """
        # This would be called from an async task
        # For now, synchronous implementation
        
        # Get source from DB (needs db session — use a global or pass it)
        # ...
        
        # Fetch content
        content = await self.scraper.fetch_content(source.url)
        
        # Split into chunks
        chunks = self.text_splitter.split_text(content)
        
        # Add to vector store
        chunk_count = await self.rag_engine.add_documents(
            source_id=source_id,
            source_title=source.title or source.url,
            chunks=chunks,
        )
        
        return chunk_count > 0
    
    async def list_sources(self, db: AsyncSession) -> List[KnowledgeSource]:
        """List all knowledge sources."""
        result = await db.execute(
            select(KnowledgeSource).order_by(KnowledgeSource.created_at.desc())
        )
        return list(result.scalars().all())
    
    async def delete_source(self, db: AsyncSession, source_id: str) -> bool:
        """Delete a knowledge source."""
        source = await db.get(KnowledgeSource, source_id)
        if not source:
            return False
        
        await db.delete(source)
        return True
    
    async def reindex_source(self, db: AsyncSession, source_id: str) -> bool:
        """Re-index a knowledge source."""
        # Delete existing chunks from ChromaDB
        # ...
        
        # Re-ingest
        return await self.ingest_source(source_id)
```

### 3.7 Web Scraper Utility

**File:** `backend/utils/web_scraper.py`

```python
"""
Web Scraper Utility
Fetches and parses web content for knowledge ingestion.
"""
import re
from typing import Optional
import httpx
from bs4 import BeautifulSoup

class WebScraper:
    """Utility for scraping web content."""
    
    def __init__(self, timeout: float = 30.0):
        self.timeout = timeout
    
    async def fetch_content(self, url: str) -> str:
        """
        Fetch content from a URL and return clean text.
        
        Args:
            url: URL to fetch
            
        Returns:
            Cleaned text content
        """
        headers = {
            "User-Agent": "Mozilla/5.0 (compatible; CopilotBot/1.0)"
        }
        
        async with httpx.AsyncClient(timeout=self.timeout) as client:
            response = await client.get(url, headers=headers)
            response.raise_for_status()
            
            return self._parse_html(response.text)
    
    def _parse_html(self, html: str) -> str:
        """
        Parse HTML and extract clean text.
        
        Args:
            html: Raw HTML content
            
        Returns:
            Cleaned text content
        """
        soup = BeautifulSoup(html, "html.parser")
        
        # Remove script and style elements
        for element in soup(["script", "style", "nav", "footer", "header"]):
            element.decompose()
        
        # Get text
        text = soup.get_text()
        
        # Clean up whitespace
        lines = (line.strip() for line in text.splitlines())
        chunks = (phrase.strip() for line in lines for phrase in line.split("  "))
        text = " ".join(chunk for chunk in chunks if chunk)
        
        return text
    
    async def fetch_pdf(self, url: str) -> str:
        """
        Fetch and extract text from a PDF.
        
        Args:
            url: URL of the PDF
            
        Returns:
            Extracted text content
        """
        # Use PyPDF2 or pdfplumber
        # This is a placeholder implementation
        pass
    
    async def fetch_docx(self, url: str) -> str:
        """
        Fetch and extract text from a DOCX file.
        
        Args:
            url: URL of the DOCX file
            
        Returns:
            Extracted text content
        """
        # Use python-docx
        # This is a placeholder implementation
        pass
```

### 3.8 Update API Routers

Replace the stub endpoints in `backend/api/v1/chat.py`, `backend/api/v1/tickets.py`, and `backend/api/v1/knowledge.py` with actual implementations that call the services.

**Updated `backend/api/v1/chat.py`:**

```python
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from config.database import get_db
from services.chat_service import ChatService
from schemas.chat import ChatRequest, ChatResponse, SessionCreate, SessionResponse
# ... imports

router = APIRouter()

@router.post("/sessions", response_model=SessionResponse)
async def create_session(session: SessionCreate = None, db: AsyncSession = Depends(get_db)):
    # Person 3: Implement using ChatService
    chat_service = ChatService(rag_engine, confidence_service, ticket_service)
    new_session = await chat_service.create_session(db, user_id="demo-user")
    return SessionResponse(
        id=str(new_session.id),
        title=new_session.title,
        status=new_session.status,
        created_at=new_session.created_at,
        updated_at=new_session.updated_at,
    )

@router.post("/sessions/{session_id}/messages", response_model=ChatResponse)
async def send_message(session_id: str, message: ChatRequest, db: AsyncSession = Depends(get_db)):
    # Person 3: Implement using ChatService
    chat_service = ChatService(rag_engine, confidence_service, ticket_service)
    response = await chat_service.process_message(
        db, session_id, message.message, message.follow_up_responses
    )
    return response
```

Similar updates for `knowledge.py` and `tickets.py`.

---

## Acceptance Criteria

- [ ] `ChatService.create_session()` creates sessions correctly
- [ ] `ChatService.process_message()` handles all confidence paths (clarify, search, resolve, escalate)
- [ ] `ConfidenceService.calculate_confidence()` returns correct actions based on thresholds
- [ ] `TicketService.create_ticket_from_chat()` creates tickets with LLM-extracted details
- [ ] `JiraClient` works with real Jira API AND mock fallback
- [ ] `KnowledgeService.ingest_source()` successfully adds content to ChromaDB
- [ ] `WebScraper.fetch_content()` extracts clean text from sample URLs
- [ ] All API endpoints return proper JSON responses matching schemas
- [ ] Error handling for Jira API failures (mock fallback works)

---

## Dependencies

| Dependency | Owner | Status |
|------------|-------|--------|
| Database models | Person 1 | Required |
| RAG Engine | Person 2 | Required |
| LLM Engine | Person 2 | Required |
| ChromaDB | Person 8 | Required |
| Redis | Person 8 | Optional (for async tasks) |

## Deliverables To

| Recipient | What They Get |
|-----------|--------------|
| Person 4 | Service layer for analytics |
| Person 5 | Working chat API endpoints |
| Person 6 | Working knowledge and ticket API endpoints |
| Person 7 | Testable service endpoints |

---

## Tips for AI-Assisted Implementation

1. Start with `JiraClient` — it's self-contained and has mock fallback
2. Build `ConfidenceService` next — it's pure logic, no external deps
3. Then `TicketService` — uses JiraClient and LLM
4. `ChatService` is the most complex — build it last as it orchestrates everything
5. Use the mock Jira for rapid development
6. Test confidence thresholds with sample queries
7. The web scraper can use simple httpx + BeautifulSoup — no need for Scrapy
