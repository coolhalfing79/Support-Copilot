# Person 4 Implementation Plan: Analytics, Utilities & Supporting Services

This implementation plan outlines the steps to build the supporting backend services as specified in `plan/person4-analytics-utilities.md`. It covers analytics endpoints, WebSocket handlers, utility modules, error handling middleware, and rate limiting.

## User Review Required

> [!WARNING]
> **Missing Dependencies:** The `plan/person4-analytics-utilities.md` relies on `chat_service.py` (which belongs to Person 3). Since `services/chat_service.py` does not currently exist in the codebase, the WebSocket implementation will either need to stub `ChatService` or be designed to accommodate its future integration. For this implementation, I plan to create a basic stub for `ChatService` and `TicketService` if they are missing so that the application compiles and the WebSocket endpoints can be unit-tested. Please confirm if this approach is acceptable.

> [!IMPORTANT]
> **Dependencies update:** The requirements file will be updated with `slowapi`, `python-json-logger`, `prometheus-client`, and `websockets`. Please confirm if adding these dependencies is acceptable.

## Open Questions

1. Should I create a mock `chat_service.py` and `ticket_service.py` under the `services/` directory to allow the WebSocket tests to pass, or just leave the WebSocket code with `# TODO`s?
2. Are there any specific database seeding scripts you would like me to use or update for the integration tests of analytics?

## Proposed Changes

### Configuration and Dependencies

#### [MODIFY] requirements.txt
Add the following dependencies for rate limiting, logging, and metrics:
- `slowapi`
- `python-json-logger`
- `prometheus-client`
- `websockets` (if not already covered by FastAPI standard)

### Utility Modules

#### [NEW] backend/utils/__init__.py
#### [NEW] backend/utils/formatters.py
Add data formatting functions (`format_uuid`, `format_timestamp`, `truncate_text`, `sanitize_for_json`).
#### [NEW] backend/utils/validators.py
Add input validation helpers (`is_valid_url`, `is_valid_email`, `is_valid_uuid`, `sanitize_input`).
#### [NEW] backend/utils/logging_config.py
Setup structured JSON logging using `python-json-logger`.

### Middleware

#### [NEW] backend/middleware/__init__.py
#### [NEW] backend/middleware/error_handler.py
Implement centralized exception handling for HTTP, validation, and database errors.
#### [NEW] backend/middleware/rate_limiter.py
Implement rate limiting using `slowapi` and set up the default limits.

### Services

#### [NEW] backend/services/__init__.py
#### [NEW] backend/services/analytics_service.py
Implement the `AnalyticsService` to aggregate metrics (overview, trends, common issues) using SQLAlchemy async queries against the existing `Message`, `Session`, and `Ticket` models.

### API Endpoints

#### [MODIFY] backend/api/v1/analytics.py
Wire up the existing endpoint stubs (`/overview`, `/trends`, `/issues`) to call the methods in `AnalyticsService`.

#### [NEW] backend/api/v1/ws/__init__.py
#### [NEW] backend/api/v1/ws/websocket.py
Implement the WebSocket handler for real-time chat streaming. This will require referencing the `ChatService` (which may be mocked for now).

### Main Application

#### [MODIFY] backend/main.py
- Register error handlers from `middleware/error_handler.py`.
- Register rate limiter from `middleware/rate_limiter.py`.
- Set up logging from `utils/logging_config.py`.
- Include the new WebSocket router.

### Testing

#### [NEW] backend/tests/test_analytics.py
Integration tests for the `AnalyticsService` and API endpoints using `pytest` and `httpx`.

#### [NEW] backend/tests/test_websocket.py
Integration tests for the WebSocket endpoint using FastAPI's `TestClient` or `httpx` WebSocket support.

#### [NEW] backend/tests/test_utils.py
Unit tests for functions in `formatters.py` and `validators.py`.

## Verification Plan

### Automated Tests
I will run the `pytest` test suite, specifically focusing on:
```bash
pytest backend/tests/test_analytics.py
pytest backend/tests/test_websocket.py
pytest backend/tests/test_utils.py
```
This will verify that the endpoints return 200 OK and valid JSON structures matching the schemas, and that the WebSocket connection properly accepts, receives, and closes.

### Manual Verification
1. I will start the application locally using `uvicorn main:app --reload`.
2. I will hit the `/api/v1/analytics/overview` endpoint to verify it returns a successful response without 500 errors.
3. I will test the rate limiting by making multiple rapid requests to trigger a `429 Too Many Requests`.
