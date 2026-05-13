# Person 4 — Analytics, Utilities & Supporting Services

## Role: Backend Engineer (Supporting Services)

---

## Task Overview

Build supporting backend services including analytics endpoints, WebSocket handlers for real-time chat streaming, utility modules, error handling middleware, and rate limiting. This person ensures smooth operation and provides the infrastructure that makes the system production-ready.

**Priority:** HIGH — Enables real-time features and monitoring
**Start Time:** Hour 6 (after Person 1 provides models)
**Primary Completion Target:** Hours 12-16

---

## Tech Stack

| Component | Technology | Version |
|-----------|-----------|---------|
| API Framework | FastAPI | 0.109+ |
| WebSocket | FastAPI WebSocket | Included |
| Rate Limiting | slowapi | 0.6+ |
| Logging | python-json-logger | 2.0+ |
| Metrics | prometheus-client | 0.19+ |

---

## Detailed Task Breakdown

### 4.1 Directory Structure

Create the following structure under `/backend`:

```
backend/
├── utils/
│   ├── __init__.py
│   ├── formatters.py          # Data formatting utilities
│   ├── validators.py          # Input validation helpers
│   ├── helpers.py             # General helpers
│   └── logging_config.py      # Logging setup
├── middleware/
│   ├── __init__.py
│   ├── error_handler.py       # Exception handlers
│   └── rate_limiter.py        # Rate limiting
├── services/
│   └── analytics_service.py   # Analytics aggregation
└── api/
    └── v1/
        ├── analytics.py       # Analytics endpoints (implementation)
        └── ws/
            └── websocket.py   # WebSocket handler
```

### 4.2 WebSocket Handler for Real-Time Chat

**File:** `backend/api/v1/ws/websocket.py`

```python
"""
WebSocket Handler
Provides real-time streaming for chat responses.
"""
from typing import AsyncGenerator
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, HTTPException
import json
import asyncio
from datetime import datetime

from services.chat_service import ChatService
from ai.rag_pipeline import RAGEngine
from services.confidence_service import ConfidenceService
from services.ticket_service import TicketService

router = APIRouter()

# Global service instances (initialized in main.py)
chat_service: ChatService = None
rag_engine: RAGEngine = None
confidence_service: ConfidenceService = None
ticket_service: TicketService = None

async def message_generator(session_id: str, user_message: str):
    """
    Generator that yields chunks of the response as they are generated.
    Enables streaming to the frontend.
    """
    # Send start signal
    yield json.dumps({
        "type": "start",
        "timestamp": datetime.utcnow().isoformat(),
    })
    
    try:
        # Process the message
        response = await chat_service.process_message(
            db=None,  # Will be passed via WebSocket auth
            session_id=session_id,
            user_message=user_message,
        )
        
        # Stream the response text
        response_text = response.response
        chunk_size = 20  # Characters per chunk
        
        for i in range(0, len(response_text), chunk_size):
            chunk = response_text[i:i + chunk_size]
            yield json.dumps({
                "type": "chunk",
                "content": chunk,
                "is_final": i + chunk_size >= len(response_text),
            })
            await asyncio.sleep(0.05)  # Simulate typing effect
        
        # Send final response metadata
        yield json.dumps({
            "type": "final",
            "action": response.action,
            "sources": response.sources,
            "ticket": response.ticket,
            "message_id": response.message_id,
            "timestamp": datetime.utcnow().isoformat(),
        })
        
    except Exception as e:
        yield json.dumps({
            "type": "error",
            "message": str(e),
            "timestamp": datetime.utcnow().isoformat(),
        })


@router.websocket("/ws/{session_id}")
async def websocket_chat(websocket: WebSocket, session_id: str):
    """
    WebSocket endpoint for real-time chat.
    
    Client sends: {"type": "message", "content": "user message"}
    Server sends: JSON events (start, chunk, final, error)
    """
    await websocket.accept()
    
    try:
        async for message_data in message_generator(session_id, ""):
            # Wait for client message
            raw_message = await websocket.receive_text()
            import json
            client_message = json.loads(raw_message)
            
            if client_message.get("type") == "message":
                user_message = client_message["content"]
                
                # Send response chunks
                async for event in message_generator(session_id, user_message):
                    await websocket.send_text(event)
                    
    except WebSocketDisconnect:
        pass
    except Exception as e:
        try:
            await websocket.send_text(json.dumps({
                "type": "error",
                "message": str(e),
            }))
        except:
            pass
```

