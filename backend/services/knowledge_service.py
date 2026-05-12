"""
Knowledge Ingestion Service

Manages knowledge sources: add URL → crawl → chunk → embed → store in ChromaDB.
Ingestion runs as a background task so the API returns 202 immediately.
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ai.rag_pipeline import RAGEngine
from config.database import async_session_factory
from models.knowledge_source import KnowledgeSource
from utils.text_splitter import TextSplitter
from utils.web_scraper import WebScraper

logger = logging.getLogger(__name__)


class KnowledgeService:
    """Handles knowledge source CRUD and the ingestion pipeline."""

    def __init__(
        self,
        rag_engine: RAGEngine | None = None,
        scraper: WebScraper | None = None,
    ) -> None:
        if rag_engine is None:
            from ai.rag_pipeline import get_rag_engine
            rag_engine = get_rag_engine()
        self.rag_engine = rag_engine
        self.scraper = scraper or WebScraper()
        self.text_splitter = TextSplitter()

    # ------------------------------------------------------------------
    # Source management
    # ------------------------------------------------------------------

    async def add_source(
        self,
        db: AsyncSession,
        url: str,
        title: str | None = None,
        source_type: str = "web_page",
        max_pages: int = 200,
    ) -> KnowledgeSource:
        """Register a new knowledge source (status = pending)."""
        source = KnowledgeSource(
            url=url,
            title=title or url,
            source_type=source_type,
            status="pending",
            max_pages=max_pages,
        )
        db.add(source)
        await db.flush()
        await db.refresh(source)
        return source

    async def list_sources(self, db: AsyncSession) -> list[KnowledgeSource]:
        result = await db.execute(
            select(KnowledgeSource).order_by(KnowledgeSource.created_at.desc())
        )
        return list(result.scalars().all())

    async def get_source(
        self, db: AsyncSession, source_id: str
    ) -> KnowledgeSource | None:
        return await db.get(KnowledgeSource, source_id)

    async def delete_source(self, db: AsyncSession, source_id: str) -> bool:
        """Delete a knowledge source and its chunks from DB + ChromaDB."""
        source = await db.get(KnowledgeSource, source_id)
        if not source:
            return False

        # Clean up ChromaDB entries for this source.
        try:
            self.rag_engine.collection.delete(
                where={"source_id": str(source_id)},
            )
        except Exception as exc:
            logger.warning("ChromaDB cleanup failed for source %s: %s", source_id, exc)

        await db.delete(source)
        return True

    # ------------------------------------------------------------------
    # Ingestion pipeline (runs as background task)
    # ------------------------------------------------------------------

    async def ingest_source(self, source_id: str) -> bool:
        """Full ingestion pipeline: fetch → parse → chunk → embed → store.

        This method creates its OWN database session because it runs as a
        FastAPI BackgroundTask — the request-scoped session is already closed
        by the time this executes.

        Returns True on success.
        """
        async with async_session_factory() as db:
            try:
                source = await db.get(KnowledgeSource, source_id)
                if not source:
                    logger.error("Knowledge source %s not found", source_id)
                    return False

                # Mark as processing.
                source.status = "processing"
                await db.commit()

                # 1. Fetch content.
                logger.info("Fetching content from %s", source.url)
                if getattr(source, "source_type", None) == "web_page":
                    pages = await self.scraper.crawl_website(source.url, max_pages=getattr(source, "max_pages", 200))
                else:
                    content = await self.scraper.fetch_content(source.url)
                    pages = [content] if content and len(content.strip()) >= 50 else []

                if not pages:
                    raise ValueError("Fetched content is too short, empty, or crawler returned no valid pages")

                # 2. Split into chunks.
                chunks = []
                for page_content in pages:
                    chunks.extend(self.text_splitter.split_text(page_content))
                
                logger.info("Split into %d chunks across %d pages", len(chunks), len(pages))

                # 3. Add to ChromaDB (embeddings generated internally).
                chunk_count = await self.rag_engine.add_documents(
                    source_id=str(source_id),
                    source_title=source.title or source.url,
                    chunks=chunks,
                )

                # 4. Update source record.
                source.status = "indexed"
                source.chunk_count = chunk_count
                source.last_indexed_at = datetime.now(timezone.utc)
                await db.commit()

                logger.info(
                    "Successfully ingested source %s (%d chunks)",
                    source_id,
                    chunk_count,
                )
                return True

            except Exception as exc:
                logger.exception("Ingestion failed for source %s: %s", source_id, exc)
                try:
                    # Re-fetch inside a fresh transaction.
                    await db.rollback()
                    source = await db.get(KnowledgeSource, source_id)
                    if source:
                        source.status = "error"
                        await db.commit()
                except Exception:
                    logger.exception("Failed to mark source %s as error", source_id)
                return False

    async def reindex_source(self, source_id: str) -> bool:
        """Delete existing ChromaDB data for this source and re-ingest."""
        try:
            self.rag_engine.collection.delete(
                where={"source_id": str(source_id)},
            )
        except Exception as exc:
            logger.warning("ChromaDB cleanup before reindex failed: %s", exc)

        return await self.ingest_source(source_id)
