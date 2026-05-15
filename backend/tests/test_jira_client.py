"""
Unit tests for JiraClient — mock mode only.

Tests verify:
- Mock responses return valid data structures
- Header construction includes credentials
- Severity-to-priority mapping works correctly
- All new methods return compatible mock data
"""

import pytest
from unittest.mock import MagicMock, patch


# ------------------------------------------------------------------
# Fixtures
# ------------------------------------------------------------------


@pytest.fixture
def mock_settings():
    """Return a mock settings object for Jira."""
    settings = MagicMock()
    settings.JIRA_URL = "https://jira.example.com"
    settings.JIRA_EMAIL = "test@example.com"
    settings.JIRA_API_TOKEN = ""  # Empty = mock mode
    settings.JIRA_PROJECT_KEY = "SUP"
    settings.JIRA_DEFAULT_ISSUE_TYPE = "Bug"
    return settings


@pytest.fixture
def mock_ticket():
    """Return a mock ticket object for testing."""
    ticket = MagicMock()
    ticket.id = "test-uuid-12345"
    ticket.summary = "Payment gateway timeout in production"
    ticket.description = "Users are experiencing timeouts"
    ticket.severity = "high"
    ticket.product_module = "Payments"
    ticket.environment = "Production"
    ticket.error_messages = "TimeoutError: Gateway not responding"
    ticket.steps_to_reproduce = "1. Navigate to checkout\n2. Enter card details\n3. Click pay"
    ticket.session_id = "session-uuid-67890"
    return ticket


# ------------------------------------------------------------------
# Credential Validation Tests
# ------------------------------------------------------------------


class TestValidateCredentials:
    """Tests for validate_credentials() method."""

    @pytest.mark.asyncio
    async def test_validate_credentials_returns_false_when_mock(
        self, mock_settings
    ):
        """Mock mode should return False without making HTTP calls."""
        with patch("services.jira_client.get_settings", return_value=mock_settings):
            from services.jira_client import JiraClient

            client = JiraClient()
            result = await client.validate_credentials()
            assert result is False
            assert client.is_configured is False


# ------------------------------------------------------------------
# Mock Create Ticket Tests
# ------------------------------------------------------------------


class TestCreateTicket:
    """Tests for create_ticket() method in mock mode."""

    @pytest.mark.asyncio
    async def test_mock_create_ticket_returns_valid_key(
        self, mock_settings, mock_ticket
    ):
        """Mock ticket creation should return a SUP-XXXXXX key."""
        with patch("services.jira_client.get_settings", return_value=mock_settings):
            from services.jira_client import JiraClient

            client = JiraClient()
            result = await client.create_ticket(mock_ticket)

            assert "key" in result
            assert result["key"].startswith("SUP-")
            assert len(result["key"]) == 10  # SUP-XXXXXX
            assert "id" in result

    @pytest.mark.asyncio
    async def test_mock_create_ticket_with_issue_type(
        self, mock_settings, mock_ticket
    ):
        """Mock ticket creation should accept issue_type parameter."""
        with patch("services.jira_client.get_settings", return_value=mock_settings):
            from services.jira_client import JiraClient

            client = JiraClient()
            result = await client.create_ticket(mock_ticket, issue_type="Bug")

            assert result.get("issue_type") == "Bug"

    @pytest.mark.asyncio
    async def test_mock_create_ticket_default_issue_type(
        self, mock_settings, mock_ticket
    ):
        """Mock ticket creation should default to Bug issue type."""
        with patch("services.jira_client.get_settings", return_value=mock_settings):
            from services.jira_client import JiraClient

            client = JiraClient()
            result = await client.create_ticket(mock_ticket)

            assert result.get("issue_type") == "Bug"


# ------------------------------------------------------------------
# Mock Get Ticket Tests
# ------------------------------------------------------------------


