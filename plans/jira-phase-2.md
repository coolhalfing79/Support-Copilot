# Jira Integration — Phase 2: TicketService Enhancements

> **Purpose**: Enhance the existing [`TicketService`](backend/services/ticket_service.py) to fully leverage the enhanced JiraClient, adding synchronization, comment management, and status refresh capabilities.

---

## 1. Phase Overview

This phase builds on Phase 1 by enhancing the business logic layer. The TicketService orchestrates ticket creation, synchronization, and comment operations between the local database and Jira Cloud. It must handle Jira failures gracefully — if Jira is unavailable, the local ticket should still be created and marked for later sync.

### Key Objectives

1. **Enhanced Ticket Creation** — Pass all ticket fields to Jira during creation
2. **Status Synchronization** — Sync local ticket status from Jira
3. **Comment Management** — Post comments from copilot to Jira issues
4. **List with Jira Status** — Fetch tickets with optional Jira status refresh

---

## 2. High-Level Architecture

```
┌──────────────────────────────────────────────────────────────────────┐
│                        TicketService                                  │
├──────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌─────────────────────┐    ┌─────────────────────┐                  │
│  │ create_ticket_from_ │    │ list_tickets_with_  │                  │
│  │ chat()              │    │ jira_status()       │                  │
│  └─────────┬───────────┘    └─────────┬───────────┘                  │
│            │                          │                               │
│            ▼                          ▼                               │
│  ┌─────────────────────────────────────────────────────────────┐     │
│  │                    JiraClient (Phase 1)                      │     │
│  │  create_ticket │ sync_status │ add_comment                  │     │
│  └─────────────────────────────────────────────────────────────┘     │
│            │                          │                               │
│            ▼                          ▼                               │
│  ┌──────────────────┐    ┌──────────────────────────┐               │
│  │ PostgreSQL       │    │ Jira Cloud API           │               │
│  │ (tickets table)  │    │ (real-time sync)         │               │
│  └──────────────────┘    └──────────────────────────┘               │
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘
```

---

## 3. Methods to Implement

### 3.1 Enhanced `create_ticket_from_chat()`

**Current behavior**: Extracts ticket fields via LLM, creates local ticket, attempts Jira sync (mock only)

**Enhanced behavior**:
- Pass all extracted ticket fields to JiraClient during creation:
  - `summary`, `description`, `severity`, `product_module`, `environment`
  - `error_messages`, `steps_to_reproduce`, `troubleshooting_attempted`
- Use "Bug" as the default issue type for automatic escalations from chat
- Allow configurable issue type for manual ticket creation
- Store the full Jira response (including `key`, `id`, `self`, `status`) in the ticket's `doc_references` JSONB field
- If Jira sync fails (network error, API error), log the error and keep the local ticket with `jira_synced = False` (if this field exists)
- Return the complete Ticket object including the Jira issue key

**Flow**:
1. Receive session_id and conversation context
2. Use LLM to extract structured ticket fields (existing behavior)
3. Create local Ticket ORM record with extracted fields
4. Call `JiraClient.create_ticket(ticket, issue_type="Bug")`
5. On success: update local ticket with `jira_issue_key`, `jira_issue_id`, set `jira_synced = True`
6. On failure: log error, keep local ticket, set `jira_synced = False`
7. Return the Ticket object

### 3.2 `sync_ticket_to_jira()` Method

**Method**: `async def sync_ticket_to_jira(self, db: AsyncSession, ticket_id: UUID) -> Ticket`

- Fetch the ticket from the database by `ticket_id`
- Validate that the ticket has a `jira_issue_key` (skip if None)
- Call `JiraClient.sync_status(ticket_id, db)` to fetch current status from Jira
- Refresh the ticket record from the database session
- Return the updated Ticket object

**Error handling**:
- If ticket has no Jira key, return the ticket unchanged
- If Jira sync fails, log the error and return the ticket with its current status
- If ticket not found, raise appropriate exception

### 3.3 `add_comment_to_ticket()` Method

**Method**: `async def add_comment_to_ticket(self, db: AsyncSession, ticket_id: UUID, comment: str, source: str = "copilot") -> dict[str, Any] | None`

- Fetch the ticket from the database by `ticket_id`
- Validate that the ticket has a `jira_issue_key`
- Call `JiraClient.add_comment(ticket.jira_issue_key, comment)`
- Store the comment metadata in `jira_comments` JSONB field (if this field exists on the model)
- Return the created comment object from Jira

**Comment metadata structure** (stored in `jira_comments` JSONB):
```json
[
  {
    "id": "10001",
    "body": "Comment text",
    "author": "agent@example.com",
    "created": "2025-01-15T10:30:00.000+0000",
    "source": "copilot"
  }
]
```

**Error handling**:
- If ticket has no Jira key, return `None`
- If Jira API call fails, log the error and return `None`

### 3.4 `list_tickets_with_jira_status()` Method

**Method**: `async def list_tickets_with_jira_status(self, db: AsyncSession, status: str | None = None, severity: str | None = None, refresh_from_jira: bool = False) -> list[Ticket]`

- Apply optional filters: `status`, `severity`
- If `refresh_from_jira = True`, iterate through each ticket and call `sync_ticket_to_jira()` to update its status from Jira
- Return the filtered list of Ticket objects

**Performance consideration**:
- When `refresh_from_jira = True` and there are many tickets, consider batching or limiting the number of Jira API calls
- Optionally add a maximum limit (e.g., 50 tickets per refresh)

---

## 4. Integration with Existing Code

### 4.1 Changes to Existing `create_ticket_from_chat()`

The existing method should be modified to:
- Accept an optional `issue_type` parameter (default "Bug" for auto-escalation)
- Pass additional fields to JiraClient: `product_module`, `environment`, `error_messages`, `steps_to_reproduce`
- Handle the enhanced Jira response
- Store full Jira response in `doc_references`

### 4.2 Service Factory Updates

The [`service_factory.py`](backend/services/service_factory.py) may need no changes if the TicketService already receives the JiraClient as a dependency. Verify that the factory wires the enhanced JiraClient correctly.

---

## 5. Error Handling Strategy

| Scenario | Behavior |
|----------|----------|
| Jira API unavailable during ticket creation | Create local ticket, set `jira_synced = False`, log error |
| Jira API unavailable during sync | Log error, return ticket with current status |
| Ticket has no Jira key | Skip operation, return unchanged |
| Invalid Jira issue key | Log error, return unchanged ticket |
| Network timeout | Retry with backoff (handled by JiraClient), then fail gracefully |

---

## 6. Files Modified

| File | Changes |
|------|---------|
| [`backend/services/ticket_service.py`](backend/services/ticket_service.py) | Enhance existing methods, add 3 new methods |

---

## 7. Success Criteria

- [ ] `create_ticket_from_chat()` passes all fields to Jira and handles sync failures gracefully
- [ ] `sync_ticket_to_jira()` correctly updates local status from Jira
- [ ] `add_comment_to_ticket()` posts comments to Jira and stores metadata locally
- [ ] `list_tickets_with_jira_status()` supports optional refresh and filtering
- [ ] All methods handle missing Jira keys without errors
- [ ] Local tickets are preserved even when Jira sync fails
