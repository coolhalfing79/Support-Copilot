# Jira Integration — Phase 5: Frontend Updates

> **Purpose**: Enhance the frontend to display Jira integration information, including clickable Jira links, status badges, comment threads, and issue type selectors.

---

## 1. Phase Overview

This phase updates the React frontend to surface Jira integration data to users and administrators. The changes improve visibility into ticket status, enable direct navigation to Jira issues, and provide a comment interface for Jira-linked tickets.

### Key Objectives

1. **Clickable Jira Links** — Display Jira issue keys as links to the Jira browse page
2. **Jira Status Badges** — Show visual indicators for Jira ticket status
3. **Comment Thread UI** — Display and post comments for Jira-linked tickets
4. **Issue Type Selector** — Allow admins to choose issue type when creating tickets

---

## 2. High-Level Architecture

```
┌──────────────────────────────────────────────────────────────────────┐
│                        Frontend (React)                               │
├──────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  Pages/Components:                                                   │
│  ┌──────────────────────┐  ┌──────────────────────┐                 │
│  │ TicketsLandingPage   │  │ TicketDetail         │                 │
│  │ (list view)          │  │ (detail view)        │                 │
│  └──────────┬───────────┘  └──────────┬───────────┘                 │
│             │                         │                              │
│             ▼                         ▼                              │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │ adminStore.ts                                                │    │
│  │ - tickets[] with Jira fields                                 │    │
│  │ - issueTypes[]                                               │    │
│  │ - actions: loadTickets(), syncTickets(), loadIssueTypes()   │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                                      │                              │
│                                      ▼                              │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │ API Calls to Backend                                         │    │
│  │ GET  /tickets?refresh=true                                   │    │
│  │ POST /tickets/{id}/comment                                   │    │
│  │ POST /tickets/sync                                           │    │
│  │ GET  /tickets/jira/issue-types                               │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘
```

---

## 3. Component Updates

### 3.1 Display Jira Issue Key as Clickable Link

**Location**: Ticket list views and ticket detail view

**Requirements**:
- Format the Jira issue key (e.g., `SUP-1`) as a clickable link
- Link URL: `https://{jira-domain}.atlassian.net/browse/{issue_key}`
- Open link in a new tab (`target="_blank"`)
- Style the link distinctly (e.g., blue color, underline)
- Handle cases where `jira_issue_key` is null or empty (show "Not synced" or similar)

**Implementation approach**:
- Create a reusable `JiraLink` component that takes `issueKey` and `jiraUrl` as props
- Use the Jira domain from environment configuration or settings
- Display the component in ticket list rows and ticket detail header

### 3.2 Show Jira Status Badge

**Location**: Ticket list view and ticket detail view

**Requirements**:
- Display a visual badge showing the current Jira ticket status
- Map Jira statuses to color-coded badges:
  - `To Do` / `Open` / `New` → Gray or Blue
  - `In Progress` → Yellow or Orange
  - `Done` / `Resolved` / `Closed` → Green
  - `Reopened` → Red
- Add a "Sync from Jira" button next to the badge
- Clicking the button triggers a status refresh from Jira

**Implementation approach**:
- Create or enhance the existing `StatusBadge` component to support Jira statuses
- Add a `SyncButton` component that calls the sync API
- Update the ticket store to include Jira status information

### 3.3 Add Comment Thread UI

**Location**: Ticket detail view

**Requirements**:
- Display a scrollable list of comments for the ticket
- Each comment shows: author, timestamp, body, source (copilot/Jira)
- Add a text input at the bottom to post new comments
- Posting a comment calls the backend API to create a Jira comment
- New comments appear in the thread in real-time (or after refresh)

**Implementation approach**:
- Create a `TicketComments` component
- Use the existing `adminStore` to manage comments state
- Add a form with a textarea and submit button
- Call `POST /tickets/{ticket_id}/comment` on submission
- Style comments consistently with existing message bubble components

### 3.4 Admin: Issue Type Selector

**Location**: Ticket creation form (admin view)

**Requirements**:
- When manually creating a ticket, show a dropdown to select the issue type
- Fetch available issue types from `GET /tickets/jira/issue-types`
- Display issue type name with optional icon
- Default to "Bug" for auto-escalations, "Task" for manual creation
- Allow admin to change the selection

**Implementation approach**:
- Add a `useEffect` hook to fetch issue types on component mount
- Store issue types in `adminStore`
- Add a select/dropdown component to the ticket creation form
- Pass the selected issue type to the ticket creation API call

---

## 4. Store Updates

### 4.1 `adminStore.ts` Enhancements

**New state properties**:
```
- issueTypes: IssueType[] — list of available Jira issue types
- selectedIssueType: string — currently selected issue type for creation
- syncing: boolean — whether a sync operation is in progress
- syncResult: { syncedCount: number, totalCount: number, errors: string[] } | null
```

**New actions**:
```
- loadIssueTypes() — fetch from GET /tickets/jira/issue-types
- syncTickets() — call POST /tickets/sync, store result
- setSelectedIssueType(type: string) — update selected issue type
- clearSyncResult() — reset sync result state
```

### 4.2 Ticket Data Structure Updates

Update the ticket type/interface in the store to include new Jira fields:
```
- jira_issue_key: string | null
- jira_issue_id: string | null
- jira_synced: boolean
- assignee: string | null
- jira_comments: JiraComment[] | null
- jira_status: string | null
```

---

## 5. API Integration Updates

### 5.1 New API Functions

In the API configuration or service layer, add:
- `addTicketComment(ticketId: UUID, comment: string, source?: string)` → POST
- `syncTickets()` → POST
- `getIssueTypes(projectKey?: string)` → GET

### 5.2 Enhanced Existing API Functions

- `getTickets(refresh?: boolean)` → add optional refresh parameter
- `getTicketById(id: UUID)` → now returns Jira fields

---

## 6. Files Modified

| File | Changes |
|------|---------|
| [`frontend/src/pages/TicketsLandingPage.tsx`](frontend/src/pages/TicketsLandingPage.tsx) | Add Jira links, status badges, sync button |
| [`frontend/src/components/TicketDetail.tsx`](frontend/src/components/TicketDetail.tsx) | Add comment thread UI, Jira link, status badge |
| [`frontend/src/store/adminStore.ts`](frontend/src/store/adminStore.ts) | Add issue types, sync actions, new state properties |
| [`frontend/src/config/api.ts`](frontend/src/config/api.ts) | Add new API endpoint URLs |

---

## 7. Success Criteria

- [ ] Jira issue keys are displayed as clickable links opening in new tabs
- [ ] Jira status badges display with appropriate colors
- [ ] "Sync from Jira" button refreshes ticket status
- [ ] Comment thread displays existing comments with author, timestamp, and source
- [ ] New comments can be posted and appear in the thread
- [ ] Issue type selector populates from API and allows selection
- [ ] All new UI elements handle null/empty states gracefully
