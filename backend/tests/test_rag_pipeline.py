import pytest
import asyncio
from unittest.mock import AsyncMock, patch, MagicMock
from ai.rag_pipeline import RAGEngine

class _FakeEmbeddingEngine:
    async def embed_documents(self, documents: list[str]) -> list[list[float]]:
        return [[0.1] * 768 for _ in documents]

    async def embed_query(self, _query: str) -> list[float]:
        return [0.1] * 768

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

class _FakeCollection:
    def __init__(self):
        self.upsert_calls = []
        self.query_calls = []
        self.query_count = 0
        self.results = {
            "ids": [["doc_1"]],
            "documents": [["Relevant context content"]],
            "metadatas": [[{"source_id": "src1", "source_title": "Title", "source_url": "http://src1"}]],
            "distances": [[0.1]],
        }

    def upsert(self, **kwargs):
        self.upsert_calls.append(kwargs)

    def query(self, **kwargs):
        self.query_calls.append(kwargs)
        self.query_count += 1
        
        # If the test set results to be empty, respect that
        if self.results.get("ids") == [[]]:
            return self.results
            
        # Return a new ID each time to avoid 'no new docs' break in agentic loop
        res = self.results.copy()
        res["ids"] = [[f"doc_{self.query_count}"]]
        res["documents"] = [["Relevant context content"]]
        res["metadatas"] = [[{
            "source_id": f"src{self.query_count}", 
            "source_title": f"Title {self.query_count}",
            "source_url": f"http://src{self.query_count}"
        }]]
        res["distances"] = [[0.1]]
        return res

def _make_rag_test_instance():
    # Bypass __init__ to avoid real connections
    rag = object.__new__(RAGEngine)
    rag.top_k = 3
    rag.max_hops = 3
    rag.batch_size = 100
    rag.embedding_engine = _FakeEmbeddingEngine()
    rag.llm_engine = _FakeLLMEngine()
    rag.collection = _FakeCollection()
    return rag

@pytest.mark.asyncio
async def test_add_documents_batching():
    rag = _make_rag_test_instance()
    rag.batch_size = 2 # Small batch size to test batching logic
    # Use longer UNIQUE chunks to pass the 50-char filter and avoid deduplication
    chunks = [f"Unique chunk {i}: This is a long enough chunk to pass the minimum length filter of fifty characters." for i in range(5)]
    
    added = await rag.add_documents("sid", "title", chunks, source_url="http://url")
    
    assert added == 5
    assert len(rag.collection.upsert_calls) == 3 # 2 + 2 + 1
    # Check that IDs start with the prefix
    assert rag.collection.upsert_calls[0]["ids"][0].startswith("sid_chunk_")
    assert rag.collection.upsert_calls[0]["metadatas"][0]["source_url"] == "http://url"

@pytest.mark.asyncio
async def test_search_similarity():
    rag = _make_rag_test_instance()
    results = await rag.search("test query")
    
    assert len(results) == 1
    assert results[0]["id"] == "doc_1"
    assert results[0]["similarity"] == 0.9 # 1 - 0.1

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
    
    # Setup scenario:
    # 1. First hop: LLM decides it needs to search more.
    # 2. Second hop: LLM provides the final answer.
    rag.llm_engine.structured_responses = [
        {"action": "search", "content": "more details about X"},
        {"action": "answer", "content": "The final answer is Y"}
    ]
    
    # Mock search to return something different for the second search if needed
    # (Actually it will just use whatever the collection mock returns)
    
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
    content, sources = await rag.generate_response("initial query", initial_docs)
    
    assert content == "The final answer is Y"
    # Sources should include both the initial context and the new search results
    source_ids = [s["source_id"] for s in sources]
    assert "initial_src" in source_ids # from d1
    assert "src1" in source_ids # from doc_1

@pytest.mark.asyncio
async def test_agentic_rag_max_hops():
    rag = _make_rag_test_instance()
    # Always return search action to exhaust hops
    rag.llm_engine.structured_responses = [
        {"action": "search", "content": f"query {i}"} for i in range(10)
    ]
    
    content, sources = await rag.generate_response("query", [])
    assert content == "INSUFFICIENT_DOCUMENTATION"
    # It should have called search at most max_hops times
    # In rag_pipeline.py, max_hops is 3. 
    # Hop 0: query 0
    # Hop 1: query 1
    # Hop 2: query 2
    # After Hop 2, loop ends or next hop would be 4th.
    assert len(rag.llm_engine.structured_responses) == 10 - 3

@pytest.mark.asyncio
async def test_agentic_rag_duplicate_search():
    rag = _make_rag_test_instance()
    # Return same search query twice
    rag.llm_engine.structured_responses = [
        {"action": "search", "content": "repeat"},
        {"action": "search", "content": "repeat"}
    ]
    
    content, sources = await rag.generate_response("query", [])
    assert content == "INSUFFICIENT_DOCUMENTATION"
    # Should have broken after the second 'repeat' was detected as already in history
    assert len(rag.llm_engine.structured_responses) == 0

@pytest.mark.asyncio
async def test_agentic_rag_insufficient():
    rag = _make_rag_test_instance()
    rag.llm_engine.structured_responses = [
        {"action": "insufficient", "content": "I don't know"}
    ]
    
    content, sources = await rag.generate_response("query", [])
    assert content == "INSUFFICIENT_DOCUMENTATION"

@pytest.mark.asyncio
async def test_add_documents_duplicate_handling():
    rag = _make_rag_test_instance()
    # Identical chunks should result in identical IDs and be deduplicated
    chunk_text = "This is a long enough chunk to pass the minimum length filter of fifty characters."
    chunks = [chunk_text, chunk_text, "Another unique chunk that also passes the fifty character length filter."]
    
    added = await rag.add_documents("sid", "title", chunks)
    
    assert added == 2 # 1 unique + 1 unique
    assert len(rag.collection.upsert_calls) == 1
    assert len(rag.collection.upsert_calls[0]["ids"]) == 2

@pytest.mark.asyncio
async def test_process_query_empty():
    rag = _make_rag_test_instance()
    rag.collection.results = {"ids": [[]], "documents": [[]], "metadatas": [[]], "distances": [[]]}
    
    result = await rag.process_query("query")
    assert "couldn't find relevant information" in result["response"]
    assert result["action"] == "escalated"