### 4.3 Analytics Service

**File:** `backend/services/analytics_service.py`

```python
"""
Analytics Service
Aggregates metrics for dashboard display.
"""
from typing import List, Dict, Any, Optional
from datetime import datetime, date, timedelta
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import func, select, and_

from models.message import Message
from models.ticket import Ticket
from models.session import Session
from models.metric import Metric
from schemas.analytics import (
    MetricOverview,
    TrendPoint,
    CommonIssue,
    AnalyticsOverviewResponse,
)

class AnalyticsService:
    """Service for analytics and metrics aggregation."""
    
    def __init__(self):
        pass
    
    async def get_overview(
        self,
        db: AsyncSession,
        days: int = 7,
    ) -> MetricOverview:
        """
        Get dashboard overview metrics.
        
        Args:
            db: Database session
            days: Number of days to look back
            
        Returns:
            MetricOverview with aggregated metrics
        """
        start_date = datetime.utcnow() - timedelta(days=days)
        
        # Count queries (user messages)
        query_count_result = await db.execute(
            select(func.count(Message.id))
            .where(Message.created_at >= start_date, Message.role == "user")
        )
        total_queries = query_count_result.scalar() or 0
        
        # Count resolved (actions = resolve)
        # Note: This requires tracking action in messages
        # For now, estimate from messages with sources
        resolved_count_result = await db.execute(
            select(func.count(Message.id))
            .where(
                Message.created_at >= start_date,
                Message.role == "assistant",
                Message.sources.isnot(None),
            )
        )
        resolved_count = resolved_count_result.scalar() or 0
        
        # Count escalations (tickets created)
        ticket_count_result = await db.execute(
            select(func.count(Ticket.id))
            .where(Ticket.created_at >= start_date)
        )
        total_tickets = ticket_count_result.scalar() or 0
        
        # Calculate rates
        resolution_rate = (resolved_count / total_queries * 100) if total_queries > 0 else 0
        escalation_rate = (total_tickets / total_queries * 100) if total_queries > 0 else 0
        
        # Average confidence score
        avg_confidence_result = await db.execute(
            select(func.avg(Message.confidence_score))
            .where(
                Message.created_at >= start_date,
                Message.confidence_score.isnot(None),
            )
        )
        avg_confidence = avg_confidence_result.scalar() or 0.0
        
        # Total sessions
        session_count_result = await db.execute(
            select(func.count(Session.id))
            .where(Session.created_at >= start_date)
        )
        total_sessions = session_count_result.scalar() or 0
        
        return MetricOverview(
            total_queries=total_queries,
            resolution_rate=round(resolution_rate, 2),
            escalation_rate=round(escalation_rate, 2),
            avg_confidence_score=round(float(avg_confidence), 4),
            total_tickets=total_tickets,
            total_sessions=total_sessions,
        )
    
    async def get_trends(
        self,
        db: AsyncSession,
        days: int = 30,
        metric_type: str = "query_count",
    ) -> List[TrendPoint]:
        """
        Get trend data for a specific metric.
        
        Args:
            db: Database session
            days: Number of days to look back
            metric_type: Type of metric to track
            
        Returns:
            List of TrendPoint with daily values
        """
        start_date = datetime.utcnow() - timedelta(days=days)
        
        if metric_type == "query_count":
            # Daily query counts
            result = await db.execute(
                select(
                    func.date(Message.created_at).label("day"),
                    func.count(Message.id).label("count"),
                )
                .where(
                    Message.created_at >= start_date,
                    Message.role == "user",
                )
                .group_by(func.date(Message.created_at))
                .order_by(func.date(Message.created_at))
            )
            rows = result.all()
            
            return [
                TrendPoint(
                    date=row.day,
                    value=row.count,
                    label=row.day.strftime("%Y-%m-%d"),
                )
                for row in rows
            ]
        
        elif metric_type == "resolution_count":
            # Daily resolution counts
            result = await db.execute(
                select(
                    func.date(Message.created_at).label("day"),
                    func.count(Message.id).label("count"),
                )
                .where(
                    Message.created_at >= start_date,
                    Message.role == "assistant",
                    Message.sources.isnot(None),
                )
                .group_by(func.date(Message.created_at))
                .order_by(func.date(Message.created_at))
            )
            rows = result.all()
            
            return [
                TrendPoint(
                    date=row.day,
                    value=row.count,
                    label=row.day.strftime("%Y-%m-%d"),
                )
                for row in rows
            ]
        
        elif metric_type == "escalation_count":
            # Daily ticket counts
            result = await db.execute(
                select(
                    func.date(Ticket.created_at).label("day"),
                    func.count(Ticket.id).label("count"),
                )
                .where(Ticket.created_at >= start_date)
                .group_by(func.date(Ticket.created_at))
                .order_by(func.date(Ticket.created_at))
            )
            rows = result.all()
            
            return [
                TrendPoint(
                    date=row.day,
                    value=row.count,
                    label=row.day.strftime("%Y-%m-%d"),
                )
                for row in rows
            ]
        
        return []
    
    async def get_common_issues(
        self,
        db: AsyncSession,
        limit: int = 10,
    ) -> List[CommonIssue]:
        """
        Get most common issues from tickets.
        
        Args:
            db: Database session
            limit: Maximum number of issues to return
            
        Returns:
            List of CommonIssue with pattern and count
        """
        # Group tickets by product module and severity
        result = await db.execute(
            select(
                Ticket.product_module,
                Ticket.severity,
                func.count(Ticket.id).label("count"),
                func.max(Ticket.created_at).label("last_seen"),
            )
            .where(Ticket.product_module.isnot(None))
            .group_by(Ticket.product_module, Ticket.severity)
            .order_by(func.count(Ticket.id).desc())
            .limit(limit)
        )
        rows = result.all()
        
        return [
            CommonIssue(
                pattern=f"{row.product_module} - {row.severity}",
                count=row.count,
                severity=row.severity,
                last_seen=row.last_seen,
            )
            for row in rows
        ]
```

