"""
Jira Cloud API client with mock fallback for demo reliability.

When JIRA_API_TOKEN is empty the client transparently returns fake issue keys
so the rest of the pipeline never breaks during a demo.

Phase 1 Enhancements:
- Credential validation on init (health check)
- Enhanced create_ticket() with full field mapping
- Enhanced get_ticket() with full issue details
- New methods: add_comment, update_ticket, search_issues, get_issue_types,
  get_custom_fields, get_priorities, sync_status
- Retry logic with tenacity on all HTTP methods
"""

from __future__ import annotations

import base64
import logging
import uuid
from datetime import datetime, timezone
from typing import Any

import httpx
from tenacity import (
    retry,
    retry_if_exception_type,
    stop_after_attempt,
    wait_exponential,
)

from config.settings import get_settings

logger = logging.getLogger(__name__)


class JiraClient:
    """Async wrapper around Jira Cloud REST API v3."""

    def __init__(self) -> None:
        settings = get_settings()
        self.base_url = (settings.JIRA_URL or "https://jira.example.com").rstrip("/")
        self.email = settings.JIRA_EMAIL
        self.api_token = settings.JIRA_API_TOKEN
        self.project_key = settings.JIRA_PROJECT_KEY
        self.default_issue_type = settings.JIRA_DEFAULT_ISSUE_TYPE
        # Fall back to mock when credentials are missing.
        self.use_mock = not self.api_token
        self.is_configured = not self.use_mock
        logger.info(f"[JiraClient] Initialized: use_mock={self.use_mock}, is_configured={self.is_configured}, base_url={self.base_url}, project_key={self.project_key}")

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    async def validate_credentials(self) -> bool:
        """Validate Jira credentials by calling GET /rest/api/3/myself.

        Returns True if credentials are valid, False otherwise.
        Sets self.is_configured based on validation result.
        """
        if self.use_mock:
            self.is_configured = False
            return False

        try:
            url = f"{self.base_url}/rest/api/3/myself"
            async with httpx.AsyncClient(timeout=10.0) as client:
                response = await client.get(url, headers=self._headers())
                if response.status_code == 200:
                    self.is_configured = True
                    logger.info("Jira credentials validated successfully")
                    return True
                self.is_configured = False
                logger.warning(
                    f"Jira credential validation failed: HTTP {response.status_code}"
                )
                return False
        except httpx.HTTPError as exc:
            self.is_configured = False
            logger.warning(f"Jira credential validation error: {exc}")
            return False

    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=2, min=2, max=10),
        retry=retry_if_exception_type((httpx.HTTPError, httpx.ConnectError)),
        reraise=True,
    )
    async def create_ticket(
        self, ticket: Any, issue_type: str | None = None
    ) -> dict[str, Any]:
        """Create a Jira issue from a Ticket ORM instance.

        Returns dict with at least ``key`` and ``id`` fields.
        """
        issue_type = issue_type or self.default_issue_type
        logger.info(f"[JiraClient.create_ticket] use_mock={self.use_mock}, issue_type={issue_type}, summary={getattr(ticket, 'summary', 'N/A')[:50]}")
        if self.use_mock:
            logger.info("[JiraClient.create_ticket] Using MOCK mode - returning fake key")
            return self._mock_create_ticket(ticket, issue_type)

        # Build description sections from ticket fields
        description_parts: list[dict[str, Any]] = []

        # Main description
        description = getattr(ticket, "description", None)
        if description:
            description_parts.append(
                {
                    "type": "paragraph",
                    "content": [{"type": "text", "text": str(description)}],
                }
            )

        # Product Module
        product_module = getattr(ticket, "product_module", None)
        if product_module:
            description_parts.append(
                {
                    "type": "paragraph",
                    "content": [
                        {
                            "type": "text",
                            "text": f"\nProduct Module: {product_module}",
                        }
                    ],
                }
            )

        # Environment
        environment = getattr(ticket, "environment", None)
        if environment:
            description_parts.append(
                {
                    "type": "paragraph",
                    "content": [
                        {"type": "text", "text": f"\nEnvironment: {environment}"}
                    ],
                }
            )

        # Error Messages
        error_messages = getattr(ticket, "error_messages", None)
        if error_messages:
            description_parts.append(
                {
                    "type": "paragraph",
                    "content": [
                        {
                            "type": "text",
                            "text": f"\nError Messages:\n{error_messages}",
                        }
                    ],
                }
            )

        # Steps to Reproduce
        steps = getattr(ticket, "steps_to_reproduce", None)
        if steps:
            description_parts.append(
                {
                    "type": "paragraph",
                    "content": [
                        {"type": "text", "text": f"\nSteps to Reproduce:\n{steps}"}
                    ],
                }
            )

        url = f"{self.base_url}/rest/api/3/issue"
        headers = self._headers()

        # Build labels
        labels = ["copilot-escalation"]
        session_id = getattr(ticket, "session_id", None)
        if session_id:
            labels.append(f"session:{session_id}")

        payload = {
            "fields": {
                "project": {"key": self.project_key},
                "summary": (
                    getattr(ticket, "summary", "Support escalation") or "Support escalation"
                )[:255],
                "description": {
                    "type": "doc",
                    "version": 1,
                    "content": description_parts if description_parts else [
                        {
                            "type": "paragraph",
                            "content": [
                                {
                                    "type": "text",
                                    "text": str(getattr(ticket, "description", None) or "No description provided"),
                                }
                            ],
                        }
                    ],
                },
                "issuetype": (
                    {"id": issue_type}
                    if issue_type and issue_type.isdigit()
                    else {"name": issue_type}
                ),
                "priority": self._map_severity_to_priority(
                    getattr(ticket, "severity", None)
                ),
                "labels": labels,
            }
        }

        logger.debug(f"[JiraClient.create_ticket] Payload: {payload}")

        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(url, json=payload, headers=headers)
            if response.status_code >= 400:
                logger.error(
                    f"[JiraClient.create_ticket] Failed: {response.status_code} - {response.text} "
                    f"| Project: {self.project_key} | IssueType: {issue_type}"
                )
            response.raise_for_status()
            data = response.json()
            return {
                "key": data.get("key"),
                "id": data.get("id"),
                "self": data.get("self"),
            }

    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=2, min=2, max=10),
        retry=retry_if_exception_type((httpx.HTTPError, httpx.ConnectError)),
        reraise=True,
    )
    async def get_ticket(self, issue_key: str) -> dict[str, Any] | None:
        """Fetch a Jira issue by its key (e.g. SUP-123)."""
        if self.use_mock:
            return {
                "key": issue_key,
                "status": "Open",
                "assignee": None,
                "priority": None,
                "comments": [],
                "comment_count": 0,
                "updated_at": None,
            }

        url = f"{self.base_url}/rest/api/3/issue/{issue_key}"
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.get(url, headers=self._headers())
            if response.status_code == 404:
                return None
            response.raise_for_status()
            data = response.json()

            # Extract key fields
            fields = data.get("fields", {})
            return {
                "key": data.get("key"),
                "id": data.get("id"),
                "status": fields.get("status", {}).get("name", "Unknown"),
                "assignee": (
                    fields.get("assignee", {}).get("displayName")
                    if fields.get("assignee")
                    else None
                ),
                "priority": (
                    fields.get("priority", {}).get("name")
                    if fields.get("priority")
                    else None
                ),
                "updated_at": data.get("updated"),
                "comment_count": fields.get("comment", {}).get("total", 0),
            }

    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=2, min=2, max=10),
        retry=retry_if_exception_type((httpx.HTTPError, httpx.ConnectError)),
        reraise=True,
    )
    async def add_comment(self, issue_key: str, comment: str) -> dict[str, Any]:
        """Add a comment to a Jira issue.

        Args:
            issue_key: Jira issue key (e.g., SUP-123)
            comment: Comment text (supports plain text)

        Returns:
            Created comment object with id, body, author, created
        """
        if self.use_mock:
            return {
                "id": str(uuid.uuid4()),
                "body": comment,
                "author": "mock-user",
                "created": datetime.now(timezone.utc).isoformat(),
            }

        url = f"{self.base_url}/rest/api/3/issue/{issue_key}/comment"
        headers = self._headers()

        payload = {
            "body": comment,
            "visibility": {"type": "role", "value": "Users"},  # Visible to all
        }

        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(url, json=payload, headers=headers)
            response.raise_for_status()
            data = response.json()
            return {
                "id": data.get("id"),
                "body": data.get("body"),
                "author": data.get("author", {}).get("displayName"),
                "created": data.get("created"),
            }

    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=2, min=2, max=10),
        retry=retry_if_exception_type((httpx.HTTPError, httpx.ConnectError)),
        reraise=True,
    )
    async def get_transitions(self, issue_key: str) -> list[dict[str, Any]]:
        """Fetch available transitions for a Jira issue."""
        if self.use_mock:
            return [
                {"id": "1", "name": "To Do"},
                {"id": "2", "name": "In Progress"},
                {"id": "3", "name": "Done"},
            ]

        url = f"{self.base_url}/rest/api/3/issue/{issue_key}/transitions"
        async with httpx.AsyncClient(timeout=15.0) as client:
            response = await client.get(url, headers=self._headers())
            response.raise_for_status()
            data = response.json()
            return data.get("transitions", [])

    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=2, min=2, max=10),
        retry=retry_if_exception_type((httpx.HTTPError, httpx.ConnectError)),
        reraise=True,
    )
    async def perform_transition(
        self,
        issue_key: str,
        transition_id: str,
        fields: dict[str, Any] | None = None,
    ) -> bool:
        """Perform a transition on a Jira issue."""
        if self.use_mock:
            return True

        url = f"{self.base_url}/rest/api/3/issue/{issue_key}/transitions"
        payload = {"transition": {"id": transition_id}}
        if fields:
            payload["fields"] = fields

        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(url, json=payload, headers=self._headers())
            response.raise_for_status()
            return True

    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=2, min=2, max=10),
        retry=retry_if_exception_type((httpx.HTTPError, httpx.ConnectError)),
        reraise=True,
    )
    async def update_ticket(
        self,
        issue_key: str,
        status: str | None = None,
        priority: str | None = None,
        assignee_id: str | None = None,
        summary: str | None = None,
    ) -> dict[str, Any]:
        """Update a Jira issue.

        Note: Status updates are performed via the transitions API.
        Assignee updates require an accountId.

        Args:
            issue_key: Jira issue key
            status: New status name (e.g., "In Progress", "Done")
            priority: New priority name (e.g., "High", "Medium")
            assignee_id: Assignee Jira accountId
            summary: New summary

        Returns:
            Updated issue fields (refetched after update)
        """
        if self.use_mock:
            return {"key": issue_key, "status": status or "Open"}

        # 1. Handle Status Transition
        if status:
            transitions = await self.get_transitions(issue_key)
            transition_id = next(
                (t["id"] for t in transitions if t["name"].lower() == status.lower()),
                None
            )
            if transition_id:
                await self.perform_transition(issue_key, transition_id)
            else:
                logger.warning(f"Transition '{status}' not found for issue {issue_key}")

        # 2. Handle Field Updates (PUT)
        fields: dict[str, Any] = {}
        if priority:
            fields["priority"] = {"name": priority}
        if assignee_id:
            fields["assignee"] = {"accountId": assignee_id}
        if summary:
            fields["summary"] = summary[:255]

        if fields:
            url = f"{self.base_url}/rest/api/3/issue/{issue_key}"
            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.put(url, json={"fields": fields}, headers=self._headers())
                response.raise_for_status()

        # 3. Refetch and return current state
        updated_data = await self.get_ticket(issue_key)
        return updated_data or {"key": issue_key}

    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=2, min=2, max=10),
        retry=retry_if_exception_type((httpx.HTTPError, httpx.ConnectError)),
        reraise=True,
    )
    async def search_issues(
        self,
        jql: str,
        max_results: int = 50,
        fields: list[str] | None = None,
    ) -> list[dict[str, Any]]:
        """Search Jira issues using JQL.

        Args:
            jql: JQL query string (e.g., "project = SUP AND status = Open")
            max_results: Maximum results to return (default 50)
            fields: Specific fields to return (None = all)

        Returns:
            List of issue dicts with key, summary, status, priority
        """
        if self.use_mock:
            return []

        url = f"{self.base_url}/rest/api/3/search"
        headers = self._headers()
        headers["Accept"] = "application/json"

        payload = {
            "jql": jql,
            "maxResults": max_results,
            "fields": fields
            or [
                "summary",
                "status",
                "priority",
                "assignee",
                "created",
            ],
        }

        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(url, json=payload, headers=headers)
            response.raise_for_status()
            data = response.json()

            results = []
            for issue in data.get("issues", []):
                fields_data = issue.get("fields", {})
                results.append(
                    {
                        "key": issue.get("key"),
                        "id": issue.get("id"),
                        "summary": fields_data.get("summary", ""),
                        "status": fields_data.get("status", {}).get("name"),
                        "priority": (
                            fields_data.get("priority", {}).get("name")
                            if fields_data.get("priority")
                            else None
                        ),
                        "assignee": (
                            fields_data.get("assignee", {}).get("displayName")
                            if fields_data.get("assignee")
                            else None
                        ),
                        "created": fields_data.get("created"),
                    }
                )
            return results

    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=2, min=2, max=10),
        retry=retry_if_exception_type((httpx.HTTPError, httpx.ConnectError)),
        reraise=True,
    )
    async def get_issue_types(
        self, project_key: str | None = None
    ) -> list[dict[str, Any]]:
        """Get available issue types.

        Args:
            project_key: Optional project key to filter issue types

        Returns:
            List of issue types with id, name, iconUrl
        """
        if self.use_mock:
            return [
                {"id": "10000", "name": "Bug", "subtask": False},
                {"id": "10001", "name": "Task", "subtask": False},
                {"id": "10002", "name": "Story", "subtask": False},
            ]

        url = f"{self.base_url}/rest/api/3/issuetype"
        params = {}
        if project_key:
            params["projectKey"] = project_key

        async with httpx.AsyncClient(timeout=15.0) as client:
            response = await client.get(
                url, headers=self._headers(), params=params
            )
            response.raise_for_status()
            data = response.json()

            return [
                {
                    "id": it.get("id"),
                    "name": it.get("name"),
                    "subtask": it.get("subtask", False),
                    "iconUrl": it.get("iconUrl"),
                }
                for it in data
                if not it.get("subtask")  # Exclude subtasks by default
            ]

    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=2, min=2, max=10),
        retry=retry_if_exception_type((httpx.HTTPError, httpx.ConnectError)),
        reraise=True,
    )
    async def get_custom_fields(self, project_key: str) -> list[dict[str, Any]]:
        """Get custom fields for a project.

        Args:
            project_key: Jira project key (e.g., SUP)

        Returns:
            List of custom fields with id, name, key
        """
        if self.use_mock:
            return []

        url = f"{self.base_url}/rest/api/3/project/{project_key}/fields"

        async with httpx.AsyncClient(timeout=15.0) as client:
            response = await client.get(url, headers=self._headers())
            response.raise_for_status()
            data = response.json()

            return [
                {
                    "id": field.get("id"),
                    "name": field.get("name"),
                    "key": field.get("schema", {}).get("key"),
                }
                for field in data
                if field.get("schema", {}).get("custom")  # Only custom fields
            ]

    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=2, min=2, max=10),
        retry=retry_if_exception_type((httpx.HTTPError, httpx.ConnectError)),
        reraise=True,
    )
    async def get_priorities(self) -> list[dict[str, Any]]:
        """Get available priorities.

        Returns:
            List of priorities with id, name, iconUrl
        """
        if self.use_mock:
            return [
                {"id": "10000", "name": "Highest", "iconUrl": ""},
                {"id": "10001", "name": "High", "iconUrl": ""},
                {"id": "10002", "name": "Medium", "iconUrl": ""},
                {"id": "10003", "name": "Low", "iconUrl": ""},
                {"id": "10004", "name": "Lowest", "iconUrl": ""},
            ]

        url = f"{self.base_url}/rest/api/3/priority"

        async with httpx.AsyncClient(timeout=15.0) as client:
            response = await client.get(url, headers=self._headers())
            response.raise_for_status()
            data = response.json()

            return [
                {
                    "id": p.get("id"),
                    "name": p.get("name"),
                    "iconUrl": p.get("iconUrl"),
                }
                for p in data
            ]

    async def sync_status(
        self, ticket_id: str, db: Any
    ) -> bool:
        """Sync ticket status from Jira to local database.

        Args:
            ticket_id: Local ticket UUID
            db: Database session (AsyncSession)

        Returns:
            True if status was updated, False otherwise
        """
        if self.use_mock:
            return False

        # Import here to avoid circular imports
        from sqlalchemy import select
        from models.ticket import Ticket

        stmt = select(Ticket).where(Ticket.id == ticket_id)
        result = await db.execute(stmt)
        ticket = result.scalar_one_or_none()

        if not ticket or not ticket.jira_issue_key:
            logger.warning(
                f"Ticket {ticket_id} not found or has no Jira key"
            )
            return False

        jira_data = await self.get_ticket(ticket.jira_issue_key)
        if not jira_data:
            logger.warning(
                f"Could not fetch Jira issue {ticket.jira_issue_key}"
            )
            return False

        # Map Jira status to our TicketStatus enum
        jira_status = jira_data.get("status", "")
        new_status = self._map_jira_status_to_ticket_status(jira_status)

        if new_status and new_status != ticket.status:
            ticket.status = new_status
            await db.commit()
            logger.info(
                f"Updated ticket {ticket_id} status from {ticket.status} to {new_status}"
            )
            return True

        return False

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    def _headers(self) -> dict[str, str]:
        credentials = f"{self.email}:{self.api_token}"
        b64 = base64.b64encode(credentials.encode()).decode()
        return {
            "Accept": "application/json",
            "Content-Type": "application/json",
            "Authorization": f"Basic {b64}",
        }

    @staticmethod
    def _map_severity_to_priority(severity: Any) -> dict[str, str]:
        """Map our severity enum/string to a Jira v3 priority object."""
        raw = (
            severity.value
            if hasattr(severity, "value")
            else str(severity or "medium")
        )
        mapping = {
            "low": "Low",
            "medium": "Medium",
            "high": "High",
            "critical": "Highest",
        }
        return {"name": mapping.get(raw, "Medium")}

    @staticmethod
    def _map_jira_status_to_ticket_status(jira_status: str) -> str | None:
        """Map Jira status name to our TicketStatus enum value."""
        from models.enums import TicketStatus

        mapping = {
            "To Do": TicketStatus.open.value,
            "Open": TicketStatus.open.value,
            "In Progress": TicketStatus.in_progress.value,
            "In Review": TicketStatus.in_progress.value,
            "Done": TicketStatus.resolved.value,
            "Resolved": TicketStatus.resolved.value,
            "Closed": TicketStatus.closed.value,
        }
        return mapping.get(jira_status)

    @staticmethod
    def _extract_issue_summary(data: dict[str, Any]) -> dict[str, Any]:
        """Extract key fields from a Jira issue response."""
        fields = data.get("fields", {})
        return {
            "key": data.get("key"),
            "id": data.get("id"),
            "status": fields.get("status", {}).get("name"),
            "summary": fields.get("summary"),
            "updated": data.get("updated"),
        }

    def _mock_create_ticket(
        self, ticket: Any, issue_type: str = "Bug"
    ) -> dict[str, Any]:
        """Return a fake Jira response for demo purposes."""
        mock_key = f"SUP-{uuid.uuid4().hex[:6].upper()}"
        return {
            "key": mock_key,
            "id": str(getattr(ticket, "id", uuid.uuid4())),
            "self": f"{self.base_url}/browse/{mock_key}",
            "issue_type": issue_type,
        }