class TestGetTicket:
    """Tests for get_ticket() method in mock mode."""

    @pytest.mark.asyncio
    async def test_mock_get_ticket_returns_mock_data(self, mock_settings):
        """Mock get_ticket should return a dict with key and status."""
        with patch("services.jira_client.get_settings", return_value=mock_settings):
            from services.jira_client import JiraClient

            client = JiraClient()
            result = await client.get_ticket("SUP-123")

            assert result is not None
            assert result["key"] == "SUP-123"
            assert "status" in result
            assert "assignee" in result
            assert "priority" in result
            assert "comment_count" in result


# ------------------------------------------------------------------
# Mock Add Comment Tests
# ------------------------------------------------------------------


class TestAddComment:
    """Tests for add_comment() method in mock mode."""

    @pytest.mark.asyncio
    async def test_mock_add_comment_returns_mock_data(self, mock_settings):
        """Mock add_comment should return a valid comment object."""
        with patch("services.jira_client.get_settings", return_value=mock_settings):
            from services.jira_client import JiraClient

            client = JiraClient()
            result = await client.add_comment("SUP-123", "This is a test comment")

            assert "id" in result
            assert result["body"] == "This is a test comment"
            assert "author" in result
            assert "created" in result


# ------------------------------------------------------------------
# Mock Update Ticket Tests
# ------------------------------------------------------------------


class TestUpdateTicket:
    """Tests for update_ticket() method in mock mode."""

    @pytest.mark.asyncio
    async def test_mock_update_ticket_returns_mock_data(self, mock_settings):
        """Mock update_ticket should return a valid update response."""
        with patch("services.jira_client.get_settings", return_value=mock_settings):
            from services.jira_client import JiraClient

            client = JiraClient()
            result = await client.update_ticket("SUP-123", status="In Progress")

            assert result["key"] == "SUP-123"
            assert result["status"] == "In Progress"

    @pytest.mark.asyncio
    async def test_mock_update_ticket_with_assignee_id(self, mock_settings):
        """Mock update_ticket should accept assignee_id."""
        with patch("services.jira_client.get_settings", return_value=mock_settings):
            from services.jira_client import JiraClient

            client = JiraClient()
            result = await client.update_ticket("SUP-123", assignee_id="account-id-123")

            assert result["key"] == "SUP-123"

    @pytest.mark.asyncio
    async def test_mock_update_ticket_partial_fields(self, mock_settings):
        """Mock update_ticket should handle partial field updates."""
        with patch("services.jira_client.get_settings", return_value=mock_settings):
            from services.jira_client import JiraClient

            client = JiraClient()
            result = await client.update_ticket("SUP-123", summary="New summary")

            assert result["key"] == "SUP-123"


# ------------------------------------------------------------------
# Mock Transitions Tests
# ------------------------------------------------------------------


class TestTransitions:
    """Tests for transition methods in mock mode."""

    @pytest.mark.asyncio
    async def test_mock_get_transitions(self, mock_settings):
        """Mock get_transitions should return default transitions."""
        with patch("services.jira_client.get_settings", return_value=mock_settings):
            from services.jira_client import JiraClient

            client = JiraClient()
            result = await client.get_transitions("SUP-123")

            assert isinstance(result, list)
            assert len(result) == 3
            assert result[0]["name"] == "To Do"

    @pytest.mark.asyncio
    async def test_mock_perform_transition(self, mock_settings):
        """Mock perform_transition should return True."""
        with patch("services.jira_client.get_settings", return_value=mock_settings):
            from services.jira_client import JiraClient

            client = JiraClient()
            result = await client.perform_transition("SUP-123", "1")

            assert result is True


# ------------------------------------------------------------------
# Mock Search Issues Tests
# ------------------------------------------------------------------


class TestSearchIssues:
    """Tests for search_issues() method in mock mode."""

    @pytest.mark.asyncio
    async def test_mock_search_issues_returns_empty(self, mock_settings):
        """Mock search_issues should return an empty list."""
        with patch("services.jira_client.get_settings", return_value=mock_settings):
            from services.jira_client import JiraClient

            client = JiraClient()
            result = await client.search_issues("project = SUP")

            assert result == []


