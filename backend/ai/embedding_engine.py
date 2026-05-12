"""Embedding engine using local FastEmbed model (BAAI/bge-small-en-v1.5).

Runs entirely on-device via ONNX Runtime — no API keys, no rate limits.
"""

from __future__ import annotations

import asyncio
import logging
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from fastembed import TextEmbedding

logger = logging.getLogger(__name__)

_emb_instance: "EmbeddingEngine | None" = None

_MODEL_NAME = "BAAI/bge-small-en-v1.5"
_EMBEDDING_DIM = 384


class EmbeddingEngine:
    """Engine for generating text embeddings using a local model."""

    def __init__(self) -> None:
        from fastembed import TextEmbedding

        logger.info("Loading local embedding model: %s", _MODEL_NAME)
        self.model: TextEmbedding = TextEmbedding(model_name=_MODEL_NAME)
        logger.info("Embedding model loaded successfully")

    # ------------------------------------------------------------------
    # Public API (async wrappers)
    # ------------------------------------------------------------------

    async def embed_query(self, text: str) -> list[float]:
        """Embed a single query string for retrieval."""
        return await asyncio.to_thread(self._embed_one, text)

    async def embed_documents(self, documents: list[str]) -> list[list[float]]:
        """Embed a list of document chunks for storage."""
        if not documents:
            return []
        return await asyncio.to_thread(self._embed_many, documents)

    # ------------------------------------------------------------------
    # Internal helpers (synchronous, run in thread)
    # ------------------------------------------------------------------

    def _embed_one(self, text: str) -> list[float]:
        embeddings = list(self.model.embed([text]))
        return embeddings[0].tolist()

    def _embed_many(self, documents: list[str]) -> list[list[float]]:
        logger.info("Embedding %d documents locally...", len(documents))
        embeddings = list(self.model.embed(documents))
        logger.info("Finished embedding %d documents", len(documents))
        return [e.tolist() for e in embeddings]

    # ------------------------------------------------------------------
    # Metadata
    # ------------------------------------------------------------------

    def get_embedding_dimension(self) -> int:
        return _EMBEDDING_DIM


def get_embedding_engine() -> EmbeddingEngine:
    """Module-level singleton."""
    global _emb_instance
    if _emb_instance is None:
        _emb_instance = EmbeddingEngine()
    return _emb_instance
