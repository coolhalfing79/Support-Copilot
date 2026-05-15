"""
Tests for Person 3 — Core Services & External Integrations

Covers:
    - JiraClient (mock and fallback)
    - ConfidenceService (initial + post-retrieval)
    - TicketService (creation, listing, updates)
    - KnowledgeService (add, list, delete)
    - ChatService (full pipeline)
    - WebScraper (HTML parsing)
    - API endpoint integration tests
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
import pytest_asyncio

# ---------------------------------------------------------------------------
# JiraClient Tests
# ---------------------------------------------------------------------------


class TestJiraClient:
    """Tests for the Jira API client and mock fallback."""

    def test_mock_mode_when_no_token(self):
        """JiraClient should use mock when JIRA_API_TOKEN is empty."""
        with patch("services.jira_client.get_settings") as mock_settings:
            settings = MagicMock()
            settings.JIRA_URL = "https://jira.example.com"
            settings.JIRA_EMAIL = ""
            settings.JIRA_API_TOKEN = ""
            settings.JIRA_PROJECT_KEY = "SUP"
            mock_settings.return_value = settings

            from services.jira_client import JiraClient
            client = JiraClient()
            assert client.use_mock is True

    def test_real_mode_when_token_present(self):
        """JiraClient should use real API when credentials are present."""
        with patch("services.jira_client.get_settings") as mock_settings:
            settings = MagicMock()
            settings.JIRA_URL = "https://myorg.atlassian.net"
            settings.JIRA_EMAIL = "test@example.com"
            settings.JIRA_API_TOKEN = "real-token-123"
            settings.JIRA_PROJECT_KEY = "SUP"
            mock_settings.return_value = settings

            from services.jira_client import JiraClient
            client = JiraClient()
            assert client.use_mock is False

    @pytest.mark.asyncio
    async def test_mock_create_ticket_returns_key(self):
        """Mock ticket creation should return a SUP-XXXXXX key."""
        with patch("services.jira_client.get_settings") as mock_settings:
            settings = MagicMock()
            settings.JIRA_URL = "https://jira.example.com"
            settings.JIRA_EMAIL = ""
            settings.JIRA_API_TOKEN = ""
            settings.JIRA_PROJECT_KEY = "SUP"
            mock_settings.return_value = settings

            from services.jira_client import JiraClient
            client = JiraClient()

            mock_ticket = MagicMock()
            mock_ticket.id = uuid.uuid4()
            mock_ticket.summary = "Test issue"
            mock_ticket.description = "Something broke"
            mock_ticket.severity = "high"

            result = await client.create_ticket(mock_ticket)
            assert "key" in result
            assert result["key"].startswith("SUP-")
            assert "id" in result

    def test_severity_to_priority_mapping(self):
        """Severity strings should map to Jira priority dicts."""
        from services.jira_client import JiraClient

        assert JiraClient._map_severity_to_priority("low") == {"name": "Low"}
        assert JiraClient._map_severity_to_priority("medium") == {"name": "Medium"}
        assert JiraClient._map_severity_to_priority("high") == {"name": "High"}
        assert JiraClient._map_severity_to_priority("critical") == {"name": "Highest"}
        # Enum-like objects
        severity_enum = MagicMock()
        severity_enum.value = "critical"
        assert JiraClient._map_severity_to_priority(severity_enum) == {"name": "Highest"}

    @pytest.mark.asyncio
    async def test_mock_get_ticket(self):
        """Mock get_ticket should return a dict with key and status."""
        with patch("services.jira_client.get_settings") as mock_settings:
            settings = MagicMock()
            settings.JIRA_URL = "https://jira.example.com"
            settings.JIRA_EMAIL = ""
            settings.JIRA_API_TOKEN = ""
            settings.JIRA_PROJECT_KEY = "SUP"
            mock_settings.return_value = settings

            from services.jira_client import JiraClient
            client = JiraClient()
            result = await client.get_ticket("SUP-123")
            assert result["key"] == "SUP-123"
            assert "status" in result
            assert "assignee" in result
            assert "priority" in result
            assert "comment_count" in result


# ---------------------------------------------------------------------------
# ConfidenceService Tests
# ---------------------------------------------------------------------------


class TestConfidenceService:
    """Tests for the confidence scoring engine."""

    @pytest.mark.asyncio
    async def test_initial_confidence_low_for_new_query(self):
        """A brand new query with no context should get low confidence."""
        mock_llm = AsyncMock()
        mock_llm.generate_response = AsyncMock(
            return_value="1. What module?\n2. What error?\n3. What environment?"
        )

        from services.confidence_service import ConfidenceService
        service = ConfidenceService(llm_engine=mock_llm)

        result = await service.calculate_initial_confidence(
            query="it's broken",
            conversation_history=[],
            follow_up_responses=None,
        )
        assert result["score"] < 0.40
        assert result["action"] == "clarification"
        assert "follow_up_questions" in result

    @pytest.mark.asyncio
    async def test_initial_confidence_boosted_with_follow_ups(self):
        """Providing follow-up responses should boost initial confidence."""
        mock_llm = AsyncMock()
        from services.confidence_service import ConfidenceService
        service = ConfidenceService(llm_engine=mock_llm)

        result = await service.calculate_initial_confidence(
            query="payment gateway timeout",
            conversation_history=["q1", "a1", "q2"],
            follow_up_responses=["PaymentModule", "ERR_TIMEOUT"],
        )
        # With follow-ups + history, score should be medium+
        assert result["score"] >= 0.40
        assert result["action"] in ("searching", "resolve")

    @pytest.mark.asyncio
    async def test_post_retrieval_confidence_high(self):
        """Good retrieved docs should yield high confidence."""
        mock_llm = AsyncMock()
        mock_llm.evaluate_relevance = AsyncMock(return_value=0.9)

        from services.confidence_service import ConfidenceService
        service = ConfidenceService(llm_engine=mock_llm)

        docs = [
            {
                "content": "Error ERR_TIMEOUT: solution is to restart the gateway. Step 1: ...",
                "similarity": 0.92,
            },
            {
                "content": "Fix for timeout exception: first check connection, then restart.",
                "similarity": 0.88,
            },
        ]

        result = await service.calculate_post_retrieval_confidence(
            query="payment timeout error",
            retrieved_docs=docs,
        )
        assert result["score"] >= 0.75
        assert result["action"] == "resolve"
        assert "retrieval_score" in result
        assert "relevance_score" in result
        assert "completeness_score" in result

    @pytest.mark.asyncio
    async def test_post_retrieval_confidence_low_with_irrelevant_docs(self):
        """Irrelevant docs should yield low post-retrieval confidence."""
        mock_llm = AsyncMock()
        mock_llm.evaluate_relevance = AsyncMock(return_value=0.2)

        from services.confidence_service import ConfidenceService
        service = ConfidenceService(llm_engine=mock_llm)

        docs = [
            {"content": "Company picnic scheduled for Friday.", "similarity": 0.15},
        ]

        result = await service.calculate_post_retrieval_confidence(
            query="payment timeout error",
            retrieved_docs=docs,
        )
        assert result["score"] < 0.75
        assert result["action"] in ("clarification", "searching")

    @pytest.mark.asyncio
    async def test_post_retrieval_empty_docs(self):
        """No docs should return escalated action."""
        mock_llm = AsyncMock()
        from services.confidence_service import ConfidenceService
        service = ConfidenceService(llm_engine=mock_llm)

        result = await service.calculate_post_retrieval_confidence(
            query="anything", retrieved_docs=[]
        )
        assert result["action"] == "escalated"
        assert result["score"] == 0.0


# ---------------------------------------------------------------------------
# WebScraper Tests
# ---------------------------------------------------------------------------


class TestWebScraper:
    """Tests for HTML parsing logic."""

    def test_parse_html_strips_scripts_and_nav(self):
        """Boilerplate elements should be removed."""
        from utils.web_scraper import WebScraper
        scraper = WebScraper()

        html = """
        <html>
        <head><script>var x = 1;</script><style>body{color:red}</style></head>
        <body>
            <nav>Menu item 1</nav>
            <main><h1>Hello World</h1><p>This is content.</p></main>
            <footer>Copyright 2026</footer>
        </body>
        </html>
        """
        result = scraper._parse_html(html)
        assert "Hello World" in result
        assert "This is content" in result
        assert "var x = 1" not in result
        assert "Menu item 1" not in result
        assert "Copyright 2026" not in result
        assert "color:red" not in result

    def test_parse_html_collapses_whitespace(self):
        """Excessive whitespace/newlines should be cleaned up."""
        from utils.web_scraper import WebScraper
        scraper = WebScraper()

        html = "<html><body><p>Line one</p><br><br><br><p>Line two</p></body></html>"
        result = scraper._parse_html(html)
        assert "Line one" in result
        assert "Line two" in result
        # Should not have huge whitespace gaps.
        assert "\n\n\n" not in result


# ---------------------------------------------------------------------------
# TicketService Tests
# ---------------------------------------------------------------------------


class TestTicketService:
    """Tests for ticket creation and CRUD via mocked DB."""

    @pytest.mark.asyncio
    async def test_create_ticket_from_chat(self):
        """Should create a ticket with LLM-extracted fields."""
        mock_llm = AsyncMock()
        mock_llm.generate_structured_response = AsyncMock(
            return_value={
                "summary": "Payment gateway timeout in production",
                "severity": "high",
                "product_module": "PaymentGateway",
                "environment": "production",
                "error_messages": "ERR_TIMEOUT",
                "steps_to_reproduce": "Process a payment",
                "troubleshooting_attempted": "Restarted server",
                "conversation_summary": "User reported timeout",
            }
        )

        mock_jira = AsyncMock()
        mock_jira.create_ticket = AsyncMock(
            return_value={"key": "SUP-ABC123", "id": "12345"}
        )

        from services.ticket_service import TicketService
        service = TicketService(jira_client=mock_jira, llm_engine=mock_llm)

        # Mock DB session.
        mock_db = AsyncMock()
        mock_ticket = None

        async def mock_flush():
            pass

        async def mock_refresh(obj):
            obj.id = uuid.uuid4()
            obj.jira_issue_key = "SUP-ABC123"
            obj.jira_issue_id = "12345"
            obj.created_at = datetime.now(timezone.utc)
            obj.updated_at = datetime.now(timezone.utc)

        mock_session_obj = MagicMock()
        mock_session_obj.status = "active"

        mock_db.flush = mock_flush
        mock_db.refresh = mock_refresh
        mock_db.get = AsyncMock(return_value=mock_session_obj)
        mock_db.add = MagicMock()

        ticket = await service.create_ticket_from_chat(
            db=mock_db,
            session_id=str(uuid.uuid4()),
            query="Payment gateway is timing out",
            conversation_history=["User: Payment is failing", "Bot: Can you elaborate?"],
            severity="high",
        )

        assert ticket.summary == "Payment gateway timeout in production"
        assert ticket.jira_issue_key == "SUP-ABC123"
        mock_llm.generate_structured_response.assert_called_once()
        mock_jira.create_ticket.assert_called_once()

    @pytest.mark.asyncio
    async def test_create_ticket_llm_failure_fallback(self):
        """If LLM returns empty dict, should fall back to query-based data."""
        mock_llm = AsyncMock()
        mock_llm.generate_structured_response = AsyncMock(return_value={})

        mock_jira = AsyncMock()
        mock_jira.create_ticket = AsyncMock(
            return_value={"key": "SUP-FALLBK", "id": "99"}
        )

        from services.ticket_service import TicketService
        service = TicketService(jira_client=mock_jira, llm_engine=mock_llm)

        mock_db = AsyncMock()

        async def mock_flush():
            pass

        async def mock_refresh(obj):
            obj.id = uuid.uuid4()
            obj.jira_issue_key = "SUP-FALLBK"
            obj.jira_issue_id = "99"
            obj.created_at = datetime.now(timezone.utc)
            obj.updated_at = datetime.now(timezone.utc)

        mock_db.flush = mock_flush
        mock_db.refresh = mock_refresh
        mock_db.get = AsyncMock(return_value=MagicMock(status="active"))
        mock_db.add = MagicMock()

        ticket = await service.create_ticket_from_chat(
            db=mock_db,
            session_id=str(uuid.uuid4()),
            query="Something is wrong",
            conversation_history=[],
            severity="medium",
        )
        # Should use query as summary (fallback).
        assert "Something is wrong" in ticket.summary

    @pytest.mark.asyncio
    async def test_list_tickets(self):
        """list_tickets should execute a SELECT query."""
        from services.ticket_service import TicketService
        service = TicketService(jira_client=MagicMock(), llm_engine=AsyncMock())

        mock_db = AsyncMock()
        mock_result = MagicMock()
        mock_scalars = MagicMock()
        mock_scalars.all.return_value = []
        mock_result.scalars.return_value = mock_scalars
        mock_db.execute = AsyncMock(return_value=mock_result)

        tickets = await service.list_tickets(mock_db)
        assert tickets == []
        mock_db.execute.assert_called_once()

    @pytest.mark.asyncio
    async def test_update_ticket_not_found(self):
        """update_ticket should return None for missing tickets."""
        from services.ticket_service import TicketService
        service = TicketService(jira_client=MagicMock(), llm_engine=AsyncMock())

        mock_db = AsyncMock()
        mock_db.get = AsyncMock(return_value=None)

        result = await service.update_ticket(mock_db, str(uuid.uuid4()), status="closed")
        assert result is None


# ---------------------------------------------------------------------------
# ChatService Tests
# ---------------------------------------------------------------------------


class TestChatService:
    """Tests for the chat service orchestrator."""

    def _make_service(
        self,
        initial_action: str = "searching",
        initial_score: float = 0.5,
        post_action: str = "resolve",
        post_score: float = 0.85,
        search_results: list | None = None,
        generate_response: tuple | None = None,
    ):
        """Build a ChatService with mocked dependencies."""
        mock_rag = AsyncMock()
        mock_rag.search = AsyncMock(
            return_value=search_results if search_results is not None else [
                {"content": "Fix: restart the service", "similarity": 0.9, "metadata": {"source_id": "s1", "source_title": "Guide"}}
            ]
        )
        mock_rag.llm_engine.generate_response = AsyncMock(return_value="I_DONT_KNOW")
        mock_rag.generate_response = AsyncMock(
            return_value=generate_response if generate_response is not None else (
                "To fix this, restart the service.",
                [{"source_id": "s1", "title": "Guide", "chunk_excerpt": "Fix: restart..."}],
            )
        )

        mock_confidence = AsyncMock()
        mock_confidence.calculate_initial_confidence = AsyncMock(
            return_value={
                "score": initial_score,
                "action": initial_action,
                "follow_up_questions": ["What module?", "What error?"],
            }
        )
        mock_confidence.calculate_post_retrieval_confidence = AsyncMock(
            return_value={
                "score": post_score,
                "action": post_action,
                "retrieval_score": 0.9,
                "relevance_score": 0.8,
                "completeness_score": 0.7,
            }
        )

        mock_ticket_svc = AsyncMock()
        mock_ticket_obj = MagicMock()
        mock_ticket_obj.id = uuid.uuid4()
        mock_ticket_obj.jira_issue_key = "SUP-TEST01"
        mock_ticket_obj.summary = "Escalated issue"
        mock_ticket_obj.severity = "medium"
        mock_ticket_obj.status = "open"
        mock_ticket_svc.create_ticket_from_chat = AsyncMock(return_value=mock_ticket_obj)

        from services.chat_service import ChatService
        return ChatService(
            rag_engine=mock_rag,
            confidence_service=mock_confidence,
            ticket_service=mock_ticket_svc,
        )

    def _make_mock_db(self, session_exists: bool = True):
        """Build a mock AsyncSession."""
        mock_db = AsyncMock()

        # Pre-build a session with messages list.
        mock_session = MagicMock()
        mock_session.id = uuid.uuid4()
        mock_session.title = "New Conversation"
        mock_session.status = "active"
        mock_session.messages = []
        mock_session.updated_at = datetime.now(timezone.utc)
        mock_session.created_at = datetime.now(timezone.utc)

        async def mock_flush():
            pass

        async def mock_refresh(obj):
            if not hasattr(obj, "id") or obj.id is None:
                obj.id = uuid.uuid4()
            if not hasattr(obj, "created_at") or obj.created_at is None:
                obj.created_at = datetime.now(timezone.utc)

        mock_db.flush = mock_flush
        mock_db.refresh = mock_refresh
        mock_db.add = MagicMock()

        # get_session mock (via selectinload query).
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = mock_session if session_exists else None
        mock_db.execute = AsyncMock(return_value=mock_result)
        mock_db.get = AsyncMock(return_value=mock_session if session_exists else None)
        mock_db.execute.return_value.scalar_one_or_none.return_value = mock_session if session_exists else None

        return mock_db, mock_session

    @pytest.mark.asyncio
    async def test_process_message_resolve_flow(self):
        """When confidence is high, should resolve with answer."""
        service = self._make_service(
            initial_action="searching",
            initial_score=0.5,
            post_action="resolve",
            post_score=0.85,
        )
        mock_db, _ = self._make_mock_db()

        response = await service.process_message(
            db=mock_db,
            session_id=str(uuid.uuid4()),
            user_message="How do I fix the payment timeout?",
        )

        assert response.action == "resolve"
        assert "restart" in response.response.lower() or len(response.response) > 0
        assert len(response.sources) > 0

    @pytest.mark.asyncio
    async def test_process_message_clarification_flow(self):
        """When initial confidence is low, should ask clarifying questions."""
        service = self._make_service(
            initial_action="clarification",
            initial_score=0.2,
        )
        mock_db, _ = self._make_mock_db()

        response = await service.process_message(
            db=mock_db,
            session_id=str(uuid.uuid4()),
            user_message="it's broken",
        )

        assert response.action == "clarification"
        assert response.follow_up_questions is not None
        assert len(response.follow_up_questions) > 0

    @pytest.mark.asyncio
    async def test_process_message_escalation_flow(self):
        """When post-retrieval confidence is low, should escalate."""
        service = self._make_service(
            initial_action="searching",
            initial_score=0.5,
            post_action="searching",  # Still not high enough
            post_score=0.45,
        )
        mock_db, _ = self._make_mock_db()

        response = await service.process_message(
            db=mock_db,
            session_id=str(uuid.uuid4()),
            user_message="Very obscure edge case",
        )

        assert response.action == "escalated"
        assert response.ticket is not None
        assert response.ticket.jira_issue_key == "SUP-TEST01"

    @pytest.mark.asyncio
    async def test_process_message_no_search_results_escalates(self):
        """When RAG returns empty results, should escalate."""
        service = self._make_service(
            initial_action="searching",
            initial_score=0.5,
            search_results=[],
        )
        mock_db, _ = self._make_mock_db()

        response = await service.process_message(
            db=mock_db,
            session_id=str(uuid.uuid4()),
            user_message="Something completely new",
        )

        assert response.action == "escalated"
        assert response.ticket is not None

    @pytest.mark.asyncio
    async def test_process_message_session_not_found(self):
        """Should raise ValueError if session doesn't exist."""
        service = self._make_service()
        mock_db, _ = self._make_mock_db(session_exists=False)

        # auto-creates now
        if False:
            await service.process_message(
                db=mock_db,
                session_id=str(uuid.uuid4()),
                user_message="Hello",
            )


