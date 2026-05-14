"""
Ticket Escalation Service

Creates, updates, and lists support tickets.
Integrates with Jira Cloud API (via JiraClient) for external ticket tracking.
Uses LLM to auto-extract structured ticket fields from conversations.
"""

from __future__ import annotations

import logging
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ai.llm_engine import LLMEngine
from ai.prompts import TICKET_CREATION_PROMPT
from models.ticket import Ticket
from models.session import Session
from models.message import Message
from services.jira_client import JiraClient

logger = logging.getLogger(__name__)


class TicketService:
    """Manages ticket creation, updates, and Jira synchronisation."""

    def __init__(
        self,
        jira_client: JiraClient | None = None,
        llm_engine: LLMEngine | None = None,
    ) -> None:
        self.jira_client = jira_client or JiraClient()
        if llm_engine is None:
            from ai.llm_engine import get_llm_engine
            llm_engine = get_llm_engine()
        self.llm_engine = llm_engine

    # ------------------------------------------------------------------
    # Ticket creation
    # ------------------------------------------------------------------

    async def create_ticket_from_chat(
        self,
        db: AsyncSession,
        session_id: str,
        query: str,
        conversation_history: list[str],
        severity: str = "medium",
    ) -> Ticket:
        """Create a ticket from a chat conversation.

        Uses the LLM to extract structured fields (summary, severity,
        product_module, etc.) from the conversation history.
        """
        conversation_text = "\n\n".join(conversation_history[-20:])  # last 20 msgs max

        # Build prompt — TICKET_CREATION_PROMPT is static, so we prepend context.
        prompt = (
            f"Conversation:\n{conversation_text}\n\n"
            f"Latest user query: {query}\n\n"
            f"{TICKET_CREATION_PROMPT}"
        )

        ticket_data = await self.llm_engine.generate_structured_response(
            prompt,
            schema_hint="summary, severity, product_module, environment, "
                        "error_messages, steps_to_reproduce, "
                        "troubleshooting_attempted, conversation_summary",
        )

        # Fallback if LLM returns empty dict.
        if not ticket_data:
            ticket_data = {
                "summary": query[:200],
                "severity": severity,
                "description": conversation_text[:2000],
            }

        def _format_field(val: Any) -> str | None:
            if val is None:
                return None
            if isinstance(val, list):
                return "\n".join(str(i) for i in val)
            return str(val)

        ticket = Ticket(
            session_id=session_id,
            summary=ticket_data.get("summary", query[:200]),
            description=ticket_data.get("description", conversation_text[:2000]),
            severity=ticket_data.get("severity", severity),
            product_module=ticket_data.get("product_module"),
            environment=ticket_data.get("environment"),
            error_messages=_format_field(ticket_data.get("error_messages")),
            steps_to_reproduce=_format_field(ticket_data.get("steps_to_reproduce")),
            troubleshooting_attempted=_format_field(ticket_data.get("troubleshooting_attempted")),
            conversation_summary=ticket_data.get(
                "conversation_summary", conversation_text[:1000]
            ),
            status="open",
        )

        db.add(ticket)
        await db.flush()

        # Sync to Jira (best-effort — never block on failure).
        try:
            jira_response = await self.jira_client.create_ticket(ticket)
            ticket.jira_issue_key = jira_response.get("key")
            ticket.jira_issue_id = str(jira_response.get("id", ""))
        except Exception as exc:
            logger.warning("Jira ticket creation failed: %s", exc)

        await db.flush()
        await db.refresh(ticket)

        # Mark session as escalated.
        session = await db.get(Session, session_id)
        if session:
            session.status = "escalated"

        return ticket

    async def create_manual_ticket(
        self,
        db: AsyncSession,
        session_id: str,
        query: str = "",
        conversation_history: list[str] | None = None,
        severity: str = "medium",
    ) -> Ticket:
        """Create a ticket from manual admin escalation with full context."""
        if not query or not conversation_history:
            # Fetch last 5 messages for context
            stmt = select(Message).where(Message.session_id == session_id).order_by(Message.created_at.desc()).limit(10)
            result = await db.execute(stmt)
            messages = list(result.scalars().all())
            messages.reverse()
            
            if not conversation_history:
                conversation_history = [f"{m.role}: {m.content}" for m in messages]
            
            if not query:
                # Use the last user message as the query
                user_msgs = [m.content for m in messages if m.role == "user"]
                query = user_msgs[-1] if user_msgs else "Manual escalation requested by user"

        return await self.create_ticket_from_chat(
            db=db,
            session_id=session_id,
            query=query,
            conversation_history=conversation_history,
            severity=severity,
        )

    # ------------------------------------------------------------------
    # CRUD operations
    # ------------------------------------------------------------------

    async def get_ticket(self, db: AsyncSession, ticket_id: str) -> Ticket | None:
        result = await db.execute(select(Ticket).where(Ticket.id == ticket_id))
        return result.scalar_one_or_none()

    async def list_tickets(
        self,
        db: AsyncSession,
        status: str | None = None,
        severity: str | None = None,
    ) -> list[Ticket]:
        stmt = select(Ticket)
        if status:
            stmt = stmt.where(Ticket.status == status)
        if severity:
            stmt = stmt.where(Ticket.severity == severity)
        stmt = stmt.order_by(Ticket.created_at.desc())

        result = await db.execute(stmt)
        return list(result.scalars().all())

    async def update_ticket(
        self,
        db: AsyncSession,
        ticket_id: str,
        **kwargs: Any,
    ) -> Ticket | None:
        ticket = await db.get(Ticket, ticket_id)
        if not ticket:
            return None
        for key, value in kwargs.items():
            if value is not None and hasattr(ticket, key):
                setattr(ticket, key, value)
        await db.flush()
        await db.refresh(ticket)
        return ticket
