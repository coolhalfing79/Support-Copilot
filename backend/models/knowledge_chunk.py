import uuid
from typing import TYPE_CHECKING, Any

from sqlalchemy import ForeignKey, Integer, JSON, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from models.base import GUID, UUIDCreatedModel

if TYPE_CHECKING:
    from models.knowledge_source import KnowledgeSource


class KnowledgeChunk(UUIDCreatedModel):
    __tablename__ = "knowledge_chunks"

    source_id: Mapped[uuid.UUID] = mapped_column(
        GUID(),
        ForeignKey("knowledge_sources.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    chunk_index: Mapped[int] = mapped_column(Integer, nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    chunk_metadata: Mapped[dict[str, Any] | None] = mapped_column(JSON, nullable=True)

    source: Mapped["KnowledgeSource"] = relationship(
        "KnowledgeSource", back_populates="chunks"
    )
