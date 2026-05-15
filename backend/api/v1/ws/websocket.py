"""
WebSocket Handler
Provides real-time streaming for chat responses with robust error handling and resource management.
Requires a valid JWT token via ?token= query param. Sessions are scoped to the authenticated user.
"""
import json
import logging
from datetime import datetime, timezone
from typing import Any, Optional

from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Query
from jose import JWTError, jwt
from pydantic import BaseModel
from sqlalchemy import select

from config.database import async_session_factory
from config.settings import get_settings
from models.user import User
from services.service_factory import get_chat_service

router = APIRouter()
logger = logging.getLogger(__name__)
_settings = get_settings()


# ------------------------------------------------------------------
# Auth helper
# ------------------------------------------------------------------

async def _get_user_from_token(token: str) -> Optional[User]:
    """Validate JWT and return the corresponding user, or None if invalid."""
    try:
        payload = jwt.decode(token, _settings.SECRET_KEY, algorithms=[_settings.ALGORITHM])
        email: str = payload.get("sub")
        if not email:
            return None
        async with async_session_factory() as db:
            result = await db.execute(select(User).where(User.email == email))
            return result.scalars().first()
    except JWTError:
        return None


# ------------------------------------------------------------------
# Serialisation helper
# ------------------------------------------------------------------

def serialize_event(event: dict[str, Any]) -> str:
    """
    Safely serialize events containing Pydantic models, Enums, or Datetimes.
    """
    def _convert(obj):
        if isinstance(obj, BaseModel):
            return obj.model_dump()
        if hasattr(obj, "value"):  # Enums
            return obj.value
        if isinstance(obj, (datetime, timezone)):
            return obj.isoformat()
        return None

    try:
        return json.dumps(event, default=_convert)
    except (TypeError, ValueError) as e:
        logger.error(f"Serialization error for event {event.get('type')}: {e}")
        return json.dumps({
            "type": "error",
            "message": "Internal serialization error",
            "timestamp": datetime.now(timezone.utc).isoformat()
        })


# ------------------------------------------------------------------
# WebSocket endpoint
# ------------------------------------------------------------------

@router.websocket("/ws/{session_id}")
async def websocket_chat(
    websocket: WebSocket,
    session_id: str,
    token: Optional[str] = Query(default=None),
):
    """
    WebSocket endpoint for real-time chat.

    Client sends: {"type": "message", "content": "user message"}
    Server sends: JSON events (start, chunk, final, error)

    Authentication: JWT token must be passed via ?token= query param.
    """
    # Authenticate before accepting the connection
    current_user = None
    if token:
        current_user = await _get_user_from_token(token)

    if not current_user:
        await websocket.close(code=4001, reason="Unauthorized")
        logger.warning("WebSocket rejected: invalid or missing token for session %s", session_id)
        return

    await websocket.accept()
    chat_service = get_chat_service()

    try:
        while True:
            try:
                raw_message = await websocket.receive_text()
                client_message = json.loads(raw_message)
            except json.JSONDecodeError:
                await websocket.send_text(serialize_event({
                    "type": "error",
                    "message": "Invalid JSON format",
                }))
                continue

            if client_message.get("type") == "message":
                user_message = client_message.get("content", "").strip()
                knowledge_sources = client_message.get("knowledge_sources", None)

                if not user_message:
                    await websocket.send_text(serialize_event({
                        "type": "error",
                        "message": "Message content cannot be empty",
                    }))
                    continue

                # Open a DB session only for the duration of message processing
                async with async_session_factory() as db:
                    try:
                        # Verify session ownership
                        session = await chat_service.get_session(db, session_id)
                        if session and str(session.user_id) != str(current_user.id):
                            await websocket.send_text(serialize_event({
                                "type": "error",
                                "message": "Not authorized to access this session",
                            }))
                            continue

                        async for event in chat_service.stream_message(
                            db=db,
                            session_id=session_id,
                            user_message=user_message,
                            knowledge_source_ids=knowledge_sources,
                            user_id=str(current_user.id),
                        ):
                            if "timestamp" not in event:
                                event["timestamp"] = datetime.now(timezone.utc)
                            await websocket.send_text(serialize_event(event))

                        await db.commit()

                    except Exception as e:
                        logger.error(f"Error processing message in session {session_id}: {e}", exc_info=True)
                        await db.rollback()
                        await websocket.send_text(serialize_event({
                            "type": "error",
                            "message": f"Server error: {str(e)}",
                            "timestamp": datetime.now(timezone.utc),
                        }))

    except WebSocketDisconnect:
        logger.info(f"WebSocket disconnected for session {session_id}")
    except Exception as e:
        logger.error(f"Critical WebSocket error in session {session_id}: {e}", exc_info=True)
        try:
            await websocket.send_text(serialize_event({
                "type": "error",
                "message": "Internal server error occurred",
            }))
        except Exception:
            pass
