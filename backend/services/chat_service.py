"""
Chat Service — Main Orchestrator

Manages chat sessions and messages.  Orchestrates the full pipeline:
    User message → initial confidence → RAG search → post-retrieval confidence
    → resolve / clarify / escalate.
"""

from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone
from typing import Any, AsyncIterator

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from ai.rag_pipeline import RAGEngine
from models.message import Message
from models.session import Session
from models.user import User
from schemas.chat import (
    Action,
    ChatResponse,
    SourceInfo,
    TicketInfo,
)
from services.confidence_service import ConfidenceService
from services.ticket_service import TicketService

logger = logging.getLogger(__name__)

# Authentication and user-specific session management.


class ChatService:
    """Service for managing chat sessions and the message pipeline."""

    def __init__(
        self,
        rag_engine: RAGEngine,
        confidence_service: ConfidenceService,
        ticket_service: TicketService,
    ) -> None:
        self.rag_engine = rag_engine
        self.confidence_service = confidence_service
        self.ticket_service = ticket_service

    # ------------------------------------------------------------------
    # Session management
    # ------------------------------------------------------------------

    async def create_session(
        self,
        db: AsyncSession,
        user_id: uuid.UUID,
        title: str | None = None,
        session_id: str | None = None,
    ) -> Session:
        """Create a new chat session for a specific user."""
        session = Session(
            id=uuid.UUID(session_id) if session_id else uuid.uuid4(),
            user_id=user_id,
            title=title or "New Conversation",
            status="active",
        )
        db.add(session)
        await db.flush()
        await db.refresh(session)
        return session

    async def get_session(self, db: AsyncSession, session_id: str, user_id: uuid.UUID | None = None) -> Session | None:
        """Load a session with its messages, optionally filtering by user for security."""
        stmt = select(Session).where(Session.id == session_id).options(selectinload(Session.messages))
        if user_id:
            stmt = stmt.where(Session.user_id == user_id)
        
        result = await db.execute(stmt)
        return result.scalar_one_or_none()

    async def list_sessions(
        self, db: AsyncSession, user_id: uuid.UUID
    ) -> list[Session]:
        """List sessions belonging to a specific user."""
        stmt = select(Session).where(Session.user_id == user_id).order_by(Session.updated_at.desc())
        result = await db.execute(stmt)
        return list(result.scalars().all())

    # ------------------------------------------------------------------
    # Message helpers
    # ------------------------------------------------------------------

    async def _add_message(
        self,
        db: AsyncSession,
        session_id: str,
        role: str,
        content: str,
        confidence_score: float | None = None,
        sources: list[dict[str, Any]] | None = None,
    ) -> Message:
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

        # Touch session.updated_at.
        session = await db.get(Session, session_id)
        if session:
            session.updated_at = datetime.now(timezone.utc)

        return message

    # ------------------------------------------------------------------
    # Core message processing pipeline
    # ------------------------------------------------------------------

    async def process_message(
        self,
        db: AsyncSession,
        session_id: str,
        user_id: uuid.UUID,
        user_message: str,
        follow_up_responses: list[str] | None = None,
        knowledge_source_ids: list[str] | None = None,
    ) -> ChatResponse:
        """Full pipeline: store → confidence → RAG → respond.

        Flow:
            1. Store user message in DB.
            2. Calculate initial confidence (heuristic — no docs).
            3. LOW  → return clarifying questions.
            4. MEDIUM / HIGH → run RAG search.
            5. Calculate post-retrieval confidence (full formula).
            6. HIGH  → return solution with sources.
            7. LOW / MEDIUM + no good answer → escalate to Jira.
        """

        # ── 1. Ensure session exists ────────────────────────────────────
        session = await self.get_session(db, session_id, user_id=user_id)
        if not session:
            logger.info(f"Session {session_id} not found for user {user_id}, creating it...")
            session = await self.create_session(db, user_id=user_id, title=user_message[:80], session_id=session_id)
            session_id = str(session.id)

        # ── 2. Store user message ───────────────────────────────────────
        await self._add_message(db, session_id, "user", user_message)

        # Auto-title the session on first user message.
        if session.title == "New Conversation" and user_message:
            session.title = user_message[:80].strip()

        # ── 3. Extract history safely ──────────────────────────────────
        # For new sessions, messages will be empty. We avoid lazy-loading errors.
        try:
            recent_messages = session.messages[-10:] if session.messages else []
        except Exception:
            # Relationship not loaded, likely a new session
            recent_messages = []
            
        history = [m.content for m in recent_messages]

        # ── 4. Initial confidence ───────────────────────────────────────
        initial = await self.confidence_service.calculate_initial_confidence(
            query=user_message,
            conversation_history=history,
            follow_up_responses=follow_up_responses,
        )

        # ── 3. LOW → clarification ─────────────────────────────────────
        if initial["action"] == "clarification":
            follow_up_questions = initial.get("follow_up_questions", [])
            text = (
                "I'd like to help, but I need a bit more information to "
                "give you an accurate answer."
            )
            msg = await self._add_message(
                db, session_id, "assistant", text,
                confidence_score=initial["score"],
            )
            return ChatResponse(
                session_id=str(session_id),
                message_id=str(msg.id),
                response=text,
                sources=[],
                action=Action.clarification,
                follow_up_questions=follow_up_questions,
                ticket=None,
            )

        # ── 4. MEDIUM / HIGH → RAG search ──────────────────────────────
        filters = None
        if knowledge_source_ids:
            filters = {"source_id": {"$in": knowledge_source_ids}}
        search_results = await self.rag_engine.search(user_message, filters=filters)

        if not search_results:
            # No docs at all → escalate immediately.
            return await self._escalate(
                db, session_id, user_message, history, "medium"
            )

        # ── 5. Post-retrieval confidence ────────────────────────────────
        post = await self.confidence_service.calculate_post_retrieval_confidence(
            query=user_message,
            retrieved_docs=search_results,
        )

        # ── 6. HIGH → resolve ──────────────────────────────────────────
        if post["action"] == "resolve":
            response_text, sources = await self.rag_engine.generate_response(
                user_message, search_results
            )
            msg = await self._add_message(
                db, session_id, "assistant", response_text,
                confidence_score=post["score"],
                sources=sources,
            )
            return ChatResponse(
                session_id=str(session_id),
                message_id=str(msg.id),
                response=response_text,
                sources=[SourceInfo(**s) for s in sources],
                action=Action.resolve,
                ticket=None,
            )

        # ── 7. Fallback → escalate ──────────────────────────────────────
        return await self._escalate(
            db, session_id, user_message, history, "high"
        )

    async def stream_message(
        self,
        db: AsyncSession,
        session_id: str,
        user_id: uuid.UUID,
        user_message: str,
        knowledge_source_ids: list[str] | None = None,
    ) -> AsyncIterator[dict[str, Any]]:
        """Orchestrates the pipeline and yields chunks for streaming."""
        
        # 1. Ensure session exists
        session = await self.get_session(db, session_id, user_id=user_id)
        if not session:
            session = await self.create_session(db, user_id=user_id, title=user_message[:80], session_id=session_id)
            session_id = str(session.id)

        # 2. Store user message
        await self._add_message(db, session_id, "user", user_message)

        # 3. Extract history
        try:
            recent_messages = session.messages[-10:] if session.messages else []
        except Exception:
            recent_messages = []
        history = [m.content for m in recent_messages]

        # 4. Initial confidence
        initial = await self.confidence_service.calculate_initial_confidence(
            query=user_message,
            conversation_history=history,
        )

        # 5. Clarification?
        if initial["action"] == "clarification":
            text = "I'd like to help, but I need a bit more information to give you an accurate answer."
            msg = await self._add_message(db, session_id, "assistant", text, confidence_score=initial["score"])
            yield {"type": "start"}
            yield {"type": "chunk", "content": text, "is_final": True}
            yield {
                "type": "final",
                "action": Action.clarification,
                "suggestions": initial.get("follow_up_questions", []),
                "message_id": str(msg.id)
            }
            return

        # 6. RAG Search
        filters = None
        if knowledge_source_ids:
            filters = {"source_id": {"$in": knowledge_source_ids}}
        search_results = await self.rag_engine.search(user_message, filters=filters)
        if not search_results:
            resp = await self._escalate(db, session_id, user_message, history, "medium")
            yield {"type": "start"}
            yield {"type": "chunk", "content": resp.response, "is_final": True}
            yield {
                "type": "final",
                "action": Action.escalated,
                "ticket": resp.ticket,
                "message_id": resp.message_id
            }
            return

        # 7. Post-retrieval confidence
        post = await self.confidence_service.calculate_post_retrieval_confidence(
            query=user_message,
            retrieved_docs=search_results,
        )

        # 8. Resolve or Escalate?
        if post["action"] == "resolve":
            yield {"type": "start"}
            full_response = ""
            async for chunk in self.rag_engine.generate_response_stream(user_message, search_results):
                full_response += chunk
                yield {"type": "chunk", "content": chunk}
            
            # Save to DB after streaming finishes
            sources = [
                {
                    "source_id": str(doc.get("metadata", {}).get("source_id", "")),
                    "title": str(doc.get("metadata", {}).get("source_title", "")),
                    "chunk_excerpt": doc.get("content", "")[:200],
                }
                for doc in search_results
            ]
            msg = await self._add_message(
                db, session_id, "assistant", full_response,
                confidence_score=post["score"],
                sources=sources
            )
            yield {
                "type": "final",
                "action": Action.resolve,
                "sources": [SourceInfo(**s) for s in sources],
                "message_id": str(msg.id)
            }
        else:
            resp = await self._escalate(db, session_id, user_message, history, "high")
            yield {"type": "start"}
            yield {"type": "chunk", "content": resp.response, "is_final": True}
            yield {
                "type": "final",
                "action": Action.escalated,
                "ticket": resp.ticket,
                "message_id": resp.message_id
            }

    # ------------------------------------------------------------------
    # Escalation helper
    # ------------------------------------------------------------------

    async def _escalate(
        self,
        db: AsyncSession,
        session_id: str,
        query: str,
        history: list[str],
        severity: str,
    ) -> ChatResponse:
        """Create a Jira ticket and return an escalated response."""
        ticket = await self.ticket_service.create_ticket_from_chat(
            db=db,
            session_id=session_id,
            query=query,
            conversation_history=history,
            severity=severity,
        )

        text = (
            "I wasn't able to find a definitive solution in the knowledge base. "
            "I've created a support ticket so our team can look into this."
        )
        msg = await self._add_message(
            db, session_id, "assistant", text, confidence_score=0.0
        )

        return ChatResponse(
            session_id=str(session_id),
            message_id=str(msg.id),
            response=text,
            sources=[],
            action=Action.escalated,
            ticket=TicketInfo(
                id=str(ticket.id),
                jira_issue_key=ticket.jira_issue_key,
                summary=ticket.summary,
                severity=(
                    ticket.severity.value
                    if hasattr(ticket.severity, "value")
                    else str(ticket.severity)
                ),
                status=(
                    ticket.status.value
                    if hasattr(ticket.status, "value")
                    else str(ticket.status)
                ),
            ),
        )
