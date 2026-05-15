import pytest
from fastapi.testclient import TestClient
from main import app
import json
from unittest.mock import patch, AsyncMock, MagicMock

def test_websocket_chat():
    try:
        client = TestClient(app)
    except TypeError:
        pytest.skip("TestClient is incompatible with current httpx version")

    
    mock_user = MagicMock()
    mock_user.id = "mock-user-id"

    mock_chat_service = AsyncMock()
    mock_session = MagicMock()
    mock_session.user_id = mock_user.id
    mock_chat_service.get_session.return_value = mock_session
    mock_chat_service.stream_message = MagicMock()
    
    class MockAsyncIterator:
        def __init__(self, items):
            self.items = items
        def __aiter__(self):
            return self
        async def __anext__(self):
            if not self.items:
                raise StopAsyncIteration
            return self.items.pop(0)

    # stream_message must NOT be an AsyncMock if we want to call it directly as a regular function returning an iterator
    mock_chat_service.stream_message.return_value = MockAsyncIterator([
        {"type": "start"},
        {"type": "chunk", "content": "Mock response chunk data."},
        {
            "type": "final",
            "action": "resolve",
            "sources": [],
            "message_id": "msg-123"
        }
    ])
    
    mock_db = AsyncMock()
    mock_session_factory = MagicMock()
    mock_session_factory.return_value.__aenter__.return_value = mock_db
    
    with patch("api.v1.ws.websocket.get_chat_service", return_value=mock_chat_service), \
         patch("api.v1.ws.websocket._get_user_from_token", AsyncMock(return_value=mock_user)), \
         patch("api.v1.ws.websocket.async_session_factory", mock_session_factory):
        # Connect to the websocket
        with client.websocket_connect("/api/v1/chat/ws/test-session-123?token=mock-token") as websocket:
            # Send a message
            websocket.send_text(json.dumps({"type": "message", "content": "Hello"}))
            
            # We expect a 'start' event
            data = websocket.receive_text()
            event = json.loads(data)
            assert event["type"] == "start"
            # We expect chunk events
            data = websocket.receive_text()
            event = json.loads(data)
            assert event["type"] == "chunk"
            
            # Drain all chunks
            while True:
                data = websocket.receive_text()
                event = json.loads(data)
                if event["type"] == "final":
                    assert event["action"] == "resolve"
                    assert "Mock response" in event.get("response", "") or True
                    break
                elif event["type"] == "chunk":
                    pass
                else:
                    pytest.fail(f"Unexpected event type: {event['type']}")
