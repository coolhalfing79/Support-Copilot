from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from api.router import api_router
from config.database import engine
from config.settings import get_settings
from middleware.error_handler import register_error_handlers
from middleware.rate_limiter import setup_rate_limiter
from api.v1.ws.websocket import router as ws_router
from utils.logging_config import setup_logging
from seed_admin import seed_admin
from models import Base

setup_logging()

@asynccontextmanager
async def lifespan(_app: FastAPI):
    # Create tables
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    
    await seed_admin()
    yield
    await engine.dispose()


settings = get_settings()

app = FastAPI(
    title=settings.APP_NAME,
    version=settings.APP_VERSION,
    docs_url="/docs",
    redoc_url="/redoc",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list(),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

register_error_handlers(app)
setup_rate_limiter(app)

app.include_router(api_router, prefix="/api/v1")
app.include_router(ws_router, prefix="/api/v1/chat")


@app.get("/health")
async def health_check() -> dict[str, str]:
    return {"status": "healthy", "version": settings.APP_VERSION}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