# ------------------------------------------------------------------
# Mock Get Issue Types Tests
# ------------------------------------------------------------------


class TestGetIssueTypes:
    """Tests for get_issue_types() method in mock mode."""

    @pytest.mark.asyncio
    async def test_mock_get_issue_types_returns_defaults(self, mock_settings):
        """Mock get_issue_types should return default issue types."""
        with patch("services.jira_client.get_settings", return_value=mock_settings):
            from services.jira_client import JiraClient

            client = JiraClient()
            result = await client.get_issue_types()

            assert isinstance(result, list)
            assert len(result) >= 3
            names = [it["name"] for it in result]
            assert "Bug" in names
            assert "Task" in names
            assert "Story" in names

    @pytest.mark.asyncio
    async def test_mock_get_issue_types_with_project_key(self, mock_settings):
        """Mock get_issue_types should work with project_key parameter."""
        with patch("services.jira_client.get_settings", return_value=mock_settings):
            from services.jira_client import JiraClient

            client = JiraClient()
            result = await client.get_issue_types(project_key="SUP")

            assert isinstance(result, list)


# ------------------------------------------------------------------
# Mock Get Custom Fields Tests
# ------------------------------------------------------------------


class TestGetCustomFields:
    """Tests for get_custom_fields() method in mock mode."""

    @pytest.mark.asyncio
    async def test_mock_get_custom_fields_returns_empty(self, mock_settings):
        """Mock get_custom_fields should return an empty list."""
        with patch("services.jira_client.get_settings", return_value=mock_settings):
            from services.jira_client import JiraClient

            client = JiraClient()
            result = await client.get_custom_fields("SUP")

            assert result == []


# ------------------------------------------------------------------
# Mock Get Priorities Tests
# ------------------------------------------------------------------


class TestGetPriorities:
    """Tests for get_priorities() method in mock mode."""

    @pytest.mark.asyncio
    async def test_mock_get_priorities_returns_defaults(self, mock_settings):
        """Mock get_priorities should return default priorities."""
        with patch("services.jira_client.get_settings", return_value=mock_settings):
            from services.jira_client import JiraClient

            client = JiraClient()
            result = await client.get_priorities()

            assert isinstance(result, list)
            assert len(result) >= 5
            names = [p["name"] for p in result]
            assert "Highest" in names
            assert "High" in names
            assert "Medium" in names
            assert "Low" in names
            assert "Lowest" in names


# ------------------------------------------------------------------
# Mock Sync Status Tests
# ------------------------------------------------------------------


class TestSyncStatus:
    """Tests for sync_status() method in mock mode."""

    @pytest.mark.asyncio
    async def test_mock_sync_status_returns_false(self, mock_settings):
        """Mock sync_status should return False."""
        with patch("services.jira_client.get_settings", return_value=mock_settings):
            from services.jira_client import JiraClient

            client = JiraClient()
            result = await client.sync_status("ticket-uuid", MagicMock())

            assert result is False


# ------------------------------------------------------------------
# Header Construction Tests
# ------------------------------------------------------------------


class TestHeaders:
    """Tests for _headers() method."""

    def test_headers_construction_includes_credentials(self, mock_settings):
        """Headers should include Basic Auth with email:api_token."""
        with patch("services.jira_client.get_settings", return_value=mock_settings):
            from services.jira_client import JiraClient

            client = JiraClient()
            headers = client._headers()

            assert "Authorization" in headers
            assert headers["Authorization"].startswith("Basic ")
            assert headers["Content-Type"] == "application/json"
            assert headers["Accept"] == "application/json"


# ------------------------------------------------------------------
# Severity to Priority Mapping Tests
# ------------------------------------------------------------------


