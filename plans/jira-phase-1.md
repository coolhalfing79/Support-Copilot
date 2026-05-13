# Jira Integration — Phase 1: JiraClient Enhancement (Core API Integration)

> **Purpose**: Replace the mock Jira client with a fully functional Jira Cloud API wrapper that handles authentication, issue creation, retrieval, updates, comments, search, and status synchronization.

---

## 1. Phase Overview

This phase focuses on enhancing the existing [`JiraClient`](backend/services/jira_client.py) from a mock-only implementation to a production-ready REST API client. The client must gracefully handle cases where Jira credentials are not configured (falling back to mock mode) while providing full functionality when credentials are present.

### Key Objectives

1. **Credential Validation** — Verify Jira credentials on initialization
2. **Enhanced Issue Creation** — Map all ticket fields to proper Jira issue fields
3. **Issue Retrieval** — Fetch full issue details from Jira
4. **Comment Management** — Add comments to existing issues
5. **Issue Updates** — Update issue fields selectively
6. **JQL Search** — Query existing Jira issues
7. **Metadata Endpoints** — Fetch issue types, custom fields, and priorities
8. **Status Synchronization** — Sync Jira ticket status back to local database

---

## 2. High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                         JiraClient                                   │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌──────────────────┐    ┌──────────────────┐    ┌───────────────┐  │
│  │ Credential       │    │ HTTP Request     │    │ Retry Logic   │  │
│  │ Validator        │───▶│ Builder          │───▶│ (Tenacity)    │  │
│  └──────────────────┘    └──────────────────┘    └───────────────┘  │
│           │                      │                       │          │
│           ▼                      ▼                       ▼          │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │                    Jira REST API v3 Methods                   │  │
│  │  create_ticket │ get_ticket │ add_comment │ update_ticket    │  │
│  │  search_issues │ get_issue_types │ get_custom_fields │ get_priorities │
│  │  sync_status                                   │ map_severity_to_priority │
│  └──────────────────────────────────────────────────────────────┘  │
│                                      │                             │
│                                      ▼                             │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │                    Mock Fallback Layer                        │  │
│  │  Returns fake data when is_configured = False                 │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 3. Methods to Implement

### 3.1 Credential Validation on Init

**Method**: `JiraClient.__init__()` (enhanced)

- On initialization, perform a health check by calling `GET /rest/api/3/myself`
- Set `self.is_configured = True` if credentials are valid, `False` otherwise
- Log a warning if credentials are invalid but do not crash the application
- If `JIRA_API_TOKEN` is empty, immediately set `is_configured = False` and use mock mode

### 3.2 Enhanced `create_ticket()` Method

**Method**: `async def create_ticket(self, ticket: Ticket) -> dict[str, Any]`

- Map all ticket fields to Jira issue fields:
  - `summary` → Jira summary
  - `description` → Jira description (formatted as Atlassian Document Format or plain text with sections)
  - `severity` → Jira priority (via `_map_severity_to_priority()` helper)
  - `product_module` → Jira component (or custom field if mapped)
  - `environment` → Description section
  - `error_messages` → Description section
  - `steps_to_reproduce` → Description section
  - `labels` → `["copilot-escalation", f"session:{session_id}"]`
- Issue type: configurable parameter (default "Bug" for auto-escalations, "Task" for manual creation)
- Return full issue JSON including `key`, `id`, `self`, `status`, and `fields`

### 3.3 Enhanced `get_ticket()` Method

**Method**: `async def get_ticket(self, issue_key_or_id: str) -> dict[str, Any]`

- Fetch full issue from Jira via `GET /rest/api/3/issue/{issueIdOrKey}`
- Include expand parameters for `renderedFields`, `names`, `schema`, `transitions`, `changelog`
- Map Jira fields back to a clean dictionary representation
- Include status, assignee, comments count, and updated_at

### 3.4 `add_comment()` Method

**Method**: `async def add_comment(self, issue_key: str, comment: str) -> dict[str, Any]`

- POST to `/rest/api/3/issue/{issueIdOrKey}/comment`
- Body contains `body` field with the comment text
- Supports plain text (optionally Atlassian Document Format for rich text)
- Returns the created comment object with `id`, `body`, `author`, `created`

### 3.5 `update_ticket()` Method

**Method**: `async def update_ticket(self, issue_key: str, fields: dict[str, Any]) -> dict[str, Any]`

