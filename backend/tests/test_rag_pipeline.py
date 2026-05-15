import pytest
import asyncio
from unittest.mock import AsyncMock, patch, MagicMock
from ai.rag_pipeline import RAGEngine
from models.knowledge_chunk import KnowledgeChunk
from sqlalchemy.ext.asyncio import AsyncSession

class _FakeEmbeddingEngine:
    async def embed_documents(self, documents: list[str]) -> list[list[float]]:
        return [[0.1] * 384 for _ in documents]

    async def embed_query(self, _query: str) -> list[float]:
        return [0.1] * 384

class _FakeLLMEngine:
    def __init__(self):
        self.responses = []
        self.structured_responses = []

    async def generate_response(self, messages, system_prompt=None):
        if self.responses:
            return self.responses.pop(0)
        return "Mocked Response"

    async def generate_response_stream(self, messages, system_prompt=None):
        yield "Chunk 1"
        yield " Chunk 2"

    async def generate_structured_response(self, prompt, schema_hint):
        if self.structured_responses:
            return self.structured_responses.pop(0)
        return {"action": "insufficient", "content": ""}

def _make_rag_test_instance():
    # Bypass __init__ to avoid real connections
    rag = object.__new__(RAGEngine)
    rag.top_k = 3
    rag.max_hops = 3
    rag.batch_size = 100
    rag.embedding_engine = _FakeEmbeddingEngine()
    rag.llm_engine = _FakeLLMEngine()
    return rag

@pytest.mark.asyncio
async def test_add_documents_batching():
    rag = _make_rag_test_instance()
    rag.batch_size = 2 
    db = AsyncMock(spec=AsyncSession)
    
    chunks = [f"Unique chunk {i}: This is a long enough chunk to pass the minimum length filter of fifty characters." for i in range(5)]
    
    added = await rag.add_documents(db, "sid", "title", chunks, source_url="http://url")
    
    assert added == 5
    assert db.add_all.call_count == 3 
    call_args_list = db.add_all.call_args_list
    assert len(call_args_list[0][0][0]) == 2
    assert isinstance(call_args_list[0][0][0][0], KnowledgeChunk)

@pytest.mark.asyncio
async def test_search_similarity():
    rag = _make_rag_test_instance()
    db = AsyncMock(spec=AsyncSession)
    
    mock_chunk = MagicMock(spec=KnowledgeChunk)
    mock_chunk.id = "doc_1"
    mock_chunk.content = "Relevant context content"
    mock_chunk.chunk_metadata = {"source_id": "src1", "source_title": "Title", "source_url": "http://src1"}
    
    mock_result = MagicMock()
    mock_result.all.return_value = [(mock_chunk, 0.1)]
    db.execute = AsyncMock(return_value=mock_result)
    
    results = await rag.search(db, "test query")
    
    assert len(results) == 1
    assert results[0]["id"] == "doc_1"
    assert results[0]["similarity"] == 0.9 

@pytest.mark.asyncio
async def test_generate_response_stream():
    rag = _make_rag_test_instance()
    chunks = []
    async for chunk in rag.generate_response_stream("query", [{"content": "ctx"}]):
        chunks.append(chunk)
    
    assert "".join(chunks) == "Chunk 1 Chunk 2"

@pytest.mark.asyncio
async def test_agentic_rag_multi_hop():
    rag = _make_rag_test_instance()
    db = AsyncMock(spec=AsyncSession)
    
    rag.llm_engine.structured_responses = [
        {"action": "search", "content": "more details about X"},
        {"action": "answer", "content": "The final answer is Y"}
    ]
    
    mock_chunk = MagicMock(spec=KnowledgeChunk)
    mock_chunk.id = "doc_new"
    mock_chunk.content = "More relevant context content"
    mock_chunk.chunk_metadata = {"source_id": "src_new", "source_title": "New Doc", "source_url": "http://new"}
    
    mock_result = MagicMock()
    mock_result.all.return_value = [(mock_chunk, 0.1)]
    db.execute = AsyncMock(return_value=mock_result)
    
    initial_docs = [{
        "id": "d1", 
        "content": "c1", 
        "metadata": {
            "source_id": "initial_src", 
            "source_title": "Initial Doc",
            "source_url": "http://initial"
        },
        "similarity": 0.5
    }]
    content, sources = await rag.generate_response(db, "initial query", initial_docs)
    
    assert content == "The final answer is Y"
    source_ids = [s["source_id"] for s in sources]
    assert "initial_src" in source_ids 
    assert "src_new" in source_ids

