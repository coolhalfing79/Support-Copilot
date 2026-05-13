# Jira Integration — Phase 3: Database Schema Updates

> **Purpose**: Extend the [`Ticket`](backend/models/ticket.py) model with optional fields to support Jira comment tracking, assignment, and sync status.

---

## 1. Phase Overview

This phase adds optional columns to the existing PostgreSQL `tickets` table to support the enhanced Jira integration features introduced in Phases 1 and 2. These fields enable tracking of Jira comments, ticket assignment, and synchronization status.

### Key Objectives

1. **Jira Comments Tracking** — Store metadata about comments posted to/from Jira
2. **Assignee Tracking** — Store the Jira assignee username
3. **Sync Status Flag** — Track whether a ticket was successfully synced to Jira

---

## 2. High-Level Architecture

```
┌──────────────────────────────────────────────────────────────────────┐
│                        tickets Table                                 │
├──────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  Existing Fields:                                                    │
│  ┌──────────────────┬──────────────┬────────────┬─────────────────┐  │
│  │ id (UUID)        │ session_id   │ summary    │ description     │  │
│  │ jira_issue_key   │ jira_issue_id│ severity   │ status          │  │
│  │ product_module   │ environment  │ error_messages (JSONB)       │  │
│  │ steps_to_reproduce│ troubleshooting_attempted│ conversation_summary│  │
│  │ doc_references (JSONB) │ created_at │ updated_at                │  │
│  └──────────────────┴──────────────┴────────────┴─────────────────┘  │
│                                                                      │
│  New Optional Fields (Phase 3):                                      │
│  ┌──────────────────┬──────────────┬────────────┬─────────────────┐  │
│  │ jira_comments    │ assignee     │ jira_synced│                   │  │
│  │ (JSONB)          │ (String 100) │ (Boolean)  │                   │  │
│  └──────────────────┴──────────────┴────────────┴─────────────────┘  │
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘
```

---

## 3. New Fields to Add

### 3.1 `jira_comments` — JSONB Field

**Type**: `Mapped[list[dict[str, Any]] | None]`
**Column**: `JSONB`, nullable

**Purpose**: Store metadata about comments exchanged between the copilot and Jira.

**Structure**:
```json
[
  {
    "id": "10001",
    "body": "Comment text from Jira or copilot",
    "author": "agent@example.com",
    "created": "2025-01-15T10:30:00.000+0000",
    "source": "copilot"
  }
]
```

**Source values**:
- `"copilot"` — Comment originated from the copilot (posted to Jira)
- `"jira"` — Comment originated from Jira (fetched during sync)

### 3.2 `assignee` — String Field

**Type**: `Mapped[str | None]`
**Column**: `String(100)`, nullable

**Purpose**: Store the username of the Jira assignee for this ticket.

**Example values**:
- `"john.doe"` — Jira username of the assignee
- `None` — Unassigned

### 3.3 `jira_synced` — Boolean Field

**Type**: `Mapped[bool]`
**Column**: `Boolean`, nullable, default `False`

**Purpose**: Track whether the ticket was successfully synced to Jira.

**Behavior**:
- Set to `True` when `JiraClient.create_ticket()` succeeds
- Set to `False` when Jira sync fails or is not attempted
- Admins can filter by this field to find tickets needing manual sync

---

## 4. Database Migration Approach

### 4.1 Using SQLAlchemy Migrations

Since this project uses SQLAlchemy ORM with async PostgreSQL, the migration can be done in one of two ways:

**Option A: Alembic Migration (Recommended)**
1. Generate a new Alembic migration: `alembic revision --autogenerate -m "Add Jira integration fields to tickets"`
2. Review the generated migration script for correctness
3. Apply the migration: `alembic upgrade head`

**Option B: Direct SQL Migration**
1. Create a migration script that runs:
   ```sql
   ALTER TABLE tickets ADD COLUMN IF NOT EXISTS jira_comments JSONB;
   ALTER TABLE tickets ADD COLUMN IF NOT EXISTS assignee VARCHAR(100);
   ALTER TABLE tickets ADD COLUMN IF NOT EXISTS jira_synced BOOLEAN DEFAULT FALSE;
   ```
2. Run the script against the PostgreSQL database

**Option C: Auto-create via SQLAlchemy**
- If the project uses `Base.metadata.create_all()` for table creation, the new columns will be added when the script runs
- Note: This only works for new tables; existing tables need explicit ALTER statements

### 4.2 Migration Script Location

Place the migration script in:
- [`backend/migrate_db.py`](backend/migrate_db.py) — if using a custom migration script
- `alembic/versions/` — if using Alembic

---

## 5. Model Updates

### 5.1 SQLAlchemy Model Changes

In [`backend/models/ticket.py`](backend/models/ticket.py), add the following to the `Ticket` model class:

```
# Add three new mapped_column definitions:
# 1. jira_comments — JSONB column for storing comment metadata
# 2. assignee — String column for Jira assignee username
# 3. jira_synced — Boolean column with default False
```

### 5.2 Pydantic Schema Updates

Update the Pydantic schemas in [`backend/schemas/ticket.py`](backend/schemas/ticket.py):
- Add `jira_comments`, `assignee`, and `jira_synced` to relevant response schemas
- Ensure these fields are optional (nullable) in request schemas

---

## 6. Backward Compatibility

- All new fields are **nullable** — existing records will have `NULL` values
- The `jira_synced` field has a default of `False` — existing records should be updated explicitly or left as NULL (treated as not synced)
- No existing fields are modified or removed
- API responses will include new fields with `null` values for old tickets

---

## 7. Files Modified

| File | Changes |
|------|---------|
| [`backend/models/ticket.py`](backend/models/ticket.py) | Add 3 new columns to Ticket model |
| [`backend/schemas/ticket.py`](backend/schemas/ticket.py) | Add new fields to Pydantic schemas |
| [`backend/migrate_db.py`](backend/migrate_db.py) | Add migration for new columns (or create new migration file) |

---

## 8. Success Criteria

- [ ] All three new columns are added to the `tickets` table
- [ ] Existing records are not affected (NULL/default values)
- [ ] Pydantic schemas include the new fields
- [ ] Migration script is idempotent (can be run multiple times safely)
- [ ] Database schema reflects the changes after migration