- PUT to `/rest/api/3/issue/{issueIdOrKey}`
- Accept a `fields` dictionary containing only the fields to update
- Supported field updates: status, priority, assignee, labels, components
- Returns the updated issue JSON

### 3.6 `search_issues()` Method

**Method**: `async def search_issues(self, jql: str, max_results: int = 50) -> list[dict[str, Any]]`

- POST to `/rest/api/3/search`
- Accept JQL (Jira Query Language) query string
- Parameters: `jql`, `max_results` (default 50), `fields` (optional field selection)
- Returns list of issues with key, summary, status, priority, and requested fields

### 3.7 `get_issue_types()` Method

**Method**: `async def get_issue_types(self, project_key: str | None = None) -> list[dict[str, Any]]`

- GET `/rest/api/3/issuetype`
- Optionally filter by project using `projects` parameter
- Returns list of available issue types with `id`, `name`, `description`, `iconUrl`

### 3.8 `get_custom_fields()` Method

**Method**: `async def get_custom_fields(self, project_key: str) -> list[dict[str, Any]]`

- GET `/rest/api/3/project/{projectKey}/fields`
- Returns all custom fields defined for the project
- Each field includes `id`, `name`, `key`, `schema`, `description`

### 3.9 `get_priorities()` Method

**Method**: `async def get_priorities(self) -> list[dict[str, Any]]`

- GET `/rest/api/3/priority`
- Returns available priorities with `id`, `name`, `iconUrl`, `level`

### 3.10 `sync_status()` Method

**Method**: `async def sync_status(self, ticket_id: str, db: AsyncSession) -> bool`

- Fetch the ticket from the database using `ticket_id`
- Retrieve the ticket's `jira_issue_key`
- Call `get_ticket()` with the issue key to fetch current Jira status
- Compare Jira status with local ticket status
- Update local ticket status if different
- Return `True` if status was updated, `False` otherwise

---

## 4. Helper Methods

### 4.1 `_map_severity_to_priority()`

- Internal helper to map ticket severity levels to Jira priority names
- Suggested mapping:
  - `critical` → `Highest` or `High`
  - `high` → `High`
  - `medium` → `Medium`
  - `low` → `Low` or `Lowest`

### 4.2 `_format_description()`

- Internal helper to format ticket fields into a Jira-compatible description string
- Should organize sections: Summary, Environment, Error Messages, Steps to Reproduce, Troubleshooting Attempted

### 4.3 `_get_headers()`

- Internal helper to construct HTTP Basic Auth headers
- Encodes `email:api_token` as base64
- Includes `Content-Type: application/json` and `Accept: application/json`

---

## 5. Mock Fallback Behavior

When `is_configured = False` (no valid credentials), all methods should return mock data:

| Method | Mock Return |
|--------|-------------|
| `create_ticket()` | `{"key": "SUP-ABC123", "id": "mock-id", "self": ""}` |
| `get_ticket()` | Predefined mock issue dictionary |
| `add_comment()` | `{"id": "mock-comment-id", "body": comment, "created": "2025-01-01T00:00:00.000+0000"}` |
| `update_ticket()` | Updated mock issue dictionary |
| `search_issues()` | Empty list `[]` |
| `get_issue_types()` | Mock list with Bug, Task, Story |
| `get_custom_fields()` | Empty list `[]` |
| `get_priorities()` | Mock list with High, Medium, Low |
| `sync_status()` | `False` (no change) |

---

## 6. Error Handling

- All public methods should be wrapped with retry logic using `tenacity` (3 attempts, exponential backoff)
- Network errors, HTTP 4xx/5xx responses should be caught and logged
- On failure, methods should either raise a descriptive exception or return `None`/mock data depending on context
- The `is_configured` flag should be checked before making any API calls

---

## 7. Files Modified

| File | Changes |
|------|---------|
| [`backend/services/jira_client.py`](backend/services/jira_client.py) | Major enhancement — new methods, credential validation, helper methods |

---

## 8. Success Criteria

- [ ] JiraClient validates credentials on init and sets `is_configured` correctly
- [ ] All 10 public methods implemented with proper Jira REST API calls
- [ ] Mock fallback works seamlessly when credentials are not configured
- [ ] Severity-to-priority mapping covers all levels
- [ ] Retry logic handles transient failures gracefully
- [ ] Error messages are descriptive and logged appropriately
