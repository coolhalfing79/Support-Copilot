"""
Integration tests for JiraClient — verifying HTTP call logic.
Tests that JiraClient uses the correct endpoints and payloads for Transitions and accountId updates.
"""

import pytest
import json
from unittest.mock import MagicMock, patch, AsyncMock
from services.jira_client import JiraClient

@pytest.fixture
def configured_settings():
    """Return settings with API token to enable real HTTP logic (mocked)."""
    settings = MagicMock()
    settings.JIRA_URL = "https://yourteam.atlassian.net"
    settings.JIRA_EMAIL = "admin@example.com"
    settings.JIRA_API_TOKEN = "fake-token"
    settings.JIRA_PROJECT_KEY = "SUP"
    return settings

@pytest.mark.asyncio
class TestJiraClientHttpLogic:
    """Tests verifying the HTTP requests made by JiraClient."""

    @patch("services.jira_client.get_settings")
    async def test_update_ticket_status_uses_transitions(self, mock_get_settings, configured_settings):
        """Should call transitions API for status updates."""
        mock_get_settings.return_value = configured_settings
        client = JiraClient()
        
        # Mock responses for:
        # 1. GET transitions
        # 2. POST transition
        # 3. GET ticket (refetch)
        
        mock_resp_transitions = MagicMock()
        mock_resp_transitions.status_code = 200
        mock_resp_transitions.json.return_value = {
            "transitions": [
                {"id": "31", "name": "In Progress"},
                {"id": "41", "name": "Done"}
            ]
        }
        
        mock_resp_post = MagicMock()
        mock_resp_post.status_code = 204 # or 200/201 depending on Jira
        mock_resp_post.raise_for_status = MagicMock()
        
        mock_resp_get = MagicMock()
        mock_resp_get.status_code = 200
        mock_resp_get.json.return_value = {
            "key": "SUP-123",
            "fields": {
                "status": {"name": "In Progress"}
            }
        }
        
        with patch("httpx.AsyncClient.get", side_effect=[mock_resp_transitions, mock_resp_get]) as mock_get:
            with patch("httpx.AsyncClient.post", return_value=mock_resp_post) as mock_post:
                result = await client.update_ticket("SUP-123", status="In Progress")
                
                # Verify transitions were fetched
                mock_get.assert_any_call(
                    f"{client.base_url}/rest/api/3/issue/SUP-123/transitions",
                    headers=client._headers()
                )
                
                # Verify transition was performed
                mock_post.assert_called_once()
                args, kwargs = mock_post.call_args
                payload = kwargs["json"]
                assert payload["transition"]["id"] == "31"
                
                assert result["status"] == "In Progress"

    @patch("services.jira_client.get_settings")
    async def test_update_ticket_assignee_uses_account_id(self, mock_get_settings, configured_settings):
        """Should use accountId object for assignee updates."""
        mock_get_settings.return_value = configured_settings
        client = JiraClient()
        
        # Mock responses for:
        # 1. PUT issue
        # 2. GET ticket (refetch)
        
        mock_resp_put = MagicMock()
        mock_resp_put.status_code = 204
        mock_resp_put.raise_for_status = MagicMock()
        
        mock_resp_get = MagicMock()
        mock_resp_get.status_code = 200
        mock_resp_get.json.return_value = {
            "key": "SUP-123",
            "fields": {
                "assignee": {"displayName": "Test User", "accountId": "acc-123"}
            }
        }
        
        with patch("httpx.AsyncClient.put", return_value=mock_resp_put) as mock_put:
            with patch("httpx.AsyncClient.get", return_value=mock_resp_get) as mock_get:
                result = await client.update_ticket("SUP-123", assignee_id="acc-123")
                
                # Verify PUT payload
                mock_put.assert_called_once()
                args, kwargs = mock_put.call_args
                payload = kwargs["json"]
                assert payload["fields"]["assignee"] == {"accountId": "acc-123"}
                
                assert result["assignee"] == "Test User"

    @patch("services.jira_client.get_settings")
    async def test_update_ticket_combined(self, mock_get_settings, configured_settings):
        """Should handle both transition and field updates."""
        mock_get_settings.return_value = configured_settings
        client = JiraClient()
        
        mock_resp_transitions = MagicMock()
        mock_resp_transitions.status_code = 200
        mock_resp_transitions.json.return_value = {
            "transitions": [{"id": "41", "name": "Done"}]
        }
        
        mock_resp_post = MagicMock()
        mock_resp_post.status_code = 204
        
        mock_resp_put = MagicMock()
        mock_resp_put.status_code = 204
        
        mock_resp_get = MagicMock()
        mock_resp_get.status_code = 200
        mock_resp_get.json.return_value = {
            "key": "SUP-123",
            "fields": {"status": {"name": "Done"}}
        }
        
        with patch("httpx.AsyncClient.get", side_effect=[mock_resp_transitions, mock_resp_get]):
            with patch("httpx.AsyncClient.post", return_value=mock_resp_post) as mock_post:
                with patch("httpx.AsyncClient.put", return_value=mock_resp_put) as mock_put:
                    await client.update_ticket(
                        "SUP-123", 
                        status="Done", 
                        assignee_id="acc-123",
                        summary="Finished task"
                    )
                    
                    mock_post.assert_called_once()
                    mock_put.assert_called_once()
                    
                    # Verify PUT payload includes fields but NOT status
                    kwargs = mock_put.call_args[1]
                    fields = kwargs["json"]["fields"]
                    assert "assignee" in fields
                    assert "summary" in fields
                    assert "status" not in fields
