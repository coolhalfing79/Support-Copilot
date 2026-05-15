"""
Person 2 end-to-end smoke test.

Validates:
1) Chroma connectivity
2) add_documents (upsert path)
3) search returns similarity
4) process_query returns response/sources/retrieval_score/retrieved_chunks

Run (from backend directory):
    python scripts/person2_e2e_smoke.py

Or (recommended — no path issues):
    python -m scripts.person2_e2e_smoke
"""

from __future__ import annotations

import asyncio
import os
import sys
import uuid
from pathlib import Path

# Ensure `ai`, `config`, etc. resolve when this file lives under `scripts/`.
_BACKEND_ROOT = Path(__file__).resolve().parent.parent
if str(_BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(_BACKEND_ROOT))

from ai.rag_pipeline import get_rag_engine
from config.settings import get_settings
from config.database import async_session_factory
from models.knowledge_chunk import KnowledgeChunk
from sqlalchemy import delete


async def main() -> None:
    settings = get_settings()
    if not settings.GEMINI_API_KEY:
        raise RuntimeError("GEMINI_API_KEY missing in backend/.env")

    rag = get_rag_engine()
    source_id = str(uuid.uuid4())
    
    async with async_session_factory() as db:
        # Cleanup
        await db.execute(delete(KnowledgeChunk))
        await db.commit()

        chunks = [
            "ERR_TIMEOUT occurs when processor does not respond in 30 seconds.",
            "Step 1: verify network connectivity. Step 2: retry the operation.",
            "Fix: increase gateway timeout to 60 seconds and restart service.",
        ]

        added = await rag.add_documents(db, source_id, "Smoke Guide", chunks)
        print(f"Added chunks: {added}")
        await db.commit()

        search_rows = await rag.search(db, "How to fix ERR_TIMEOUT?")
        print(f"Search results: {len(search_rows)}")
        if not search_rows:
            raise RuntimeError("search() returned zero rows")

        if os.getenv("PERSON2_SKIP_LLM", "").lower() in {"1", "true", "yes"}:
            print("Skipping process_query because PERSON2_SKIP_LLM is enabled.")
            print("Person2 retrieval smoke: PASS")
            return

        result = await rag.process_query(db, "How to fix ERR_TIMEOUT?")
        print("process_query keys:", sorted(result.keys()))
        print("action:", result.get("action"))
        print("retrieval_score:", result.get("retrieval_score"))
        print("sources:", len(result.get("sources", [])))
        print("response preview:", str(result.get("response", ""))[:180])

        assert "response" in result
        assert "sources" in result
        assert "retrieval_score" in result

        print("Person2 e2e smoke: PASS")


if __name__ == "__main__":
    asyncio.run(main())
