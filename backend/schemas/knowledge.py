from datetime import datetime
import enum
from enum import Enum
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator


class KnowledgeSourceType(str, Enum):
    web_page = "web_page"
    pdf = "pdf"
    docx = "docx"
    markdown = "markdown"


class KnowledgeSourceStatus(str, Enum):
    pending = "pending"
    processing = "processing"
    indexed = "indexed"
    error = "error"


class KnowledgeSourceCreate(BaseModel):
    url: str = Field(..., max_length=500, description="Documentation or file URL to ingest")
    title: str | None = Field(None, max_length=500)
    source_type: KnowledgeSourceType = KnowledgeSourceType.web_page
    max_pages: int = Field(200, description="Max pages to crawl for web sources")


class KnowledgeSourceResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    url: str
    title: str | None = None
    source_type: KnowledgeSourceType
    status: KnowledgeSourceStatus
    chunk_count: int
    max_pages: int
    last_indexed_at: datetime | None = None
    created_at: datetime
    updated_at: datetime

    @field_validator("source_type", mode="before")
    @classmethod
    def _coerce_source_type(
        cls, value: KnowledgeSourceType | str | enum.Enum
    ) -> KnowledgeSourceType:
        if isinstance(value, KnowledgeSourceType):
            return value
        if isinstance(value, enum.Enum):
            return KnowledgeSourceType(value.value)
        return KnowledgeSourceType(value)

    @field_validator("status", mode="before")
    @classmethod
    def _coerce_status(
        cls, value: KnowledgeSourceStatus | str | enum.Enum
    ) -> KnowledgeSourceStatus:
        if isinstance(value, KnowledgeSourceStatus):
            return value
        if isinstance(value, enum.Enum):
            return KnowledgeSourceStatus(value.value)
        return KnowledgeSourceStatus(value)


class KnowledgeSourceListResponse(BaseModel):
    sources: list[KnowledgeSourceResponse]


class KnowledgeSourceDeleteResponse(BaseModel):
    success: bool = True


class KnowledgeSourceCreateAccepted(BaseModel):
    """202-style acknowledgement — Person 3 may extend with task id."""

    source_id: UUID
    status: KnowledgeSourceStatus = KnowledgeSourceStatus.pending
