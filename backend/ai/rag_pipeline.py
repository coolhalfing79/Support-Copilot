"""RAG pipeline: retrieve from Chroma and generate with Gemini."""

from __future__ import annotations

import asyncio
import logging
from typing import Any, AsyncIterator

from ai.chroma_utils import get_chroma_client, get_collection
from ai.embedding_engine import get_embedding_engine
from ai.llm_engine import get_llm_engine
from ai.prompts import (
    CHAT_SYSTEM_PROMPT,
    AGENTIC_RAG_PROMPT,
    AGENTIC_RAG_SCHEMA
)
from ai.utils import truncate_excerpt
from config.settings import get_settings

logger = logging.getLogger(__name__)

_rag_instance: "RAGEngine | None" = None


class RAGEngine:
    """Retrieval + generation engine."""

    def __init__(self, top_k: int = 5) -> None:
        settings = get_settings()
        self.top_k = top_k
        self.embedding_engine = get_embedding_engine()
        self.llm_engine = get_llm_engine()
        client = get_chroma_client()
        self.collection = get_collection(client, settings.CHROMA_COLLECTION)
        self.batch_size = settings.CHROMA_BATCH_SIZE

    async def add_documents(
        self, source_id: str, source_title: str, chunks: list[str], source_url: str = ""
    ) -> int:
        """Embed and add chunks to Chroma in batches."""
        if not chunks:
            return 0

        logger.info(f"Adding {len(chunks)} chunks for source: {source_title} ({source_id})")
        embeddings = await self.embedding_engine.embed_documents(chunks)
        ids = [f"{source_id}_chunk_{i}" for i in range(len(chunks))]
        metadatas = [
            {
                "source_id": source_id,
                "source_title": source_title,
                "chunk_index": i,
                "total_chunks": len(chunks),
                "source_url": source_url,
            }
            for i in range(len(chunks))
        ]

        # ChromaDB has a maximum batch size.
        for i in range(0, len(chunks), self.batch_size):
            end = i + self.batch_size
            self.collection.upsert(
                documents=chunks[i:end],
                embeddings=embeddings[i:end],
                metadatas=metadatas[i:end],
                ids=ids[i:end],
            )
        
        return len(chunks)

    async def search(
        self, query: str, top_k: int | None = None, filters: dict | None = None
    ) -> list[dict[str, Any]]:
        """Search Chroma for relevant documents."""
        k = top_k or self.top_k
        query_embedding = await self.embedding_engine.embed_query(query)
        query_kwargs: dict[str, Any] = {
            "query_embeddings": [query_embedding],
            "n_results": k,
        }
        if filters:
            query_kwargs["where"] = filters
        
        result = await asyncio.to_thread(self.collection.query, **query_kwargs)

        ids = result.get("ids", [[]])[0]
        docs = result.get("documents", [[]])[0]
        metadatas = result.get("metadatas", [[]])[0]
        distances = result.get("distances", [[]])[0]

        rows: list[dict[str, Any]] = []
        for i in range(len(ids)):
            distance = distances[i] if i < len(distances) else 1.0
            rows.append(
                {
                    "id": ids[i],
                    "content": docs[i],
                    "metadata": metadatas[i] or {},
                    "distance": distance,
                    "similarity": round(1 - float(distance), 4),
                }
            )
        return rows

    async def generate_response_stream(
        self, query: str, context_docs: list[dict[str, Any]]
    ) -> AsyncIterator[str]:
        """Generate a simple response stream from context."""
        context = "\n\n".join(doc.get("content", "") for doc in context_docs)
        messages = [
            {
                "role": "user",
                "content": (
                    "You are an expert, context-aware L2 Support AI. Analyze the provided documentation to interpret and deduce the answer to the user's question. "
                    "You may apply the concepts from the documentation to troubleshoot specific errors (like Java stack traces), but you MUST base your reasoning on the provided text. "
                    "Do not hallucinate outside facts. If the documentation does not contain enough relevant information to deduce a helpful answer, "
                    "you MUST reply EXACTLY with the phrase 'INSUFFICIENT_DOCUMENTATION'.\n\n"
                    f"Documentation:\n{context}\n\n"
                    f"User Question: {query}"
                ),
            }
        ]
        async for chunk in self.llm_engine.generate_response_stream(
            messages, system_prompt=CHAT_SYSTEM_PROMPT
        ):
            yield chunk

    def _format_sources(self, docs: dict[str, dict[str, Any]]) -> list[dict[str, Any]]:
        """Format and deduplicate sources for the final response."""
        seen_ids = set()
        sources = []
        for doc in docs.values():
            meta = doc.get("metadata", {})
            source_id = str(meta.get("source_id", ""))
            # We want to deduplicate by source_id so we don't list the same page multiple times
            if source_id and source_id not in seen_ids:
                seen_ids.add(source_id)
                sources.append({
                    "source_id": source_id,
                    "title": str(meta.get("source_title", "")),
                    "url": str(meta.get("source_url", "")),
                    "chunk_excerpt": truncate_excerpt(doc.get("content", "")),
                })
        return sources

    async def generate_response(
        self, query: str, context_docs: list[dict[str, Any]]
    ) -> tuple[str, list[dict[str, Any]]]:
        """Agentic RAG with multi-hop reasoning."""
        accumulated_docs = {doc.get("id"): doc for doc in context_docs}
        search_history = {query}
        
        max_hops = 3
        for hop in range(max_hops):
            context = "\n\n".join(doc.get("content", "") for doc in accumulated_docs.values())
            prompt = AGENTIC_RAG_PROMPT.format(context=context, query=query)
            
            try:
                structured_resp = await self.llm_engine.generate_structured_response(prompt, AGENTIC_RAG_SCHEMA)
            except Exception as e:
                logger.error(f"Error in agentic hop {hop+1}: {e}")
                break

            action = structured_resp.get("action")
            content = structured_resp.get("content", "")
            
            if action == "answer" and content:
                logger.info(f"🟢 [Agentic RAG] Deduced answer on hop {hop+1}")
                return content, self._format_sources(accumulated_docs)
                
            elif action == "search" and content and content not in search_history:
                logger.info(f"🔍 [Agentic RAG] Hop {hop+1}: Missing context. Triggering graph search for -> '{content}'")
                search_history.add(content)
                new_docs = await self.search(content, top_k=3)
                for nd in new_docs:
                    if nd.get("id") not in accumulated_docs:
                        accumulated_docs[nd["id"]] = nd
                continue # Next hop
                
            else:
                logger.warning(f"🔴 [Agentic RAG] Hop {hop+1}: Action='{action}', Content='{content}' - Reached dead end.")
                break
                
        return "INSUFFICIENT_DOCUMENTATION", self._format_sources(accumulated_docs)

    async def process_query(self, query: str) -> dict[str, Any]:
        """Main entry point for handling a user query."""
        context_docs = await self.search(query)
        if not context_docs:
            return {
                "response": "I couldn't find relevant information in the knowledge base.",
                "sources": [],
                "action": "escalated",
                "retrieval_score": 0.0,
                "retrieved_chunks": [],
            }

        avg_similarity = sum(d["similarity"] for d in context_docs) / len(context_docs)
        response, sources = await self.generate_response(query, context_docs)
        
        return {
            "response": response,
            "sources": sources,
            "action": "resolve" if response != "INSUFFICIENT_DOCUMENTATION" else "escalated",
            "retrieval_score": round(avg_similarity, 4),
            "retrieved_chunks": [d["content"] for d in context_docs],
        }


def get_rag_engine() -> RAGEngine:
    """Module-level singleton."""
    global _rag_instance
    if _rag_instance is None:
        _rag_instance = RAGEngine()
    return _rag_instance
