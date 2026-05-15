from typing import TYPE_CHECKING, Any

from sqlalchemy import ForeignKey, Integer, Text, Index
from sqlalchemy.dialects.postgresql import JSONB, UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from pgvector.sqlalchemy import Vector

from models.base import UUIDCreatedModel

if TYPE_CHECKING:
    from models.knowledge_source import KnowledgeSource


class KnowledgeChunk(UUIDCreatedModel):
    __tablename__ = "knowledge_chunks"

    source_id: Mapped[PGUUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("knowledge_sources.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    chunk_index: Mapped[int] = mapped_column(Integer, nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    embedding_vector: Mapped[list[float] | None] = mapped_column(
        Vector(384), nullable=True
    )
    chunk_metadata: Mapped[dict[str, Any] | None] = mapped_column(JSONB, nullable=True)

    source: Mapped["KnowledgeSource"] = relationship(
        "KnowledgeSource", back_populates="chunks"
    )

    __table_args__ = (
        Index(
            "ix_knowledge_chunks_embedding",
            embedding_vector,
            postgresql_using="hnsw",
            postgresql_with={"m": 16, "ef_construction": 64},
            postgresql_ops={"embedding_vector": "vector_cosine_ops"},
        ),
    )