### 4.4 Error Handling Middleware

**File:** `backend/middleware/error_handler.py`

```python
"""
Error Handler Middleware
Centralized exception handling for the FastAPI application.
"""
from fastapi import FastAPI, Request, HTTPException
from fastapi.responses import JSONResponse
from fastapi.exceptions import RequestValidationError
from sqlalchemy.exc import SQLAlchemyError
from pydantic import ValidationError
import logging

logger = logging.getLogger(__name__)

def register_error_handlers(app: FastAPI):
    """Register all error handlers with the FastAPI app."""
    
    @app.exception_handler(HTTPException)
    async def http_exception_handler(request: Request, exc: HTTPException):
        return JSONResponse(
            status_code=exc.status_code,
            content={
                "error": {
                    "code": exc.status_code,
                    "message": exc.detail,
                    "type": "http_error",
                }
            },
        )
    
    @app.exception_handler(RequestValidationError)
    async def validation_exception_handler(request: Request, exc: RequestValidationError):
        logger.warning(f"Validation error: {exc.errors()}")
        return JSONResponse(
            status_code=422,
            content={
                "error": {
                    "code": 422,
                    "message": "Validation failed",
                    "details": exc.errors(),
                    "type": "validation_error",
                }
            },
        )
    
    @app.exception_handler(ValidationError)
    async def pydantic_validation_exception_handler(request: Request, exc: ValidationError):
        logger.warning(f"Pydantic validation error: {exc.errors()}")
        return JSONResponse(
            status_code=422,
            content={
                "error": {
                    "code": 422,
                    "message": "Request validation failed",
                    "details": exc.errors(),
                    "type": "validation_error",
                }
            },
        )
    
    @app.exception_handler(SQLAlchemyError)
    async def sqlalchemy_exception_handler(request: Request, exc: SQLAlchemyError):
        logger.error(f"Database error: {exc}")
        return JSONResponse(
            status_code=500,
            content={
                "error": {
                    "code": 500,
                    "message": "Database error occurred",
                    "type": "database_error",
                }
            },
        )
    
    @app.exception_handler(Exception)
    async def general_exception_handler(request: Request, exc: Exception):
        logger.error(f"Unexpected error: {exc}", exc_info=True)
        return JSONResponse(
            status_code=500,
            content={
                "error": {
                    "code": 500,
                    "message": "An unexpected error occurred",
                    "type": "internal_error",
                }
            },
        )
```

