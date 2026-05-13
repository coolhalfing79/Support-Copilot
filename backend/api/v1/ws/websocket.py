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

router = APIRouter()
logger = logging.getLogger(__name__)

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
    WebSocket endpoint for real-time chat.
    
    Client sends: {"type": "message", "content": "user message"}
    Server sends: JSON events (start, chunk, final, error)
    """
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
                
                # Validation: Ensure message is not empty
                if not user_message:
                    await websocket.send_text(serialize_event({
                        "type": "error",
                        "message": "Message content cannot be empty",
                    }))
                    continue

                # 🔴 Resource Management: Open session only for the duration of message processing
                # This prevents connection pool exhaustion if the socket stays idle.
                async with async_session_factory() as db:
                    try:
                        async for event in chat_service.stream_message(
                            db=db,
                            session_id=session_id,
                            user_message=user_message,
                            knowledge_source_ids=knowledge_sources,
                        ):
                            # Add timestamp if missing
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
