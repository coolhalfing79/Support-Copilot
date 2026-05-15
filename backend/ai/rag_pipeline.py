"""RAG pipeline: retrieve from Chroma and generate with Gemini.

Design principles:
  - Search ChromaDB for top-k chunks relevant to the query.
  - Clean the retrieved chunks (strip Jina markdown noise) before feeding to LLM.
  - Ask the LLM to answer STRICTLY from the provided context.
  - If the context is insufficient, return INSUFFICIENT_DOCUMENTATION.
  - Never save generated answers back into ChromaDB (that causes self-pollution).
"""

from __future__ import annotations

import asyncio
import hashlib
import logging
import re
from typing import Any, AsyncIterator

from sqlalchemy import select, and_, delete, func
from sqlalchemy.ext.asyncio import AsyncSession

from ai.embedding_engine import get_embedding_engine
from ai.llm_engine import get_llm_engine
from ai.prompts import (
    CHAT_SYSTEM_PROMPT,
    AGENTIC_RAG_PROMPT,
    AGENTIC_RAG_SCHEMA
)
from ai.utils import truncate_excerpt
from config.settings import get_settings
from models.knowledge_chunk import KnowledgeChunk

logger = logging.getLogger(__name__)

_rag_instance: "RAGEngine | None" = None

# ── Inline content cleaner (fast, no import cycle) ────────────────────────
_MD_LINK    = re.compile(r'\[([^\]]*)\]\([^)]+\)')
_MD_IMAGE   = re.compile(r'!\[[^\]]*\]\([^)]+\)')
_BARE_URL   = re.compile(r'^https?://\S+\s*$', re.MULTILINE)
_HTML_TAG   = re.compile(r'<[^>]+>')
_MULTI_NL   = re.compile(r'\n{3,}')


def _clean_chunk(text: str) -> str:
    """Strip Jina reader noise from a single chunk so the LLM sees clean prose."""
    # 1. Strip Jina metadata lines
    meta_prefixes = (
        "Title:", "URL Source:", "Published Time:", 
        "Markdown Content:", "Description:", "Image "
    )
    lines = text.splitlines()
    clean_lines = []
    for line in lines:
        if line.startswith(meta_prefixes) and ":" in line:
            # Check if it's really an Image N: prefix
            if line.startswith("Image ") and not re.match(r'^Image \d+:', line):
                clean_lines.append(line)
            continue
        clean_lines.append(line)
    
    text = "\n".join(clean_lines)

    # 2. Strip other markdown elements and clean up
    text = _MD_IMAGE.sub('', text)
    text = _MD_LINK.sub(r'\1', text)
    text = _BARE_URL.sub('', text)
    text = _HTML_TAG.sub('', text)
    text = _MULTI_NL.sub('\n\n', text)
    
    # Remove null bytes which PostgreSQL doesn't allow in UTF-8 strings
    text = text.replace('\x00', '')
    
    return text.strip()

# ── RAGEngine ─────────────────────────────────────────────────────────────

