"""
Service Factory

Lightweight factory functions to create service instances with proper
dependency wiring.  Avoids module-level instantiation which would fail
if external services (ChromaDB, LLM provider) are not yet available at import time.
"""

from __future__ import annotations

from functools import lru_cache

from ai.llm_engine import get_llm_engine
from ai.rag_pipeline import get_rag_engine
from services.analytics_service import AnalyticsService
from services.chat_service import ChatService
from services.confidence_service import ConfidenceService
from services.jira_client import JiraClient
from services.knowledge_service import KnowledgeService
from services.ticket_service import TicketService


@lru_cache(maxsize=1)
def get_jira_client() -> JiraClient:
    return JiraClient()


@lru_cache(maxsize=1)
def get_confidence_service() -> ConfidenceService:
    return ConfidenceService(llm_engine=get_llm_engine())


@lru_cache(maxsize=1)
def get_ticket_service() -> TicketService:
    return TicketService(
        jira_client=get_jira_client(),
        llm_engine=get_llm_engine(),
    )


@lru_cache(maxsize=1)
def get_knowledge_service() -> KnowledgeService:
    return KnowledgeService(rag_engine=get_rag_engine())


@lru_cache(maxsize=1)
def get_chat_service() -> ChatService:
    return ChatService(
        rag_engine=get_rag_engine(),
        confidence_service=get_confidence_service(),
        ticket_service=get_ticket_service(),
    )


@lru_cache(maxsize=1)
def get_analytics_service() -> AnalyticsService:
    return AnalyticsService()