class TestMapSeverityToPriority:
    """Tests for _map_severity_to_priority() method."""

    def test_map_severity_to_priority_maps_all_levels(self):
        """All severity levels should map to correct Jira priorities."""
        from services.jira_client import JiraClient

        mapping = {
            "low": "Low",
            "medium": "Medium",
            "high": "High",
            "critical": "Highest",
        }

        for severity, expected_priority in mapping.items():
            result = JiraClient._map_severity_to_priority(severity)
            assert result == {"name": expected_priority}, (
                f"Failed for severity={severity}"
            )

    def test_map_severity_to_priority_default(self):
        """Unknown severity should default to Medium."""
        from services.jira_client import JiraClient

        result = JiraClient._map_severity_to_priority("unknown")
        assert result == {"name": "Medium"}

    def test_map_severity_to_priority_none(self):
        """None severity should default to Medium."""
        from services.jira_client import JiraClient

        result = JiraClient._map_severity_to_priority(None)
        assert result == {"name": "Medium"}

    def test_map_severity_to_priority_with_enum(self):
        """Enum severity should be mapped correctly."""
        from services.jira_client import JiraClient
        from models.enums import TicketSeverity

        result = JiraClient._map_severity_to_priority(TicketSeverity.high)
        assert result == {"name": "High"}


# ------------------------------------------------------------------
# Jira Status to Ticket Status Mapping Tests
# ------------------------------------------------------------------


class TestMapJiraStatusToTicketStatus:
    """Tests for _map_jira_status_to_ticket_status() method."""

    def test_map_jira_status_to_ticket_status_to_do(self):
        """'To Do' should map to 'open'."""
        from services.jira_client import JiraClient

        result = JiraClient._map_jira_status_to_ticket_status("To Do")
        assert result == "open"

    def test_map_jira_status_to_ticket_status_open(self):
        """'Open' should map to 'open'."""
        from services.jira_client import JiraClient

        result = JiraClient._map_jira_status_to_ticket_status("Open")
        assert result == "open"

    def test_map_jira_status_to_ticket_status_in_progress(self):
        """'In Progress' should map to 'in_progress'."""
        from services.jira_client import JiraClient

        result = JiraClient._map_jira_status_to_ticket_status("In Progress")
        assert result == "in_progress"

    def test_map_jira_status_to_ticket_status_in_review(self):
        """'In Review' should map to 'in_progress'."""
        from services.jira_client import JiraClient

        result = JiraClient._map_jira_status_to_ticket_status("In Review")
        assert result == "in_progress"

    def test_map_jira_status_to_ticket_status_done(self):
        """'Done' should map to 'resolved'."""
        from services.jira_client import JiraClient

        result = JiraClient._map_jira_status_to_ticket_status("Done")
        assert result == "resolved"

    def test_map_jira_status_to_ticket_status_resolved(self):
        """'Resolved' should map to 'resolved'."""
        from services.jira_client import JiraClient

        result = JiraClient._map_jira_status_to_ticket_status("Resolved")
        assert result == "resolved"

    def test_map_jira_status_to_ticket_status_closed(self):
        """'Closed' should map to 'closed'."""
        from services.jira_client import JiraClient

        result = JiraClient._map_jira_status_to_ticket_status("Closed")
        assert result == "closed"

    def test_map_jira_status_to_ticket_status_unknown(self):
        """Unknown status should return None."""
        from services.jira_client import JiraClient

        result = JiraClient._map_jira_status_to_ticket_status("Unknown Status")
        assert result is None


# ------------------------------------------------------------------
# Issue Summary Extraction Tests
# ------------------------------------------------------------------


class TestExtractIssueSummary:
    """Tests for _extract_issue_summary() method."""

    def test_extract_issue_summary(self):
        """Should extract key fields from Jira issue response."""
        from services.jira_client import JiraClient

        data = {
            "key": "SUP-123",
            "id": "10001",
            "updated": "2025-01-15T10:30:00.000+0000",
            "fields": {
                "summary": "Test summary",
                "status": {"name": "In Progress"},
            },
        }

        result = JiraClient._extract_issue_summary(data)

        assert result["key"] == "SUP-123"
        assert result["id"] == "10001"
        assert result["summary"] == "Test summary"
        assert result["status"] == "In Progress"