### 4.5 Rate Limiting

**File:** `backend/middleware/rate_limiter.py`

```python
"""
Rate Limiter
Implements rate limiting for API endpoints.
"""
from slowapi import Limiter
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

def setup_rate_limiter(app: FastAPI):
    """Setup rate limiting for the FastAPI app."""
    limiter = Limiter(key_func=get_remote_address)
    app.state.limiter = limiter
    
    @app.exception_handler(RateLimitExceeded)
    async def rate_limit_handler(request: Request, exc: RateLimitExceeded):
        return JSONResponse(
            status_code=429,
            content={
                "error": {
                    "code": 429,
                    "message": "Rate limit exceeded. Please try again later.",
                    "type": "rate_limit_error",
                }
            },
        )
    
    # Apply default rate limit to all endpoints
    # More specific limits can be applied per-endpoint
    DEFAULT_RATE_LIMIT = "100/minute"
```

### 4.6 Utility Modules

**File:** `backend/utils/formatters.py`

```python
"""
Formatters
Utility functions for formatting data.
"""
from datetime import datetime
from typing import Any, Optional
import uuid

def format_uuid(value: Any) -> str:
    """Convert any value to UUID string."""
    if isinstance(value, uuid.UUID):
        return str(value)
    return str(value)

def format_timestamp(dt: Optional[datetime]) -> Optional[str]:
    """Format datetime to ISO 8601 string."""
    if dt is None:
        return None
    return dt.isoformat()

def truncate_text(text: str, max_length: int = 200) -> str:
    """Truncate text to specified length."""
    if len(text) <= max_length:
        return text
    return text[:max_length] + "..."

def sanitize_for_json(value: Any) -> Any:
    """Sanitize a value for JSON serialization."""
    if isinstance(value, uuid.UUID):
        return str(value)
    if isinstance(value, datetime):
        return value.isoformat()
    return value
```

**File:** `backend/utils/validators.py`

```python
"""
Validators
Input validation helper functions.
"""
import re
from typing import Optional

def is_valid_url(url: str) -> bool:
    """Validate if a string is a valid URL."""
    pattern = r'^https?://[^\s/$.?#].[^\s]*$'
    return bool(re.match(pattern, url))

def is_valid_email(email: str) -> bool:
    """Validate if a string is a valid email."""
    pattern = r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$'
    return bool(re.match(pattern, email))

def is_valid_uuid(uuid_str: str) -> bool:
    """Validate if a string is a valid UUID."""
    pattern = r'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    return bool(re.match(pattern, uuid_str.lower()))

def sanitize_input(text: str, max_length: int = 10000) -> str:
    """Sanitize user input by removing potentially dangerous characters."""
    # Remove null bytes
    text = text.replace('\x00', '')
    # Truncate to max length
    return text[:max_length]
```

**File:** `backend/utils/logging_config.py`

```python
"""
Logging Configuration
Sets up structured logging for the application.
"""
import logging
import sys
from pythonjsonlogger import jsonlogger

def setup_logging(level: str = "INFO"):
    """Configure application logging."""
    logger = logging.getLogger()
    logger.setLevel(getattr(logging, level.upper()))
    
    # Console handler
    handler = logging.StreamHandler(sys.stdout)
    
    # Use JSON format for production, plain text for development
    formatter = jsonlogger.JsonFormatter(
        fmt="%(asctime)s %(levelname)s %(name)s %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
    )
    handler.setFormatter(formatter)
    
    logger.addHandler(handler)
    
    # Reduce noise from third-party libraries
    logging.getLogger("uvicorn.access").setLevel(logging.WARNING)
    logging.getLogger("sqlalchemy.engine").setLevel(logging.WARNING)
```

