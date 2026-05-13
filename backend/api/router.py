from fastapi import APIRouter

from api.v1.auth import router as auth_router
from api.v1.analytics import router as analytics_router
from api.v1.chat import router as chat_router
from api.v1.knowledge import router as knowledge_router
from api.v1.tickets import router as tickets_router

api_router = APIRouter()

api_router.include_router(auth_router, prefix="/auth", tags=["auth"])
api_router.include_router(chat_router, prefix="/chat", tags=["chat"])
api_router.include_router(knowledge_router, prefix="/knowledge", tags=["knowledge"])
api_router.include_router(tickets_router, prefix="/tickets", tags=["tickets"])
api_router.include_router(analytics_router, prefix="/analytics", tags=["analytics"])
