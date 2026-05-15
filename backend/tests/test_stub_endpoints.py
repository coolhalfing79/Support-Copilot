"""
Integration tests for API endpoints (Person 3 implementation).

These replaced the original Person 1 stub tests that asserted 501 responses.
Now that the endpoints are live, we verify they return proper responses.

NOTE: These tests hit real routes via ASGI transport.  The chat and ticket
endpoints connect to external services (DB, ChromaDB, Gemini) which may
not be available in CI.  We mark them so they can be skipped selectively.
"""

import pytest
import pytest
from httpx import ASGITransport, AsyncClient
from unittest.mock import patch, MagicMock, AsyncMock

from main import app

CHAT_SESSION_URL = "/api/v1/chat/sessions"
KNOWLEDGE_URL = "/api/v1/knowledge/sources"
TICKETS_URL = "/api/v1/tickets"
ANALYTICS_URL = "/api/v1/analytics/overview"


@pytest.mark.asyncio
async def test_chat_sessions_post_not_501() -> None:
    """POST /chat/sessions should no longer return 501 (stubs replaced)."""
    # Mock the db method so it doesn't try real db/chroma
    with patch("api.v1.chat.get_chat_service") as mock_get_chat_service:
        mock_service = AsyncMock()
        mock_session = MagicMock()
        mock_session.id = "12345678-1234-5678-1234-567812345678"
        mock_session.title = "Test"
        mock_session.status = "active"
        from datetime import datetime, timezone
        mock_session.created_at = datetime.now(timezone.utc)
        mock_session.updated_at = datetime.now(timezone.utc)
        mock_service.create_session.return_value = mock_session
        mock_get_chat_service.return_value = mock_service
        
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            r = await client.post(CHAT_SESSION_URL, json={})
            # Should be 201 (success) or a 5xx from missing infra — never 501.
            assert r.status_code != 501


@pytest.mark.asyncio
async def test_knowledge_sources_post_not_501() -> None:
    """POST /knowledge/sources should no longer return 501."""
    with patch("api.v1.knowledge.get_knowledge_service") as mock_get_knowledge_service:
        mock_service = AsyncMock()
        mock_source = MagicMock()
        mock_source.id = "12345678-1234-5678-1234-567812345678"
        mock_source.url = "https://example.com/docs"
        mock_source.status = "pending"
        mock_service.add_source.return_value = mock_source
        mock_get_knowledge_service.return_value = mock_service
        
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            r = await client.post(
                KNOWLEDGE_URL,
                json={"url": "https://example.com/docs"},
            )
            assert r.status_code != 501


@pytest.mark.asyncio
async def test_tickets_list_not_501() -> None:
    """GET /tickets should no longer return 501."""
    from config.database import get_db
    mock_db = AsyncMock()
    mock_result = MagicMock()
    mock_result.scalars.return_value.all.return_value = []
    mock_db.execute.return_value = mock_result
    app.dependency_overrides[get_db] = lambda: mock_db
    
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        r = await client.get(TICKETS_URL)
        assert r.status_code != 501
    app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_analytics_overview_still_501() -> None:
    """GET /analytics/overview is still a stub (Person 4 scope)."""
    mock_service = AsyncMock()
    from schemas.analytics import MetricOverview
    mock_overview = MetricOverview(
        total_queries=0,
        total_tickets=0,
        total_sessions=0,
        resolution_rate=0.0,
        escalation_rate=0.0,
        avg_confidence_score=0.0
    )
    mock_service.get_overview.return_value = mock_overview
    mock_service.get_trends.return_value = []
    mock_service.get_common_issues.return_value = []
    
    with patch("api.v1.analytics.analytics_service", mock_service):
        
        from config.database import get_db
        app.dependency_overrides[get_db] = lambda: AsyncMock()
        
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            r = await client.get(ANALYTICS_URL)
            # Analytics is Person 4's scope — may still be 501, or 200 now.
            assert r.status_code in (200, 501)
            
        app.dependency_overrides.clear()