class RAGEngine:
    """Retrieval + grounded generation engine using pgvector."""

    def __init__(self, top_k: int = 5) -> None:
        settings = get_settings()
        self.top_k = top_k
        self.max_hops = 3
        self.embedding_engine = get_embedding_engine()
        self.llm_engine = get_llm_engine()
        self.batch_size = settings.VECTOR_BATCH_SIZE

    # ------------------------------------------------------------------
    # Indexing
    # ------------------------------------------------------------------

    async def add_documents(
        self,
        db: AsyncSession,
        source_id: str,
        source_title: str,
        chunks: list[str | dict[str, str]],
        source_url: str = "",
    ) -> int:
        """Embed and upsert chunks into PostgreSQL (pgvector)."""
        if not chunks:
            return 0

        # Normalize chunks to objects
        chunk_data = []
        for c in chunks:
            if isinstance(c, str):
                chunk_data.append({"content": c, "url": source_url})
            else:
                chunk_data.append({"content": c.get("content", ""), "url": c.get("url", source_url)})

        # Clean chunks inline before embedding
        clean_chunks = []
        clean_metadatas = []
        for i, item in enumerate(chunk_data):
            cleaned = _clean_chunk(item["content"])
            if len(cleaned) >= 50:
                clean_chunks.append(cleaned)
                clean_metadatas.append({
                    "source_id": source_id,
                    "source_title": source_title,
                    "source_url": item["url"],
                    "chunk_index": i,
                })

        if not clean_chunks:
            logger.warning("add_documents: all chunks became empty after cleaning for %s", source_id)
            return 0
            
        embeddings = await self.embedding_engine.embed_documents(clean_chunks)
        
        # We don't strictly need the hash-based IDs anymore as Postgres handles PKs,
        # but we use them or just rely on autoincrement UUIDs.
        # The model uses UUIDCreatedModel.
        
        new_chunks = []
        for i in range(len(clean_chunks)):
            new_chunks.append(
                KnowledgeChunk(
                    source_id=source_id,
                    chunk_index=clean_metadatas[i]["chunk_index"],
                    content=clean_chunks[i],
                    embedding_vector=embeddings[i],
                    chunk_metadata=clean_metadatas[i]
                )
            )

        # Batch insert
        for i in range(0, len(new_chunks), self.batch_size):
            db.add_all(new_chunks[i : i + self.batch_size])
        
        await db.flush()
        logger.info("Indexed %d chunks for source '%s' into pgvector", len(new_chunks), source_title)
        return len(new_chunks)

    # ------------------------------------------------------------------
    # Retrieval
    # ------------------------------------------------------------------

    async def search(
        self,
        db: AsyncSession,
        query: str,
        top_k: int | None = None,
        filters: dict | None = None,
    ) -> list[dict[str, Any]]:
        """Vector search in PostgreSQL using pgvector cosine distance."""
        k = top_k or self.top_k
        query_embedding = await self.embedding_engine.embed_query(query)
        
        # Build query with pgvector cosine distance
        stmt = (
            select(
                KnowledgeChunk,
                KnowledgeChunk.embedding_vector.cosine_distance(query_embedding).label("distance")
            )
            .order_by("distance")
            .limit(k)
        )
        
        # Apply filters (basic translation of ChromaDB-style filters)
        if filters:
            if "source_id" in filters:
                val = filters["source_id"]
                if isinstance(val, dict) and "$in" in val:
                    stmt = stmt.where(KnowledgeChunk.source_id.in_(val["$in"]))
                else:
                    stmt = stmt.where(KnowledgeChunk.source_id == val)

        result = await db.execute(stmt)
        rows: list[dict[str, Any]] = []
        
        for chunk, dist in result.all():
            rows.append(
                {
                    "id":         str(chunk.id),
                    "content":    _clean_chunk(chunk.content),
                    "metadata":   chunk.chunk_metadata or {},
                    "distance":   dist,
                    "similarity": round(1.0 - float(dist), 4),
                }
            )
        return rows

    async def _generate_hypothetical_doc(self, query: str) -> str:
        """Use LLM to generate a hypothetical ideal answer to the query (HyDE)."""
        prompt = (
            f"Please write a technical documentation excerpt that would perfectly answer this query: \"{query}\". "
            f"Focus on technical details, API names, and specific configuration steps. "
            f"Reply ONLY with the text of the documentation excerpt."
        )
        try:
            hypothetical_doc = await self.llm_engine.generate_response([{"role": "user", "content": prompt}])
            return hypothetical_doc.strip()
        except Exception as e:
            logger.warning("Failed to generate hypothetical doc for HyDE: %s", e)
            return query


    # ------------------------------------------------------------------
    # Generation — streaming (for the UI)
    # ------------------------------------------------------------------

    async def generate_response_stream(
        self, query: str, context_docs: list[dict[str, Any]]
    ) -> AsyncIterator[str]:
        context = self._build_context(context_docs)
        messages = [{"role": "user", "content": self._build_answer_prompt(query, context)}]
        async for chunk in self.llm_engine.generate_response_stream(
            messages, system_prompt=CHAT_SYSTEM_PROMPT
        ):
            yield chunk

    # ------------------------------------------------------------------
    # Generation — non-streaming
    # ------------------------------------------------------------------

    async def generate_response(
        self, db: AsyncSession, query: str, context_docs: list[dict[str, Any]]
    ) -> tuple[str, list[dict[str, Any]]]:
        """Answer the query strictly from context_docs with agentic re-searching."""
        all_docs = list(context_docs)
        seen_queries = {query.lower().strip()}

        for hop in range(self.max_hops):
            context_text = self._build_context(all_docs)
            prompt = AGENTIC_RAG_PROMPT.format(context=context_text, query=query)
            
            result = await self.llm_engine.generate_structured_response(
                prompt, schema_hint=AGENTIC_RAG_SCHEMA
            )
            
            action = result.get("action", "insufficient")
            content = result.get("content", "")

            if action == "answer":
                logger.info("✅ [RAG] Answered on hop %d", hop)
                return content, self._build_source_list(all_docs)
            
            if action == "search":
                new_query = content.strip().lower()
                if new_query in seen_queries or not new_query:
                    logger.info("Stopping agentic RAG: duplicate or empty search query")
                    break
                
                seen_queries.add(new_query)
                logger.info("🔍 [RAG] Hop %d: re-searching for '%s'", hop, new_query)
                
                new_docs = await self.search(db, content, top_k=3)
                
                # Merge and deduplicate by ID
                seen_ids = {d["id"] for d in all_docs}
                added_count = 0
                for d in new_docs:
                    if d["id"] not in seen_ids:
                        all_docs.append(d)
                        seen_ids.add(d["id"])
                        added_count += 1
                
                if added_count == 0:
                    logger.info("Stopping agentic RAG: no new documentation found")
                    break
                
                # Sort by similarity and keep top 8
                all_docs.sort(key=lambda x: x.get("similarity", 0), reverse=True)
                all_docs = all_docs[:8]
                continue
            
            if action == "insufficient":
                break
        
        logger.warning("⚠️  [RAG] Could not answer from documentation for: %s", query[:80])
        return "INSUFFICIENT_DOCUMENTATION", self._build_source_list(all_docs)

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

    def _build_context(self, docs: list[dict[str, Any]]) -> str:
        """Concatenate doc contents for the LLM context window."""
        parts = []
        for i, doc in enumerate(docs, 1):
            title = doc.get("metadata", {}).get("source_title", "Document")
            parts.append(f"[Source {i}: {title}]\n{doc.get('content', '')}")
        return "\n\n---\n\n".join(parts)

    def _build_answer_prompt(self, query: str, context: str) -> str:
        return (
            "You are an expert L2 Support AI. You must answer the user's question.\n"
            "CRITICAL INSTRUCTION: You MUST base your answer STRICTLY on the documentation excerpts provided below.\n"
            "Do NOT use your own general knowledge. Even if the documentation only provides partial steps or clues, "
            "synthesize them to the best of your ability. Do not state that the documentation is lacking unless it is completely irrelevant.\n\n"
            "Rules:\n"
            "- Answer clearly and concisely.\n"
            "- If the provided documentation is completely irrelevant to the question, reply EXACTLY with 'I_DONT_KNOW'.\n\n"
            f"Documentation:\n{context}\n\n"
            f"Question: {query}"
        )

    def _build_source_list(
        self, docs: list[dict[str, Any]]
    ) -> list[dict[str, Any]]:
        """Convert retrieved docs to the source info format expected by chat_service."""
        seen: set[str] = set()
        sources: list[dict[str, Any]] = []
        for doc in docs:
            meta = doc.get("metadata", {})
            # Deduplicate by URL to show individual pages as sources
            url = str(meta.get("source_url", ""))
            if url in seen:
                continue
            seen.add(url)
            
            sources.append(
                {
                    "source_id":     str(meta.get("source_id", "")),
                    "title":         str(meta.get("source_title", "Unknown")),
                    "url":           url,
                    "chunk_excerpt": truncate_excerpt(doc.get("content", "")),
                }
            )
        return sources

    async def process_query(self, db: AsyncSession, query: str) -> dict[str, Any]:
        """Convenience method for standalone testing."""
        context_docs = await self.search(db, query)
        if not context_docs:
            return {
                "response": "I couldn't find relevant information in the knowledge base.",
                "sources": [],
                "action": "escalated",
                "retrieval_score": 0.0,
            }
        avg_similarity = sum(d["similarity"] for d in context_docs) / len(context_docs)
        response, sources = await self.generate_response(db, query, context_docs)
        
        return {
            "response": response,
            "sources": sources,
            "action": "resolve" if response != "INSUFFICIENT_DOCUMENTATION" else "escalated",
            "retrieval_score": round(avg_similarity, 4),
        }


def get_rag_engine() -> RAGEngine:
    """Module-level singleton."""
    global _rag_instance
    if _rag_instance is None:
        _rag_instance = RAGEngine()
    return _rag_instance