@pytest.mark.asyncio
async def test_agentic_rag_max_hops():
    rag = _make_rag_test_instance()
    db = AsyncMock(spec=AsyncSession)
    
    rag.llm_engine.structured_responses = [
        {"action": "search", "content": f"query {i}"} for i in range(10)
    ]
    
    # Return a unique doc each time to allow multiple hops
    search_count = 0
    def side_effect(*args, **kwargs):
        nonlocal search_count
        search_count += 1
        mc = MagicMock(spec=KnowledgeChunk)
        mc.id = f"doc_{search_count}"
        mc.content = "c"
        mc.chunk_metadata = {"source_id": "s"}
        res = MagicMock()
        res.all.return_value = [(mc, 0.1)]
        return res
    
    db.execute = AsyncMock(side_effect=side_effect)
    
    content, sources = await rag.generate_response(db, "query", [])
    assert content == "INSUFFICIENT_DOCUMENTATION"
    # It should have called search exactly max_hops (3) times
    assert len(rag.llm_engine.structured_responses) == 10 - 3

@pytest.mark.asyncio
async def test_agentic_rag_duplicate_search():
    rag = _make_rag_test_instance()
    db = AsyncMock(spec=AsyncSession)
    
    rag.llm_engine.structured_responses = [
        {"action": "search", "content": "repeat"},
        {"action": "search", "content": "repeat"}
    ]
    
    # Need to mock search to return something so it doesn't break on 'no new docs' first
    mock_chunk = MagicMock(spec=KnowledgeChunk)
    mock_chunk.id = "doc_1"
    mock_chunk.content = "c"
    mock_chunk.chunk_metadata = {"source_id": "s"}
    mock_result = MagicMock()
    mock_result.all.return_value = [(mock_chunk, 0.1)]
    db.execute = AsyncMock(return_value=mock_result)
    
    content, sources = await rag.generate_response(db, "query", [])
    assert content == "INSUFFICIENT_DOCUMENTATION"
    assert len(rag.llm_engine.structured_responses) == 0

@pytest.mark.asyncio
async def test_agentic_rag_insufficient():
    rag = _make_rag_test_instance()
    db = AsyncMock(spec=AsyncSession)
    rag.llm_engine.structured_responses = [
        {"action": "insufficient", "content": "I don't know"}
    ]
    
    content, sources = await rag.generate_response(db, "query", [])
    assert content == "INSUFFICIENT_DOCUMENTATION"

@pytest.mark.asyncio
async def test_add_documents_strips_null_bytes():
    rag = _make_rag_test_instance()
    db = AsyncMock(spec=AsyncSession)
    
    # Chunk with null bytes
    chunk_with_null = "This is a chunk with a null byte \x00 in the middle and it must be fifty characters long."
    chunks = [chunk_with_null]
    
    await rag.add_documents(db, "sid", "title", chunks)
    
    # Verify the cleaned chunk was added
    added_chunk = db.add_all.call_args[0][0][0]
    assert "\x00" not in added_chunk.content
    assert "null byte  in the middle" in added_chunk.content

@pytest.mark.asyncio
async def test_process_query_empty():
    rag = _make_rag_test_instance()
    db = AsyncMock(spec=AsyncSession)
    
    mock_result = MagicMock()
    mock_result.all.return_value = []
    db.execute = AsyncMock(return_value=mock_result)
    
    result = await rag.process_query(db, "query")
    assert "couldn't find relevant information" in result["response"]
    assert result["action"] == "escalated"
