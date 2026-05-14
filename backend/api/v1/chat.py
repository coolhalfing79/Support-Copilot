"""Chat API endpoints (User View)."""

from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, HTTPException, status

from api.dependencies import DbSession
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
    _: SessionCreate | None = None,
) -> SessionResponse:
    """Create a new chat session."""
    chat_service = get_chat_service()
    session = await chat_service.create_session(db)
    return SessionResponse.model_validate(session)


@router.post(
    "/sessions/{session_id}/messages",
    response_model=ChatResponse,
)
async def send_message(
    session_id: UUID,
    message: ChatRequest,
    db: DbSession,
) -> ChatResponse:
    """Send a user message and get an AI response."""
    chat_service = get_chat_service()
    try:
        response = await chat_service.process_message(
            db=db,
            session_id=str(session_id),
            user_message=message.message,
            follow_up_responses=message.follow_up_responses,
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
async def list_sessions(db: DbSession) -> SessionListResponse:
    """List all chat sessions."""
    chat_service = get_chat_service()
    sessions = await chat_service.list_sessions(db)
    return SessionListResponse(
        sessions=[SessionResponse.model_validate(s) for s in sessions]
    )


@router.get(
    "/sessions/{session_id}",
    response_model=SessionDetailResponse,
)
async def get_session(session_id: UUID, db: DbSession) -> SessionDetailResponse:
    """Get a session with its full message history."""
    chat_service = get_chat_service()
    session = await chat_service.get_session(db, str(session_id))
    if not session:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Session {session_id} not found",
        )
    return SessionDetailResponse(
        id=session.id,
        title=session.title,
        status=session.status,
        created_at=session.created_at,
        updated_at=session.updated_at,
        messages=[MessageResponse.model_validate(m) for m in session.messages],
    )


@router.get("/graphs")
async def list_graphs(db: DbSession) -> list[dict[str, Any]]:
    """List all Knowledge Graphs archived in message metadata."""
    chat_service = get_chat_service()
    return await chat_service.list_all_graphs(db)


@router.post("/suggestions")
async def get_suggestions(source_ids: list[str] | None = None) -> list[str]:
    """Get AI-suggested questions for selected sources."""
    from ai.rag_pipeline import get_rag_engine
    rag = get_rag_engine()
    return await rag.get_suggested_questions(source_ids)
