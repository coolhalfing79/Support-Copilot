from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    APP_NAME: str = "AI L2 Support Copilot"
    APP_VERSION: str = "1.0.0"
    DEBUG: bool = False

    DATABASE_URL: str = "sqlite+aiosqlite:///./data/app.db"
    DATABASE_POOL_SIZE: int = 10
    DATABASE_MAX_OVERFLOW: int = 20
    DATABASE_POOL_PRE_PING: bool = True

    REDIS_URL: str = "redis://localhost:6379/0"

    GEMINI_API_KEY: str = ""
    GEMINI_MODEL: str = "gemini-2.0-flash"
    GEMINI_EMBEDDING_MODEL: str = "gemini-embedding-001"

    JIRA_URL: str = ""
    JIRA_EMAIL: str = ""
    JIRA_API_TOKEN: str = ""
    JIRA_PROJECT_KEY: str = "SUP"
    JIRA_DEFAULT_ISSUE_TYPE: str = "Bug"
    JIRA_DEFAULT_ASSIGNEE: str | None = None

    CHROMA_PATH: str = "./data/chroma"
    CHROMA_COLLECTION: str = "knowledge_chunks"
    CHROMA_BATCH_SIZE: int = 5000

    # Keep as plain string to avoid pydantic-settings trying JSON decode before custom validators.
    CORS_ORIGINS: str = "http://localhost:3000,http://localhost:8000,http://localhost:5173"

    SECRET_KEY: str = ""
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24  # 24 hours

    def cors_origins_list(self) -> list[str]:
        raw = (self.CORS_ORIGINS or "").strip()
        if not raw:
            return ["http://localhost:3000", "http://localhost:8000"]
        return [part.strip() for part in raw.split(",") if part.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
