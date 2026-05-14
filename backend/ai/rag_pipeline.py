"""RAG pipeline: retrieve from Chroma and generate with Gemini."""

from __future__ import annotations

import asyncio
import logging
from typing import Any, AsyncIterator

logger = logging.getLogger(__name__)

from ai.chroma_utils import get_chroma_client, get_collection
from ai.embedding_engine import get_embedding_engine
from ai.llm_engine import get_llm_engine
from ai.prompts import CHAT_SYSTEM_PROMPT
from config.settings import get_settings

_rag_instance: "RAGEngine | None" = None

class RAGEngine:
    def __init__(self, top_k: int = 5) -> None:
        settings = get_settings()
        self.top_k = top_k
        self.embedding_engine = get_embedding_engine()
        self.llm_engine = get_llm_engine()
        client = get_chroma_client()
        self.collection = get_collection(client, settings.CHROMA_COLLECTION)

    async def add_documents(self, source_id: str, source_title: str, chunks: list[str], source_url: str = "") -> int:
        if not chunks: return 0
        embeddings = await self.embedding_engine.embed_documents(chunks)
        ids = [f"{source_id}_chunk_{i}" for i in range(len(chunks))]
        metadatas = [{"source_id": source_id, "source_title": source_title, "source_url": source_url} for _ in chunks]
        self.collection.upsert(documents=chunks, embeddings=embeddings, metadatas=metadatas, ids=ids)
        return len(chunks)

    async def search(self, query: str, top_k: int | None = None, filters: dict | None = None) -> list[dict[str, Any]]:
        k = top_k or self.top_k
        query_embedding = await self.embedding_engine.embed_query(query)
        query_kwargs = {"query_embeddings": [query_embedding], "n_results": k}
        if filters: query_kwargs["where"] = filters
        result = await asyncio.to_thread(self.collection.query, **query_kwargs)
        
        rows = []
        for i in range(len(result.get("ids", [[]])[0])):
            rows.append({
                "id": result["ids"][0][i],
                "content": result["documents"][0][i],
                "metadata": result["metadatas"][0][i] or {},
                "similarity": 1 - float(result["distances"][0][i] if result.get("distances") else 0.5)
            })
        return rows

    async def generate_response(self, query: str, context_docs: list[dict[str, Any]]) -> AsyncIterator[dict[str, Any]]:
        """Simplified, stable streaming response."""
        context = "\n\n".join([f"Doc: {d.get('metadata', {}).get('source_title', 'Source')}\n{d['content']}" for d in context_docs])
        
        # Yield sources immediately
        sources = []
        seen_ids = set()
        for d in context_docs:
            sid = d.get("metadata", {}).get("source_id")
            if sid and sid not in seen_ids:
                sources.append({"source_id": sid, "title": d.get("metadata", {}).get("source_title", "Doc"), "url": d.get("metadata", {}).get("source_url", "")})
                seen_ids.add(sid)
        
        yield {"type": "sources", "content": sources}

        prompt = f"Using the following context, answer the user query concisely.\n\nContext:\n{context[:6000]}\n\nQuery: {query}"
        
        async for token in self.llm_engine.generate_response_stream([{"role": "user", "content": prompt}]):
            yield {"type": "token", "content": token}

    async def process_query(self, query: str) -> dict[str, Any]:
        docs = await self.search(query)
        full_text = ""
        sources = []
        async for update in self.generate_response(query, docs):
            if update["type"] == "token": full_text += update["content"]
            elif update["type"] == "sources": sources = update["content"]
        return {"response": full_text, "sources": sources}

    async def get_suggested_questions(self, source_ids: list[str] | None = None) -> list[str]:
        """Generate 4 dynamic questions based on the content of selected sources."""
        try:
            where = {"source_id": {"$in": source_ids}} if source_ids else None
            # Fetch a few documents to get context
            results = await asyncio.to_thread(self.collection.get, where=where, limit=10)
            
            docs = results.get("documents", [])
            if not docs:
                return [
                    "What kind of information can you provide?",
                    "How do I use this knowledge assistant?",
                    "Tell me about the sources you have access to.",
                    "Show me some key topics you can help with."
                ]
                
            context = "\n".join(docs[:5])
            prompt = (
                "Based on the following document content, generate exactly 4 short, specific, and interesting questions "
                "that a user might want to ask about this information. "
                "Each question should be concise (max 12 words). "
                "Return ONLY the questions, one per line, no numbering, no preamble.\n\n"
                f"Content Snippets:\n{context[:2000]}"
            )
            
            res = await self.llm_engine.generate_response([{"role": "user", "content": prompt}])
            if "AI_RATE_LIMIT_EXCEEDED" in res:
                return ["Summarize these sources", "What are the main topics?", "How do I get started?", "Help guide"]
                
            questions = [q.strip().strip('"').strip("'") for q in res.split('\n') if q.strip()]
            return questions[:4]
        except Exception as e:
            logger.error(f"Error generating suggestions: {e}")
            return ["Summarize sources", "Key information", "How to use", "Get help"]

def get_rag_engine() -> RAGEngine:
    global _rag_instance
    if _rag_instance is None: _rag_instance = RAGEngine()
    return _rag_instance
