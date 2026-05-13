# Jira Integration — Phase 4: API Endpoint Updates

> **Purpose**: Add new REST API endpoints to [`backend/api/v1/tickets.py`](backend/api/v1/tickets.py) and update existing ones to support Jira comment management, status synchronization, and issue type discovery.

---

## 1. Phase Overview

This phase introduces new API endpoints and enhances existing ones to expose Jira integration capabilities to the frontend. The endpoints enable comment posting, status synchronization, and issue type listing.

### Key Objectives

1. **Comment Endpoint** — POST comments to Jira-linked tickets
2. **Sync Endpoint** — Sync all tickets' status from Jira
3. **Issue Types Endpoint** — Fetch available Jira issue types
4. **Enhanced Ticket List** — Support optional Jira status refresh

---

## 2. High-Level Architecture

```
┌──────────────────────────────────────────────────────────────────────┐
│                      API Endpoints Layer                              │
├──────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  New Endpoints:                                                      │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │ POST   /api/v1/tickets/{ticket_id}/comment                  │    │
│  │ POST   /api/v1/tickets/sync                                 │    │
│  │ GET    /api/v1/tickets/jira/issue-types                     │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                                                                      │
│  Enhanced Endpoints:                                                 │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │ GET    /api/v1/tickets?refresh=true                         │    │
│  │ GET    /api/v1/tickets/{id} (now includes Jira status)      │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                                                                      │
│  Downstream:                                                         │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │ TicketService (Phase 2) → JiraClient (Phase 1) → Jira API  │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘
```

---

## 3. New Endpoints to Implement

### 3.1 POST `/tickets/{ticket_id}/comment`

**Purpose**: Add a comment to a Jira-linked ticket.

**Request**:
- Path parameter: `ticket_id` (UUID)
- Body: `{ "comment": str, "source": str = "copilot" }`

**Response**:
- `200 OK`: Comment object with `id`, `body`, `author`, `created`, `source`
- `404 Not Found`: Ticket not found or no Jira key
- `500 Internal Server Error`: Jira API failure

**Flow**:
1. Validate ticket exists and has a `jira_issue_key`
2. Call `TicketService.add_comment_to_ticket(ticket_id, comment, source)`
3. Return the Jira comment response

### 3.2 POST `/tickets/sync`

**Purpose**: Synchronize all tickets' status from Jira.

**Request**:
- No body required
- Optional query parameter: `status_filter` (string, optional) — only sync tickets with this status

**Response**:
- `200 OK`: `{ "synced_count": int, "total_count": int, "errors": list[str] }`

**Flow**:
1. Fetch all tickets (optionally filtered by status)
2. For each ticket with a `jira_issue_key`, call `TicketService.sync_ticket_to_jira()`
3. Track successful and failed syncs
4. Return summary with counts and any error messages

**Performance consideration**:
- If there are many tickets, consider processing in batches or adding a `limit` query parameter

### 3.3 GET `/tickets/jira/issue-types`

**Purpose**: Fetch available Jira issue types for admin selection.

**Request**:
- No parameters required
- Optional query parameter: `project_key` (string) — filter issue types by project

**Response**:
- `200 OK`: `{ "issue_types": [{ "id": str, "name": str, "description": str, "iconUrl": str }] }`

**Flow**:
1. Call `JiraClient.get_issue_types(project_key)`
2. Return the list of issue types

**Use case**: Frontend uses this to populate an issue type selector when manually creating tickets.

---

## 4. Enhanced Existing Endpoints

### 4.1 GET `/tickets` — Add Refresh Parameter

**Current behavior**: List tickets with optional `status` and `severity` filters.

**Enhanced behavior**:
- Add optional query parameter: `refresh` (boolean, default `false`)
- When `refresh=true`, call `TicketService.list_tickets_with_jira_status(refresh_from_jira=True)`
- This triggers a status sync for each ticket before returning

**Request**:
- Query parameters: `status?`, `severity?`, `refresh?`

**Response**: Same as before, but with potentially updated status values when `refresh=true`

### 4.2 GET `/tickets/{id}` — Include Jira Status

**Current behavior**: Return single ticket details.

**Enhanced behavior**:
- Response now includes Jira-specific fields: `jira_issue_key`, `jira_issue_id`, `jira_synced`, `assignee`, `jira_comments`
- Optionally include a `jira_status` field derived from the latest sync

---

## 5. New Pydantic Schemas

Update [`backend/schemas/ticket.py`](backend/schemas/ticket.py) with the following new schemas:

### 5.1 `TicketCommentRequest`

```
Request body schema:
- comment: str (required)
- source: str = "copilot" (optional, default "copilot")
```

### 5.2 `TicketCommentResponse`

```
Response body schema:
- id: str (Jira comment ID)
- body: str
- author: str
- created: str (ISO 8601 timestamp)
- source: str
```

### 5.3 `IssueTypeResponse`

```
Response body schema:
- id: str
- name: str
- description: str (optional)
- iconUrl: str (optional)
```

### 5.4 `IssueTypeListResponse`

```
Response body schema:
- issue_types: list[IssueTypeResponse]
```

### 5.5 `TicketSyncResponse`

```
Response body schema:
- synced_count: int
- total_count: int
- errors: list[str]
```

### 5.6 Update Existing Schemas

Add the following optional fields to existing response schemas where applicable:
- `jira_synced: bool = False`
- `assignee: str | None = None`
- `jira_comments: list[dict] | None = None`

---

## 6. Error Handling

| Scenario | HTTP Status | Response |
|----------|-------------|----------|
| Ticket not found | 404 | `{ "error": "Ticket not found" }` |
| Ticket has no Jira key | 400 | `{ "error": "Ticket is not linked to Jira" }` |
| Jira API failure | 500 | `{ "error": "Jira sync failed: <details>" }` |
| Invalid ticket ID format | 400 | `{ "error": "Invalid ticket ID" }` |

---

## 7. Files Modified

| File | Changes |
|------|---------|
| [`backend/api/v1/tickets.py`](backend/api/v1/tickets.py) | Add 3 new endpoints, enhance existing endpoints |
| [`backend/schemas/ticket.py`](backend/schemas/ticket.py) | Add new schemas, update existing schemas |

---

## 8. Success Criteria

- [ ] `POST /tickets/{ticket_id}/comment` creates a comment on the Jira issue
- [ ] `POST /tickets/sync` synchronizes all tickets and returns summary
- [ ] `GET /tickets/jira/issue-types` returns available issue types
- [ ] `GET /tickets?refresh=true` triggers status sync before returning
- [ ] All new endpoints have proper error handling
- [ ] Pydantic schemas validate request/response data correctly
