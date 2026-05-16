from collections.abc import AsyncGenerator
from pathlib import Path
from typing import Any

from sqlalchemy import event
from sqlalchemy.engine import make_url
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from config.settings import get_settings

settings = get_settings()

database_url = make_url(settings.DATABASE_URL)
engine_kwargs: dict[str, Any] = {
    "echo": settings.DEBUG,
    "pool_pre_ping": settings.DATABASE_POOL_PRE_PING,
}

if database_url.get_backend_name() == "sqlite":
    if database_url.database and database_url.database != ":memory:":
        Path(database_url.database).expanduser().parent.mkdir(
            parents=True, exist_ok=True
        )
    engine_kwargs["connect_args"] = {"check_same_thread": False}
else:
    engine_kwargs["pool_size"] = settings.DATABASE_POOL_SIZE
    engine_kwargs["max_overflow"] = settings.DATABASE_MAX_OVERFLOW

engine = create_async_engine(settings.DATABASE_URL, **engine_kwargs)


if database_url.get_backend_name() == "sqlite":

    @event.listens_for(engine.sync_engine, "connect")
    def _enable_sqlite_foreign_keys(
        dbapi_connection: Any, _connection_record: Any
    ) -> None:
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()


async_session_factory = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autocommit=False,
    autoflush=False,
)


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """Provide a request-scoped DB session.

    Commits on successful request completion; rolls back on exceptions.
    Read-only handlers still pay one commit (no-op if nothing dirty).
    """
    async with async_session_factory() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