### 4.7 Analytics API Endpoints

**File:** `backend/api/v1/analytics.py`

```python
"""
Analytics Endpoints
API endpoints for analytics data.
"""
from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from config.database import get_db
from services.analytics_service import AnalyticsService
from schemas.analytics import (
    AnalyticsOverviewResponse,
    MetricOverview,
    TrendPoint,
    CommonIssue,
)

router = APIRouter()

analytics_service = AnalyticsService()

@router.get("/overview", response_model=AnalyticsOverviewResponse)
async def get_overview(
    days: int = Query(7, ge=1, le=90, description="Number of days to look back"),
    db: AsyncSession = Depends(get_db),
):
    """Get dashboard overview metrics."""
    metrics = await analytics_service.get_overview(db, days=days)
    trends = await analytics_service.get_trends(db, days=days)
    common_issues = await analytics_service.get_common_issues(db)
    
    return AnalyticsOverviewResponse(
        metrics=metrics,
        trends=trends,
        common_issues=common_issues,
    )

@router.get("/trends")
async def get_trends(
    days: int = Query(30, ge=1, le=365),
    metric_type: str = Query("query_count", regex="^(query_count|resolution_count|escalation_count)$"),
    db: AsyncSession = Depends(get_db),
):
    """Get trend data for a specific metric."""
    trends = await analytics_service.get_trends(db, days=days, metric_type=metric_type)
    return {"trends": trends}

@router.get("/issues", response_model=list[CommonIssue])
async def get_common_issues(
    limit: int = Query(10, ge=1, le=50),
    db: AsyncSession = Depends(get_db),
):
    """Get most common issues."""
    issues = await analytics_service.get_common_issues(db, limit=limit)
    return issues
```

### 4.8 Update main.py

Add the middleware and WebSocket route to `main.py`:

```python
# In main.py, after creating the app:

from middleware.error_handler import register_error_handlers
from middleware.rate_limiter import setup_rate_limiter
from api.v1.ws.websocket import router as ws_router

# Register error handlers
register_error_handlers(app)

# Setup rate limiting
setup_rate_limiter(app)

# Add WebSocket route
app.include_router(ws_router, prefix="/api/v1/chat")
```

---

## Acceptance Criteria

- [ ] WebSocket endpoint `/api/v1/chat/ws/{session_id}` accepts connections
- [ ] WebSocket sends proper event types (start, chunk, final, error)
- [ ] Analytics endpoint `/api/v1/analytics/overview` returns correct metrics
- [ ] Analytics endpoint `/api/v1/analytics/trends` returns trend data
- [ ] Analytics endpoint `/api/v1/analytics/issues` returns common issues
- [ ] Error handler catches and formats all exception types
- [ ] Rate limiter is active and returns 429 when exceeded
- [ ] Logging is configured with structured output
- [ ] All utility functions work correctly (formatters, validators)

---

## Dependencies

| Dependency | Owner | Status |
|------------|-------|--------|
| Database models | Person 1 | Required |
| Chat Service | Person 3 | Required for WebSocket |
| RAG Engine | Person 2 | Required for WebSocket |

## Deliverables To

| Recipient | What They Get |
|-----------|--------------|
| Person 5 | WebSocket endpoint for streaming |
| Person 6 | Analytics API endpoints for dashboard |
| Person 7 | Testable endpoints and utilities |

---

## Tips for AI-Assisted Implementation

1. Start with error handling — it's simple and benefits everyone
2. Build the analytics service using SQLAlchemy queries
3. WebSocket is the most complex part — test incrementally
4. Use `websockets` library directly if FastAPI WebSocket is tricky
5. Rate limiting can use a simple in-memory store for the hackathon
6. Test analytics with seed data from Person 8
