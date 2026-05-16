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

# Hard-coded demo user — no auth layer yet.
DEMO_USER_ID = uuid.UUID("00000000-0000-0000-0000-000000000001")
DEMO_USER_NAME = "demo-user"
DEMO_USER_EMAIL = "demo@copilot.local"


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
        user_id: str,
        title: str | None = None,
        session_id: str | None = None,
    ) -> Session:
        """Create a new chat session."""
        uid = uuid.UUID(user_id) if isinstance(user_id, str) else user_id

        # Ensure the user row exists (demo convenience).
        user = await db.get(User, uid)
        if user is None:
            user = User(
                id=uid,
                username=DEMO_USER_NAME,
                email=DEMO_USER_EMAIL,
                password_hash="not-a-real-hash",
                role="agent",
            )
            db.add(user)
            await db.flush()

        session = Session(
            id=uuid.UUID(session_id) if session_id else uuid.uuid4(),
            user_id=uid,
            title=title or "New Conversation",
            status="active",
        )
        db.add(session)
        await db.flush()
        await db.refresh(session)
        return session

    async def get_session(self, db: AsyncSession, session_id: str) -> Session | None:
        """Load a session with its messages eagerly loaded."""
        result = await db.execute(
            select(Session)
            .where(Session.id == session_id)
            .options(selectinload(Session.messages))
        )
        return result.scalar_one_or_none()

    async def list_sessions(
        self, db: AsyncSession, user_id: str | None = None
    ) -> list[Session]:
        stmt = select(Session).order_by(Session.updated_at.desc())
        if user_id:
            uid = uuid.UUID(user_id) if isinstance(user_id, str) else user_id
            stmt = stmt.where(Session.user_id == uid)
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
        user_message: str,
        user_id: str,
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
        session = await self.get_session(db, session_id)
        if not session:
            logger.info(f"Session {session_id} not found, creating it...")
            session = await self.create_session(db, user_id=user_id, title=user_message[:80], session_id=session_id)
            # Re-fetch or ensure session_id matches
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
            
            if "I_DONT_KNOW" not in response_text:
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

        # ── 7. Fallback to base LLM ──────────────────────────────────────
        logger.info("RAG returned INSUFFICIENT_DOCUMENTATION — falling back to base LLM")
        fallback_prompt = (
            "Answer the following technical support or programming question based on your general knowledge. "
            "If you do not know the answer or are not highly confident, you MUST reply EXACTLY with 'I_DONT_KNOW'.\n\n"
            f"Question: {user_message}"
        )
        fallback_response = await self.rag_engine.llm_engine.generate_response([{"role": "user", "content": fallback_prompt}])
        
        if "I_DONT_KNOW" in fallback_response or "Mocked Response" in fallback_response:
            return await self._escalate(
                db, session_id, user_message, history, "high"
            )
        else:
            # NOTE: Do NOT save fallback answers to ChromaDB.
            # Doing so would cause future queries to match the generated answer
            # instead of real documentation (self-pollution).
            fb_sources = [{
                "source_id": "llm_fallback",
                "title": "AI Fallback Knowledge",
                "chunk_excerpt": fallback_response[:200]
            }]
            
            msg = await self._add_message(
                db, session_id, "assistant", fallback_response,
                confidence_score=0.8,
                sources=fb_sources,
            )
            return ChatResponse(
                session_id=str(session_id),
                message_id=str(msg.id),
                response=fallback_response,
                sources=[SourceInfo(**s) for s in fb_sources],
                action=Action.resolve,
                ticket=None,
            )

    async def stream_message(
        self,
        db: AsyncSession,
        session_id: str,
        user_message: str,
        user_id: str,
        knowledge_source_ids: list[str] | None = None,
    ) -> AsyncIterator[dict[str, Any]]:
        """Orchestrates the pipeline and yields chunks for streaming."""
        
        # 1. Ensure session exists
        session = await self.get_session(db, session_id)
        if not session:
            session = await self.create_session(db, user_id=user_id, title=user_message[:80], session_id=session_id)
            session_id = str(session.id)

        # 2. Store user message
        await self._add_message(db, session_id, "user", user_message)

        # Immediate yield for thinking bubble!
        yield {"type": "start"}

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
            yield {"type": "chunk", "content": text, "is_final": True}
            yield {
                "type": "final",
                "action": Action.clarification,
                "suggestions": initial.get("follow_up_questions", []),
                "message_id": str(msg.id)
            }
            return

        # 6. ReAct Query Understanding & Search
        improve_prompt = (
            f"Given the conversation history and the latest user query, write a single search query "
            f"(5-10 words) that would best find the answer in a technical documentation vector database. "
            f"If the query is already good, return it as is. Reply ONLY with the search query.\n\n"
            f"History: {history[-3:]}\n\n"
            f"Query: {user_message}"
        )
        search_query = await self.rag_engine.llm_engine.generate_response([{"role": "user", "content": improve_prompt}])
        search_query = search_query.strip(' \n\'"')

        filters = None
        if knowledge_source_ids:
            filters = {"source_id": {"$in": knowledge_source_ids}}
        search_results = await self.rag_engine.search(search_query, filters=filters)
        
        # --- Multi-hop Architecture ---
        # If we have some results, check if they are sufficient to answer the query.
        if search_results:
            context1 = self.rag_engine._build_context(search_results)
            check_prompt = (
                f"User Query: {user_message}\n\n"
                f"Retrieved Context:\n{context1}\n\n"
                f"Is the retrieved context sufficient to fully answer the user query? "
                f"If YES, reply exactly with 'SUFFICIENT'. "
                f"If NO, reply with ONE additional search query (5-10 words) to find the missing information."
            )
            hop_response = await self.rag_engine.llm_engine.generate_response([{"role": "user", "content": check_prompt}])
            hop_response = hop_response.strip(' \n\'"')
        logger.debug(f"RAG search for query: '{user_message[:100]}' ")
        search_results = await self.rag_engine.search(user_message, filters=filters)
        logger.info(f"[DEBUG] RAG returned {len(search_results) if search_results else 0} results")
        if not search_results:
            logger.info(f"[DEBUG] No RAG results -> ESCALATING to ticket")
            resp = await self._escalate(db, session_id, user_message, history, "medium")
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
        logger.info(f"[DEBUG] Post-retrieval confidence: score={post.get('score')}, action={post.get('action')}, retrieval={post.get('retrieval_score')}, relevance={post.get('relevance_score')}, completeness={post.get('completeness_score')}")

        # 8. Attempt Generation
        full_response, sources = await self.rag_engine.generate_response(user_message, search_results)
        
        if full_response != "INSUFFICIENT_DOCUMENTATION":
            yield {"type": "chunk", "content": full_response}
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
            return

        # 9. Fallback: INSUFFICIENT_DOCUMENTATION
        logger.info(f"[DEBUG] Fallback path triggered, calling LLM for general knowledge")
        fallback_prompt = (
            "Answer the following technical support or programming question based on your general knowledge. "
            "If you do not know the answer or are not highly confident, you MUST reply EXACTLY with 'I_DONT_KNOW'.\n\n"
            f"Question: {user_message}"
        )
        fallback_response = await self.rag_engine.llm_engine.generate_response([{"role": "user", "content": fallback_prompt}])
        logger.info(f"[DEBUG] Fallback LLM response (first 200 chars): {fallback_response[:200]}")
        
        if "I_DONT_KNOW" in fallback_response or "Mocked Response" in fallback_response:
            logger.info(f"[DEBUG] Fallback LLM said I_DONT_KNOW -> ESCALATING to ticket")
            # Base LLM also doesn't know -> Escalate to ticket
            resp = await self._escalate(db, session_id, user_message, history, "high")
            yield {"type": "chunk", "content": resp.response, "is_final": True}
            yield {
                "type": "final",
                "action": Action.escalated,
                "ticket": resp.ticket,
                "message_id": resp.message_id
            }
            return
        else:
            logger.info(f"[DEBUG] Fallback LLM returned answer -> NOT escalating, storing as knowledge")
            # Base model knows! Add to KC
            import time
            import uuid
            new_source_id = f"fallback_{int(time.time())}"
            await self.rag_engine.add_documents(new_source_id, f"Auto-generated answer for: {user_message}", [fallback_response])
            
            # If sources are empty, it means we used general knowledge
            if not sources and "general knowledge" in full_response.lower():
                 sources = [{
                     "source_id": "llm_fallback",
                     "title": "AI Fallback Knowledge",
                     "url": "",
                     "chunk_excerpt": full_response[:200]
                 }]
                 logger.info("Serving answer from base LLM general knowledge")
            
            msg = await self._add_message(
                db, session_id, "assistant", full_response,
                confidence_score=post.get("score", 0.5),
                sources=sources
            )
            yield {
                "type": "final",
                "action": Action.resolve,
                "sources": [SourceInfo(**s) for s in sources] if sources else [],
                "message_id": str(msg.id)
            }
            return

        # 9. Fallback: Base LLM also doesn't know -> Escalate to ticket
        resp = await self._escalate(db, session_id, user_message, history, "high")
        yield {"type": "chunk", "content": resp.response, "is_final": True}
        yield {
            "type": "final",
            "action": Action.escalated,
            "ticket": resp.ticket,
            "message_id": resp.message_id
        }
        return


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
