"""Chat API endpoints (User View)."""

from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, HTTPException, status

from api.dependencies import DbSession, CurrentUser
from schemas.chat import (
    ChatRequest,
    ChatResponse,
    MessageResponse,
    SessionCreate,
    SessionDetailResponse,
    SessionListResponse,
    SessionResponse,
)
from services.service_factory import get_chat_service

router = APIRouter()


@router.post(
    "/sessions",
    response_model=SessionResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_session(
    db: DbSession,
    current_user: CurrentUser,
    _: SessionCreate | None = None,
) -> SessionResponse:
    """Create a new chat session."""
    chat_service = get_chat_service()
    session = await chat_service.create_session(db, user_id=str(current_user.id))
    return SessionResponse.model_validate(session)


@router.post(
    "/sessions/{session_id}/messages",
    response_model=ChatResponse,
)
async def send_message(
    session_id: UUID,
    message: ChatRequest,
    db: DbSession,
    current_user: CurrentUser,
) -> ChatResponse:
    """Send a user message and get an AI response."""
    chat_service = get_chat_service()
    # Ensure session exists and belongs to current user
    session = await chat_service.get_session(db, str(session_id))
    if session and str(session.user_id) != str(current_user.id):
        raise HTTPException(status_code=403, detail="Not authorized to access this session")
        
    try:
        response = await chat_service.process_message(
            db=db,
            session_id=str(session_id),
            user_message=message.message,
            follow_up_responses=message.follow_up_responses,
            user_id=str(current_user.id),
        )
        return response
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(exc),
        )


@router.get(
    "/sessions",
    response_model=SessionListResponse,
)
async def list_sessions(db: DbSession, current_user: CurrentUser) -> SessionListResponse:
    """List all chat sessions."""
    chat_service = get_chat_service()
    sessions = await chat_service.list_sessions(db, user_id=str(current_user.id))
    return SessionListResponse(
        sessions=[SessionResponse.model_validate(s) for s in sessions]
    )


@router.get(
    "/sessions/{session_id}",
    response_model=SessionDetailResponse,
)
async def get_session(session_id: UUID, db: DbSession, current_user: CurrentUser) -> SessionDetailResponse:
    """Get a session with its full message history."""
    chat_service = get_chat_service()
    session = await chat_service.get_session(db, str(session_id))
    if not session:
        # Return a skeleton session for newly generated IDs to avoid 404 noise
        from datetime import datetime, timezone
        return SessionDetailResponse(
            id=session_id,
            title="New Conversation",
            status="active",
            created_at=datetime.now(timezone.utc),
            updated_at=datetime.now(timezone.utc),
            messages=[],
        )
    if str(session.user_id) != str(current_user.id):
        raise HTTPException(status_code=403, detail="Not authorized to access this session")
        
    messages_response = []
    for m in session.messages:
        resp = MessageResponse.model_validate(m)
        if m.action == "escalated":
            # Find the associated ticket
            ticket = next((t for t in session.tickets), None)
            if ticket:
                from schemas.chat import TicketInfo
                from config.settings import get_settings
                settings = get_settings()
                jira_base_url = (settings.JIRA_URL or "").rstrip("/")
                jira_url = f"{jira_base_url}/browse/{ticket.jira_issue_key}" if ticket.jira_issue_key and jira_base_url else None
                
                resp.ticket = TicketInfo(
                    id=str(ticket.id),
                    jira_issue_key=ticket.jira_issue_key,
                    jira_url=jira_url,
                    summary=ticket.summary,
                    severity=ticket.severity.value if hasattr(ticket.severity, "value") else str(ticket.severity),
                    status=ticket.status.value if hasattr(ticket.status, "value") else str(ticket.status),
                )
        messages_response.append(resp)
        
    return SessionDetailResponse(
        id=session.id,
        title=session.title,
        status=session.status,
        created_at=session.created_at,
        updated_at=session.updated_at,
        messages=messages_response,
    )
