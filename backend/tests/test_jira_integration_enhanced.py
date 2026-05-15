"""
Enhanced tests for Jira integration functionality.
Tests the new methods in TicketService and the new API endpoints.
"""

import pytest
import uuid
from unittest.mock import AsyncMock, MagicMock, patch
from datetime import datetime, timezone
from services.ticket_service import TicketService
from models.ticket import Ticket
from models.enums import TicketStatus

@pytest.mark.asyncio
class TestTicketServiceEnhanced:
    """Tests for enhanced TicketService methods."""

    async def test_sync_ticket_to_jira(self):
        """Should call jira_client.sync_status and refresh ticket."""
        mock_jira = AsyncMock()
        service = TicketService(jira_client=mock_jira)
        
        mock_db = AsyncMock()
        mock_ticket = MagicMock(spec=Ticket)
        mock_ticket.id = uuid.uuid4()
        mock_ticket.jira_issue_key = "SUP-123"
        
        mock_db.get.return_value = mock_ticket
        
        await service.sync_ticket_to_jira(mock_db, str(mock_ticket.id))
        
        mock_jira.sync_status.assert_called_once_with(str(mock_ticket.id), mock_db)
        mock_db.refresh.assert_called_once_with(mock_ticket)

    async def test_add_comment_to_ticket(self):
        """Should add comment via jira_client and update local ticket."""
        mock_jira = AsyncMock()
        service = TicketService(jira_client=mock_jira)
        
        mock_db = AsyncMock()
        mock_ticket = MagicMock(spec=Ticket)
        mock_ticket.id = uuid.uuid4()
        mock_ticket.jira_issue_key = "SUP-123"
        mock_ticket.jira_comments = []
        
        mock_db.get.return_value = mock_ticket
        
        mock_jira.add_comment.return_value = {
            "id": "1001",
            "author": "Jira Admin",
            "created": "2025-01-15T10:30:00.000+0000"
        }
        
        result = await service.add_comment_to_ticket(
            mock_db, str(mock_ticket.id), "Test comment", source="copilot"
        )
        
        assert result["id"] == "1001"
        mock_jira.add_comment.assert_called_once_with("SUP-123", "Test comment")
        assert len(mock_ticket.jira_comments) == 1
        assert mock_ticket.jira_comments[0]["body"] == "Test comment"
        mock_db.flush.assert_called_once()

    async def test_list_tickets_with_jira_status_refresh(self):
        """Should sync status for each ticket when refresh_from_jira is True."""
        mock_jira = AsyncMock()
        service = TicketService(jira_client=mock_jira)
        
        mock_db = AsyncMock()
        mock_ticket = MagicMock(spec=Ticket)
        mock_ticket.id = uuid.uuid4()
        mock_ticket.jira_issue_key = "SUP-123"
        
        # Mock list_tickets to return our ticket
        with patch.object(service, "list_tickets", AsyncMock(return_value=[mock_ticket])):
            await service.list_tickets_with_jira_status(
                mock_db, refresh_from_jira=True
            )
            
            mock_jira.sync_status.assert_called_once_with(str(mock_ticket.id), mock_db)

@pytest.mark.asyncio
class TestTicketApiEnhanced:
    """Tests for new Ticket API endpoints."""

    @patch("api.v1.tickets.get_ticket_service")
    async def test_add_ticket_comment_endpoint(self, mock_get_service):
        """POST /tickets/{id}/comment should call service.add_comment_to_ticket."""
        from api.v1.tickets import add_ticket_comment
        
        mock_service = AsyncMock()
        mock_get_service.return_value = mock_service
        
        mock_service.add_comment_to_ticket.return_value = {"id": "1001"}
        
        ticket_id = uuid.uuid4()
        body = MagicMock()
        body.comment = "New comment"
        body.source = "copilot"
        
        response = await add_ticket_comment(ticket_id, body, MagicMock())
        
        assert response.comment == {"id": "1001"}
        mock_service.add_comment_to_ticket.assert_called_once()

    @patch("api.v1.tickets.get_ticket_service")
    async def test_sync_all_tickets_endpoint(self, mock_get_service):
        """POST /tickets/sync should sync all tickets with jira keys."""
        from api.v1.tickets import sync_all_tickets
        
        mock_service = AsyncMock()
        mock_get_service.return_value = mock_service
        
        mock_ticket = MagicMock(spec=Ticket)
        mock_ticket.id = uuid.uuid4()
        mock_ticket.jira_issue_key = "SUP-123"
        
        mock_service.list_tickets.return_value = [mock_ticket]
        mock_service.sync_ticket_to_jira.return_value = mock_ticket
        
        response = await sync_all_tickets(MagicMock())
        
        assert response.updated_count == 1
        mock_service.sync_ticket_to_jira.assert_called_once()

    @patch("api.v1.tickets.get_jira_client")
    async def test_get_issue_types_endpoint(self, mock_get_jira):
        """GET /tickets/jira/issue-types should return issue types from jira client."""
        from api.v1.tickets import get_issue_types
        
        mock_jira = AsyncMock()
        mock_get_jira.return_value = mock_jira
        
        mock_jira.get_issue_types.return_value = [
            {"id": "1", "name": "Bug", "subtask": False, "iconUrl": "http://example.com/bug.png"}
        ]
        
        response = await get_issue_types()
        
        assert len(response.issue_types) == 1
        assert response.issue_types[0].name == "Bug"
