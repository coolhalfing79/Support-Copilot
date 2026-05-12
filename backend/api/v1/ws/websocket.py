"""
WebSocket Handler
Provides real-time streaming for chat responses with robust error handling and resource management.
"""
import json
import logging
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from pydantic import BaseModel

from config.database import async_session_factory
from services.service_factory import get_chat_service
from config.settings import get_settings
from jose import jwt, JWTError
from sqlalchemy import select
from models.user import User

router = APIRouter()
logger = logging.getLogger(__name__)
settings = get_settings()

def serialize_event(event: dict[str, Any]) -> str:
    """
    Helper to safely serialize events containing Pydantic models, Enums, or Datetimes.
    Ensures JSON compliance and avoids broad fallback errors.
    """
    def _convert(obj):
        if isinstance(obj, BaseModel):
            return obj.model_dump()
        if hasattr(obj, "value"): # Enums
            return obj.value
        if isinstance(obj, (datetime, timezone)):
            return obj.isoformat()
        return None # Return None to let json.dumps raise TypeError if it's truly unserializable

    try:
        return json.dumps(event, default=_convert)
    except (TypeError, ValueError) as e:
        logger.error(f"Serialization error for event {event.get('type')}: {e}")
        # Fallback to a safe error message if the specific event cannot be serialized
        return json.dumps({
            "type": "error",
            "message": "Internal serialization error",
            "timestamp": datetime.now(timezone.utc).isoformat()
        })

@router.websocket("/ws/{session_id}")
async def websocket_chat(websocket: WebSocket, session_id: str):
    """
    WebSocket endpoint for real-time chat with JWT authentication.
    """
    await websocket.accept()
    
    # 1. Authenticate
    token = websocket.query_params.get("token")
    if not token:
        await websocket.send_text(serialize_event({"type": "error", "message": "Authentication required"}))
        await websocket.close(code=4001)
        return

    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        email = payload.get("sub")
        if not email:
            raise JWTError()
    except JWTError:
        await websocket.send_text(serialize_event({"type": "error", "message": "Invalid authentication token"}))
        await websocket.close(code=4002)
        return

    chat_service = get_chat_service()
    
    try:
        # Get user from DB
        async with async_session_factory() as db:
            result = await db.execute(select(User).where(User.email == email))
            user = result.scalars().first()
            if not user:
                await websocket.send_text(serialize_event({"type": "error", "message": "User not found"}))
                await websocket.close(code=4003)
                return
            user_id = user.id

        while True:
            try:
                raw_message = await websocket.receive_text()
                client_message = json.loads(raw_message)
            except json.JSONDecodeError:
                await websocket.send_text(serialize_event({"type": "error", "message": "Invalid JSON format"}))
                continue
            
            if client_message.get("type") == "message":
                user_message = client_message.get("content", "").strip()
                knowledge_sources = client_message.get("knowledge_sources", None)
                
                if not user_message:
                    await websocket.send_text(serialize_event({"type": "error", "message": "Message content cannot be empty"}))
                    continue

                async with async_session_factory() as db:
                    try:
                        async for event in chat_service.stream_message(
                            db=db,
                            session_id=session_id,
                            user_id=user_id,
                            user_message=user_message,
                            knowledge_source_ids=knowledge_sources,
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
        except:
            pass