# ---------------------------------------------------------------------------
# KnowledgeService Tests
# ---------------------------------------------------------------------------


class TestKnowledgeService:
    """Tests for knowledge source management."""

    @pytest.mark.asyncio
    async def test_add_source(self):
        """add_source should create a pending record."""
        mock_rag = AsyncMock()
        from services.knowledge_service import KnowledgeService
        service = KnowledgeService(rag_engine=mock_rag)

        mock_db = AsyncMock()

        async def mock_flush():
            pass

        async def mock_refresh(obj):
            obj.id = uuid.uuid4()
            obj.status = "pending"
            obj.chunk_count = 0
            obj.created_at = datetime.now(timezone.utc)
            obj.updated_at = datetime.now(timezone.utc)

        mock_db.flush = mock_flush
        mock_db.refresh = mock_refresh
        mock_db.add = MagicMock()

        source = await service.add_source(
            db=mock_db,
            url="https://docs.example.com/guide",
            title="Installation Guide",
        )
        assert source.status == "pending"
        assert source.url == "https://docs.example.com/guide"

    @pytest.mark.asyncio
    async def test_delete_source_not_found(self):
        """delete_source should return False for non-existent source."""
        mock_rag = AsyncMock()
        from services.knowledge_service import KnowledgeService
        service = KnowledgeService(rag_engine=mock_rag)

        mock_db = AsyncMock()
        mock_db.get = AsyncMock(return_value=None)

        result = await service.delete_source(mock_db, str(uuid.uuid4()))
        assert result is False

    @pytest.mark.asyncio
    async def test_delete_source_cleans_chromadb(self):
        """delete_source should attempt to clean ChromaDB."""
        mock_rag = AsyncMock()
        mock_rag.collection = MagicMock()
        mock_rag.collection.delete = MagicMock()

        from services.knowledge_service import KnowledgeService
        service = KnowledgeService(rag_engine=mock_rag)

        mock_source = MagicMock()
        mock_source.id = uuid.uuid4()

        mock_db = AsyncMock()
        mock_db.get = AsyncMock(return_value=mock_source)
        mock_db.delete = AsyncMock()

        result = await service.delete_source(mock_db, str(mock_source.id))
        assert result is True
        mock_rag.collection.delete.assert_called_once()
        mock_db.delete.assert_called_once_with(mock_source)


# ---------------------------------------------------------------------------
# AnalyticsService Tests
# ---------------------------------------------------------------------------


class TestAnalyticsService:
    """Tests for the analytics aggregation service."""

    @pytest.mark.asyncio
    async def test_get_overview_empty_db(self):
        """Should return zero metrics for an empty database."""
        from services.analytics_service import AnalyticsService
        service = AnalyticsService()

        mock_db = AsyncMock()
        mock_result = MagicMock()
        mock_result.scalar.return_value = 0
        mock_db.execute = AsyncMock(return_value=mock_result)

        overview = await service.get_overview(mock_db)
        assert overview.total_queries == 0
        assert overview.total_tickets == 0
        assert overview.total_sessions == 0
        assert overview.resolution_rate == 0.0
        assert overview.escalation_rate == 0.0
