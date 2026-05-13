# Jira Integration — Phase 6: Configuration & Environment

> **Purpose**: Set up the environment configuration and documentation required for users to connect the Support-Copilot system to a real Jira Cloud instance.

---

## 1. Phase Overview

This phase handles all configuration-related changes needed to support real Jira Cloud integration. This includes adding new environment variables, updating settings, creating setup documentation, and ensuring the system gracefully handles missing or invalid credentials.

### Key Objectives

1. **New Environment Variables** — Add all Jira-related configuration variables
2. **Settings Updates** — Update Pydantic settings model with new fields
3. **Setup Documentation** — Create step-by-step guide for Jira setup
4. **Graceful Degradation** — Ensure the system works with or without Jira credentials

---

## 2. Environment Variables

### 2.1 New Variables to Add

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `JIRA_URL` | Yes (for real Jira) | — | Jira Cloud instance URL, e.g., `https://yourteam.atlassian.net` |
| `JIRA_EMAIL` | Yes (for real Jira) | — | Email address associated with the Jira account |
| `JIRA_API_TOKEN` | Yes (for real Jira) | — | API token from Atlassian account security settings |
| `JIRA_PROJECT_KEY` | No | `SUP` | Jira project key for ticket creation |
| `JIRA_DEFAULT_ISSUE_TYPE` | No | `Bug` | Default issue type for automatic escalations |
| `JIRA_DEFAULT_ASSIGNEE` | No | — | Default assignee username for new Jira issues |
| `JIRA_ENABLE_WEBHOOKS` | No | `false` | Enable webhook support for Jira status changes (future use) |

### 2.2 Existing Variables (Already Present)

The following variables already exist in [`backend/config/settings.py`](backend/config/settings.py) and require no changes:
- `JIRA_URL`
- `JIRA_EMAIL`
- `JIRA_API_TOKEN`
- `JIRA_PROJECT_KEY`

Verify that these are already defined and match the expected types.

---

## 3. Settings Model Updates

### 3.1 Update `backend/config/settings.py`

Add the following new fields to the Settings Pydantic model:

```
Add these new optional fields:
- jira_default_issue_type: str = "Bug"
- jira_default_assignee: str | None = None
- jira_enable_webhooks: bool = False
```

Ensure all Jira-related fields are properly typed and have appropriate defaults.

### 3.2 Field Validation

Consider adding validation logic:
- If `JIRA_API_TOKEN` is provided, `JIRA_URL` and `JIRA_EMAIL` should also be provided
- Log a warning if any Jira credential is partially configured (e.g., token provided but URL missing)

---

## 4. Setup Documentation

### 4.1 Jira Cloud Setup Steps

Create documentation (can be part of the existing `summary.md` or a separate file) with the following steps:

**Step 1: Create a Jira Cloud Project**
- Go to [Jira Cloud](https://www.atlassian.com/software/jira) and sign up for a free account
- Create a new project (free tier supports up to 10 users)
- Note the project key (e.g., `SUP`, `TICKET`, etc.)

**Step 2: Generate an API Token**
- Go to [Atlassian Account Security](https://id.atlassian.com/manage-profile/security/api-tokens)
- Click "Create API token"
- Name it "Support Copilot" (or any descriptive name)
- Copy the token immediately — it will not be shown again

**Step 3: Configure Environment Variables**
- Create or update the `.env` file in the backend directory
- Add the following variables:
  ```
  JIRA_URL=https://yourteam.atlassian.net
  JIRA_EMAIL=your-email@example.com
  JIRA_API_TOKEN=your-api-token-here
  JIRA_PROJECT_KEY=SUP
  ```

**Step 4: Verify Connection**
- Start the backend server
- Check the logs for credential validation results
- The server should log whether Jira credentials are valid

### 4.2 Mock Mode Fallback

Document the fallback behavior:
- If `JIRA_API_TOKEN` is empty or credentials are invalid, the system automatically falls back to mock mode
- In mock mode, all Jira operations return fake data (e.g., `SUP-ABC123`)
- This allows development and demo without a real Jira account
- Tickets are still created locally and can be synced later when credentials are configured

---

## 5. Environment File Templates

### 5.1 `.env.example` (or `.env.template`)

Create a template file that users can copy and fill in:

```
# Jira Cloud Integration
JIRA_URL=
JIRA_EMAIL=
JIRA_API_TOKEN=
JIRA_PROJECT_KEY=SUP
JIRA_DEFAULT_ISSUE_TYPE=Bug
JIRA_DEFAULT_ASSIGNEE=
JIRA_ENABLE_WEBHOOKS=false
```

### 5.2 `.gitignore` Verification

Ensure `.gitignore` includes `.env` to prevent accidental commit of credentials:
```
.env
.env.local
.env.*.local
```

---

## 6. Configuration Validation

### 6.1 Startup Validation

When the backend server starts:
1. Load all Jira-related environment variables
2. Attempt a lightweight health check (e.g., `GET /rest/api/3/myself`) if credentials are present
3. Log the result:
   - Success: `INFO: Jira connection verified for project SUP`
   - Failure: `WARNING: Jira credentials invalid or unreachable — mock mode enabled`
4. Set the `JiraClient.is_configured` flag based on the result

### 6.2 Runtime Behavior

- When `is_configured = False`, all JiraClient methods return mock data
- When `is_configured = True`, all JiraClient methods make real API calls
- The flag is set once at initialization and does not change during runtime
- To change credentials, restart the server

---

## 7. Files Modified

| File | Changes |
|------|---------|
| [`backend/config/settings.py`](backend/config/settings.py) | Add new Jira-related settings fields |
| `.env.example` | Create template with all Jira variables |
| `.gitignore` | Verify `.env` is excluded |
| `summary.md` or new doc | Add Jira setup documentation |

---

## 8. Success Criteria

- [ ] All 7 environment variables are defined in the settings model
- [ ] `.env.example` template is created with all variables
- [ ] `.gitignore` excludes `.env` files
- [ ] Setup documentation provides clear, step-by-step Jira configuration instructions
- [ ] Server logs indicate whether Jira credentials are valid on startup
- [ ] System operates correctly in mock mode when credentials are missing
- [ ] Partial credential configurations produce appropriate warnings
