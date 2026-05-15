import pytest
import uuid
from unittest.mock import AsyncMock, MagicMock

from sqlalchemy.ext.asyncio import AsyncSession
from ai.rag_pipeline import RAGEngine
from ai.utils import compute_completeness_score
from utils.text_splitter import TextSplitter
from models.knowledge_chunk import KnowledgeChunk


class _FakeEmbeddingEngine:
    async def embed_documents(self, documents: list[str]) -> list[list[float]]:
        return [[0.1, 0.2, 0.3] for _ in documents]

    async def embed_query(self, _query: str) -> list[float]:
        return [0.1, 0.2, 0.3]


class _FakeLLMEngine:
    async def generate_response(self, _messages, system_prompt=None) -> str:
        return f"ok:{bool(system_prompt)}"


class _FakeCollection:
    def __init__(self):
        self.upsert_calls = []
        self.query_calls = []

    def upsert(self, **kwargs):
        self.upsert_calls.append(kwargs)

    def query(self, **kwargs):
        self.query_calls.append(kwargs)
        return {
            "ids": [["doc_1"]],
            "documents": [["Run step 1 then restart service."]],
            "metadatas": [[{"source_id": "src1", "source_title": "Guide"}]],
            "distances": [[0.2]],
        }


def _make_rag_for_test() -> RAGEngine:
    rag = object.__new__(RAGEngine)
    rag.top_k = 5
    rag.max_hops = 3
    rag.batch_size = 100
    rag.embedding_engine = _FakeEmbeddingEngine()
    rag.llm_engine = _FakeLLMEngine()
    return rag


@pytest.mark.asyncio
async def test_rag_add_documents_uses_upsert() -> None:
    rag = _make_rag_for_test()
    db = AsyncMock(spec=AsyncSession)
    
    # Chunks must be >= 50 characters to be indexed by rag_pipeline.py
    chunk1 = "This is a long documentation chunk about system architecture that exceeds fifty characters."
    chunk2 = "Another piece of technical writing that provides enough detail to pass the length check."
    added = await rag.add_documents(db, "sourceA", "Title A", [chunk1, chunk2])
    assert added == 2
    assert db.add_all.called


@pytest.mark.asyncio
async def test_rag_search_omits_where_when_filters_none() -> None:
    rag = _make_rag_for_test()
    db = AsyncMock(spec=AsyncSession)
    
    mock_result = MagicMock()
    mock_result.all.return_value = []
    db.execute = AsyncMock(return_value=mock_result)
    
    rows = await rag.search(db, "error 500", filters=None)
    assert len(rows) == 0


@pytest.mark.asyncio
async def test_rag_search_passes_where_when_filters_present() -> None:
    rag = _make_rag_for_test()
    db = AsyncMock(spec=AsyncSession)
    
    mock_result = MagicMock()
    mock_result.all.return_value = []
    db.execute = AsyncMock(return_value=mock_result)
    
    _ = await rag.search(db, "error 500", filters={"source_id": "src1"})
    assert db.execute.called


def test_text_splitter_and_completeness_heuristic() -> None:
    splitter = TextSplitter(chunk_size=200, chunk_overlap=20)
    # Text must be long enough to produce chunks >= 60 chars to pass _is_quality_chunk
    text = (
        "Error 500 happens on login. Step 1: restart app. "
        "Then apply fix and update config. Ensure all services are running properly. "
        "Verification steps: check logs for success message. Restart the gateway if needed."
    )
    chunks = splitter.split_text(text)
    assert len(chunks) > 0
    score = compute_completeness_score(chunks)
    assert 0.0 <= score <= 1.0
