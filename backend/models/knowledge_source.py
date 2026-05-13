from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, Enum as SAEnum, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from models.base import TimestampedModel
from models.enums import KnowledgeSourceStatus, KnowledgeSourceType

if TYPE_CHECKING:
    from models.knowledge_chunk import KnowledgeChunk


class KnowledgeSource(TimestampedModel):
    __tablename__ = "knowledge_sources"

    url: Mapped[str] = mapped_column(String(500), unique=True, nullable=False)
    title: Mapped[str | None] = mapped_column(String(500), nullable=True)
    source_type: Mapped[KnowledgeSourceType] = mapped_column(
        SAEnum(KnowledgeSourceType, native_enum=False, length=20),
        default=KnowledgeSourceType.web_page,
        nullable=False,
    )
    status: Mapped[KnowledgeSourceStatus] = mapped_column(
        SAEnum(KnowledgeSourceStatus, native_enum=False, length=20),
        default=KnowledgeSourceStatus.pending,
        nullable=False,
        index=True,
    )
    chunk_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    max_pages: Mapped[int] = mapped_column(Integer, default=200, server_default='200', nullable=False)
    last_indexed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    chunks: Mapped[list["KnowledgeChunk"]] = relationship(
        "KnowledgeChunk",
        back_populates="source",
        cascade="all, delete-orphan",
    )
