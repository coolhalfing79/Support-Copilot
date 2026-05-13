# Person 2 — AI/ML Engine & RAG Pipeline

## Role: Backend Engineer (AI Core)

---

## Task Overview

Build the AI/ML core of the system including Google Gemini API integration, embedding generation, RAG (Retrieval-Augmented Generation) pipeline, text splitting, and ChromaDB vector database integration. This is the brain of the copilot that powers intelligent responses.

**Priority:** CRITICAL — Core AI functionality
**Start Time:** Hour 2 (after Person 1 provides database models)
**Primary Completion Target:** Hours 6-10

---

## Tech Stack

| Component | Technology | Version |
|-----------|-----------|---------|
| LLM | Google Gemini API (gemini-2.0-flash) | Latest |
| Embeddings | Gemini Embedding API (text-embedding-004) | Latest |
| RAG Framework | LangChain | 0.1.x |
| Vector Database | ChromaDB | 0.4.x |
| Text Splitting | LangChain Text Splitters | Included in langchain |
| HTTP Client | httpx | 0.26+ |

---

## Detailed Task Breakdown

### 2.1 Directory Structure

Create the following structure under `/backend/ai`:

backend/ai/
├── __init__.py
├── llm_engine.py          # Gemini LLM interface + singleton
├── embedding_engine.py    # Embedding generation + singleton
├── rag_pipeline.py        # RAG search + generate pipeline + singleton
├── prompts.py             # All system prompts
├── chroma_utils.py        # ChromaDB client factory (shared)
└── utils.py               # Completeness heuristic + text helpers
```

### 2.2 Google Gemini API Integration

**File:** `backend/ai/llm_engine.py`

```python
"""
Google Gemini LLM Engine
Handles all LLM inference through Gemini API.
"""
import json
from typing import Any, AsyncIterator
from langchain_core.messages import AIMessage, HumanMessage, SystemMessage
from langchain_google_genai import ChatGoogleGenerativeAI
from tenacity import retry, retry_if_exception_type, stop_after_attempt, wait_exponential

from config.settings import get_settings

_llm_instance: "LLMEngine | None" = None

class LLMEngine:
    """Engine for Google Gemini LLM inference."""
    
    def __init__(self):
        settings = get_settings()
        self.model = ChatGoogleGenerativeAI(
            model=settings.GEMINI_MODEL,
            google_api_key=settings.GEMINI_API_KEY,
            temperature=0.3,  # Low temperature for consistent responses
            max_tokens=1024,
        )
    
    @retry(stop=stop_after_attempt(3), wait=wait_exponential(min=2, max=10),
           retry=retry_if_exception_type(Exception), reraise=True)
    async def generate_response(
        self,
        messages: list[dict],
        system_prompt: str | None = None,
    ) -> str:
        """Generate response. Auto-retries 3x on Gemini API failures."""
        lc: list = []
        if system_prompt:
            lc.append(SystemMessage(content=system_prompt))
        for m in messages:
            role, content = m["role"], m["content"]
            if role == "user":
                lc.append(HumanMessage(content=content))
            elif role == "assistant":
                lc.append(AIMessage(content=content))
            else:
                lc.append(SystemMessage(content=content))
        resp = await self.model.ainvoke(lc)
        return resp.content

    async def generate_response_stream(
        self,
        messages: list[dict],
        system_prompt: str | None = None,
    ) -> AsyncIterator[str]:
        """[ENHANCEMENT] Stream tokens — Person 4's WebSocket handler consumes this."""
        lc: list = []
        if system_prompt:
            lc.append(SystemMessage(content=system_prompt))
        for m in messages:
            role, content = m["role"], m["content"]
            if role == "user":
                lc.append(HumanMessage(content=content))
            elif role == "assistant":
                lc.append(AIMessage(content=content))
            else:
                lc.append(SystemMessage(content=content))
        async for chunk in self.model.astream(lc):
            if chunk.content:
                yield chunk.content

    @retry(stop=stop_after_attempt(3), wait=wait_exponential(min=2, max=10),
           retry=retry_if_exception_type(Exception), reraise=True)
    async def generate_structured_response(
        self,
        prompt: str,
        schema_hint: str = "",
    ) -> dict[str, Any]:
        """[FIX] Implemented — returns parsed JSON dict for ticket extraction (Person 3).

        Falls back to {} on JSON parse failure. Pass schema_hint to guide the model.
        """
        full_prompt = (
            f"{prompt}\n\n"
            f"Respond with valid JSON ONLY — no markdown, no explanation.\n"
            f"Expected fields: {schema_hint}"
        )
        raw = await self.generate_response([{"role": "user", "content": full_prompt}])
        cleaned = raw.strip().removeprefix("```json").removeprefix("```").removesuffix("```").strip()
        try:
            return json.loads(cleaned)
        except json.JSONDecodeError:
            return {}
    
    async def evaluate_relevance(
        self,
        query: str,
        context: str,
    ) -> float:
        """
        Evaluate how relevant the context is to the query.
        Returns a score between 0 and 1.
        
        Args:
            query: User's question
            context: Retrieved document chunk
            
        Returns:
            Relevance score (0.0 to 1.0)
        """
        prompt = f"""
        Evaluate how relevant the following context is to answering the user's query.
        
        Query: {query}
        Context: {context}
        
        Rate on a scale of 1-5:
        1 = Completely irrelevant
        2 = Slightly relevant
        3 = Moderately relevant
        4 = Highly relevant
        5 = Perfectly answers the query
        
        Return ONLY the number (1-5), nothing else.
        """
        response = await self.generate_response([{"role": "user", "content": prompt}])
        try:
            score = int(response.strip())
            return max(1, min(5, score)) / 5.0  # Normalize to 0-1
        except ValueError:
            return 0.5  # Default to neutral if parsing fails


def get_llm_engine() -> LLMEngine:
    """[ENHANCEMENT] Module-level singleton — avoids re-creating the model per request."""
    global _llm_instance
    if _llm_instance is None:
        _llm_instance = LLMEngine()
    return _llm_instance
```

### 2.3 Embedding Engine

**File:** `backend/ai/embedding_engine.py`

```python
"""
Embedding Engine
Handles text embedding generation using Gemini Embedding API.
"""
from langchain_google_genai import GoogleGenerativeAIEmbeddings

from config.settings import get_settings

_emb_instance: "EmbeddingEngine | None" = None

class EmbeddingEngine:
    """Engine for generating text embeddings."""
    
    def __init__(self):
        settings = get_settings()
        self.embeddings = GoogleGenerativeAIEmbeddings(
            model=settings.GEMINI_EMBEDDING_MODEL,
            google_api_key=settings.GEMINI_API_KEY,
        )
    
    async def embed_query(self, text: str) -> List[float]:
        """
        Generate embedding for a query string.
        
        Args:
            text: Query text
            
        Returns:
            Embedding vector (list of floats)
        """
        return await self.embeddings.aembed_query(text)
    
    async def embed_documents(self, documents: List[str]) -> List[List[float]]:
        """
        Generate embeddings for multiple documents.
        
        Args:
            documents: List of document texts
            
        Returns:
            List of embedding vectors
        """
        return await self.embeddings.aembed_documents(documents)
    
    def get_embedding_dimension(self) -> int:
        """Returns 768 — fixed dimension for text-embedding-004."""
        return 768


def get_embedding_engine() -> EmbeddingEngine:
    """[ENHANCEMENT] Module-level singleton."""
    global _emb_instance
    if _emb_instance is None:
        _emb_instance = EmbeddingEngine()
    return _emb_instance
```

### 2.4 Text Splitter

**File:** `backend/utils/text_splitter.py`

```python
"""
Text Splitter Utility
Handles document chunking for RAG pipeline.
"""
from langchain_text_splitters import RecursiveCharacterTextSplitter  # [FIX] separate pkg in LangChain 0.2+
from typing import List

class TextSplitter:
    """Utility for splitting text into chunks for embedding."""
    
    def __init__(
        self,
        chunk_size: int = 500,
        chunk_overlap: int = 100,
    ):
        """
        Initialize text splitter.
        
        Args:
            chunk_size: Maximum tokens per chunk
            chunk_overlap: Number of overlapping tokens between chunks
        """
        self.splitter = RecursiveCharacterTextSplitter(
            chunk_size=chunk_size,
            chunk_overlap=chunk_overlap,
            length_function=len,
            separators=["\n\n", "\n", ". ", " ", ""],
        )
    
    def split_text(self, text: str) -> List[str]:
        """
        Split text into chunks.
        
        Args:
            text: Input text to split
            
        Returns:
            List of text chunks
        """
        return self.splitter.split_text(text)
    
    def create_chunks_with_metadata(
        self,
        text: str,
        source_id: str,
        source_title: str = "",
    ) -> List[dict]:
        """
        Split text and attach metadata to each chunk.
        
        Args:
            text: Input text
            source_id: ID of the knowledge source
            source_title: Title of the knowledge source
            
        Returns:
            List of dicts with 'content' and 'metadata' keys
        """
        chunks = self.split_text(text)
        result = []
        for i, chunk in enumerate(chunks):
            result.append({
                "content": chunk,
                "metadata": {
                    "source_id": source_id,
                    "source_title": source_title,
                    "chunk_index": i,
                    "total_chunks": len(chunks),
                },
            })
        return result
```

### 2.5 System Prompts

**File:** `backend/ai/prompts.py`

```python
"""
System Prompts
Defines all system prompts used throughout the application.
"""

CHAT_SYSTEM_PROMPT = """
You are an AI-powered L2 Support Copilot. Your job is to help end users resolve 
their technical issues by searching through known documentation and providing 
accurate, helpful responses.

Guidelines:
1. Always be professional and helpful
2. If you find relevant information in the knowledge base, provide a clear, 
   step-by-step solution
3. Cite your sources when providing answers
4. If you cannot find a definitive answer, acknowledge this and explain what 
   you found that was partially relevant
5. If the user's question is vague, ask clarifying questions
6. Do not make up information — only provide answers based on retrieved knowledge
7. Keep responses concise but complete
"""

CONFIDENCE_EVALUATION_PROMPT = """
Evaluate the confidence level of the following response to a user query.

User Query: {query}
Retrieved Context: {context}
Generated Response: {response}

Provide a confidence score between 0 and 1, where:
- 0.0-0.39: Low confidence (need more information or clarification)
- 0.40-0.74: Medium confidence (partial match found)
- 0.75-1.0: High confidence (strong match found)

Return ONLY the score as a decimal number, nothing else.
"""

TICKET_CREATION_PROMPT = """
Extract the following information from the conversation to create a support ticket:

1. Summary: A concise one-line summary of the issue
2. Severity: low, medium, high, or critical
3. Product Module: The component/module affected
4. Environment: Where the issue occurs (if mentioned)
5. Error Messages: Any specific error codes or messages
6. Steps to Reproduce: What the user was doing when the issue occurred
7. Troubleshooting Attempted: Any steps the user already tried
8. Conversation Summary: A brief summary of the entire conversation

Return as a JSON object with these keys.
"""

CLARIFICATION_PROMPT = """
The user's question is too vague to provide an accurate answer. 
Ask 2-3 specific clarifying questions that will help narrow down the issue.

Focus on:
- Which product/module is affected
- What the exact error message is
- What environment they are in
- What they were trying to do when the issue occurred

Keep questions concise and specific.
"""
```

### 2.6 RAG Pipeline

**File:** `backend/ai/rag_pipeline.py`

```python
"""
RAG (Retrieval-Augmented Generation) Pipeline
Orchestrates retrieval from ChromaDB and generation with Gemini.
"""
from typing import Any

from config.settings import get_settings           # [FIX] was missing
from ai.embedding_engine import get_embedding_engine
from ai.llm_engine import get_llm_engine
from ai.chroma_utils import get_chroma_client, get_collection  # [FIX] use factory
from ai.prompts import CHAT_SYSTEM_PROMPT

_rag_instance: "RAGEngine | None" = None

class RAGEngine:
    """
    RAG Pipeline Engine.
    Combines retrieval from ChromaDB with generation from Gemini.
    """
    
    def __init__(self, top_k: int = 5) -> None:
        s = get_settings()
        self.top_k = top_k
        self.embedding_engine = get_embedding_engine()  # singleton
        self.llm_engine = get_llm_engine()              # singleton
        client = get_chroma_client()
        self.collection = get_collection(client, s.CHROMA_COLLECTION)
    
    async def add_documents(
        self,
        source_id: str,
        source_title: str,
        chunks: List[str],
    ) -> int:
        """
        Add document chunks to ChromaDB.
        
        Args:
            source_id: Knowledge source ID
            source_title: Title of the source
            chunks: List of text chunks
            
        Returns:
            Number of chunks added
        """
        if not chunks:
            return 0
        
        # Generate embeddings
        embeddings = await self.embedding_engine.embed_documents(chunks)
        
        # Prepare metadata
        metadatas = [
            {
                "source_id": source_id,
                "source_title": source_title,
                "chunk_index": i,
                "total_chunks": len(chunks),
            }
            for i in range(len(chunks))
        ]
        
        # Add to ChromaDB
        ids = [f"{source_id}_chunk_{i}" for i in range(len(chunks))]
        self.collection.add(
            documents=chunks,
            embeddings=embeddings,
            metadatas=metadatas,
            ids=ids,
        )
        
        return len(chunks)
    
    async def search(
        self,
        query: str,
        top_k: Optional[int] = None,
        filters: Optional[dict] = None,
    ) -> List[Dict[str, Any]]:
        """
        Search the knowledge base for relevant documents.
        
        Args:
            query: Search query
            top_k: Number of results to return
            filters: Optional metadata filters
            
        Returns:
            List of matching documents with scores
        """
        k = top_k or self.top_k
        
        # Generate query embedding
        query_embedding = await self.embedding_engine.embed_query(query)
        
        # Search ChromaDB
        results = self.collection.query(
            query_embeddings=[query_embedding],
            n_results=k,
            where=filters,
        )
        
        # Format results
        formatted_results = []
        for i in range(len(results["ids"][0])):
            formatted_results.append({
                "id": results["ids"][0][i],
                "content": results["documents"][0][i],
                "metadata": results["metadatas"][0][i],
                "distance": results["distances"][0][i],
                "similarity": 1 - results["distances"][0][i],  # Convert to similarity
            })
        
        return formatted_results
    
    async def generate_response(
        self,
        query: str,
        context_docs: List[Dict[str, Any]],
    ) -> Tuple[str, List[Dict[str, Any]]]:
        """
        Generate a response using retrieved context.
        
        Args:
            query: User's question
            context_docs: Retrieved documents from ChromaDB
            
        Returns:
            Tuple of (response, sources)
        """
        # Build context from retrieved documents
        context = "\n\n".join([doc["content"] for doc in context_docs])
        
        # Build messages for LLM
        messages = [
            {"role": "system", "content": CHAT_SYSTEM_PROMPT},
            {
                "role": "user",
                "content": f"""
                Based on the following documentation, answer the user's question.
                
                Documentation:
                {context}
                
                User Question: {query}
                
                Provide a clear, helpful answer. If the documentation doesn't contain 
                enough information to fully answer the question, say so and provide 
                whatever partial information you can.
                """
            },
        ]
        
        # Generate response
        response = await self.llm_engine.generate_response(messages)
        
        # Format sources
        sources = []
        for doc in context_docs:
            sources.append({
                "source_id": doc["metadata"].get("source_id", ""),
                "title": doc["metadata"].get("source_title", ""),
                "chunk_excerpt": doc["content"][:200] + "..." if len(doc["content"]) > 200 else doc["content"],
            })
        
        return response, sources
    
    async def process_query(self, query: str) -> Dict[str, Any]:
        """
        Full RAG pipeline: search + generate.
        
        Args:
            query: User's question
            
        Returns:
            Dict with response, sources, and metadata
        """
        # Step 1: Search knowledge base
        context_docs = await self.search(query)
        
        if not context_docs:
            return {
                "response": "I couldn't find relevant information in the knowledge base.",
                "sources": [],
                "action": "escalated",
                "retrieval_score": 0.0,
                "retrieved_chunks": [],   # [ENHANCEMENT] Person 3 uses these for completeness score
            }

        avg_similarity = sum(doc["similarity"] for doc in context_docs) / len(context_docs)
        response, sources = await self.generate_response(query, context_docs)

        return {
            "response": response,
            "sources": sources,
            "action": "resolve",
            "retrieval_score": avg_similarity,             # [ENHANCEMENT] feeds confidence engine
            "retrieved_chunks": [d["content"] for d in context_docs],  # [ENHANCEMENT] feeds completeness check
        }


def get_rag_engine() -> "RAGEngine":
    """[ENHANCEMENT] Module-level singleton."""
    global _rag_instance
    if _rag_instance is None:
        _rag_instance = RAGEngine()
    return _rag_instance
```

### 2.7 ChromaDB Integration Utilities

**File:** `backend/ai/chroma_utils.py`

```python
"""
ChromaDB Integration Utilities
Helper functions for ChromaDB operations.
"""
import chromadb
from config.settings import get_settings

def get_chroma_client() -> chromadb.HttpClient:
    """Get ChromaDB HTTP client."""
    settings = get_settings()
    return chromadb.HttpClient(
        host=settings.CHROMA_HOST,
        port=settings.CHROMA_PORT,
    )

def get_collection(client: chromadb.HttpClient, name: str = "knowledge_chunks"):
    """Get or create a ChromaDB collection."""
    return client.get_or_create_collection(
        name=name,
        metadata={"hnsw:space": "cosine"},
    )

def reset_collection(client: chromadb.HttpClient, name: str = "knowledge_chunks"):
    """Reset (delete and recreate) a ChromaDB collection."""
    client.delete_collection(name)
    return client.get_or_create_collection(
        name=name,
        metadata={"hnsw:space": "cosine"},
    )

def get_collection_stats(collection) -> dict:
    """Get statistics about a ChromaDB collection."""
    count = collection.count()
    return {
        "name": collection.name,
        "count": count,
    }
```

### 2.8 AI Utilities (Completeness Heuristic)

**File:** `backend/ai/utils.py`

> [ENHANCEMENT] Used by Person 3's confidence engine to compute the `completeness_score` component.

```python
"""AI utilities — completeness heuristic for confidence scoring."""
import re

_ERROR_PATTERNS = re.compile(r"(error|err_|exception|traceback|\d{3,})", re.I)
_STEP_PATTERNS = re.compile(r"(step \d|\d+\.\s|first|then|finally|navigate|click|run|execute)", re.I)
_RESOLUTION_PATTERNS = re.compile(r"(solution|resolve|fix|workaround|restart|reinstall|update|configure)", re.I)


def compute_completeness_score(chunks: list[str]) -> float:
    """Heuristic: does retrieved content contain error codes, steps, and resolution keywords?

    Returns 0.0–1.0. Person 3 uses this as the third factor in the confidence formula:
        confidence = 0.40 * retrieval_score + 0.35 * relevance_score + 0.25 * completeness_score
    """
    if not chunks:
        return 0.0
    combined = " ".join(chunks)
    has_errors = bool(_ERROR_PATTERNS.search(combined))
    has_steps = bool(_STEP_PATTERNS.search(combined))
    has_resolution = bool(_RESOLUTION_PATTERNS.search(combined))
    score = (has_errors + has_steps + has_resolution) / 3.0
    return round(score, 4)


def truncate_excerpt(text: str, max_chars: int = 200) -> str:
    """Return a clean excerpt for the `chunk_excerpt` field in API responses."""
    return text[:max_chars].rstrip() + "..." if len(text) > max_chars else text
```

---

### 2.9 Requirements Update

Add these to `backend/requirements.txt` if not already present:

```
# AI/ML core
langchain>=0.2.0
langchain-core>=0.2.0
langchain-google-genai>=1.0.0
langchain-community>=0.2.0
langchain-text-splitters>=0.2.0    # [FIX] separate package in LangChain 0.2+
google-generativeai>=0.7.0
tenacity>=8.2.3                    # [FIX] retry logic — was missing

# Vector Database
chromadb>=0.5.0
```

---

## Acceptance Criteria

- [ ] `LLMEngine.generate_response()` works with retry on rate-limit errors
- [ ] `LLMEngine.generate_response_stream()` yields tokens (for WebSocket)
- [ ] `LLMEngine.generate_structured_response()` returns parsed JSON dict
- [ ] `EmbeddingEngine` generates 768-dim embeddings
- [ ] `TextSplitter` splits into chunks (500 chars, 100 overlap)
- [ ] `RAGEngine.add_documents()` stores chunks in ChromaDB
- [ ] `RAGEngine.search()` returns results with `similarity` scores
- [ ] `RAGEngine.process_query()` returns `retrieval_score` + `retrieved_chunks`
- [ ] `compute_completeness_score()` in `ai/utils.py` returns 0.0–1.0
- [ ] All singletons (`get_llm_engine`, `get_embedding_engine`, `get_rag_engine`) work
- [ ] ChromaDB HttpClient connects to Docker Compose service
- [ ] All async functions use `await` correctly

---

## Error Handling Requirements

Implement retry logic with exponential backoff for Gemini API calls:

```python
from tenacity import retry, retry_if_exception_type, stop_after_attempt, wait_exponential

# Applied as a decorator on LLMEngine methods (see llm_engine.py)
@retry(
    stop=stop_after_attempt(3),
    wait=wait_exponential(min=2, max=10),
    retry=retry_if_exception_type(Exception),
    reraise=True,   # re-raise after all retries exhausted
)
async def call_gemini_api(prompt: str) -> str:
    # pattern used on generate_response / generate_structured_response
    ...
```

---

## Dependencies

| Dependency | Owner | Status |
|------------|-------|--------|
| Database models | Person 1 | Required for metadata storage |
| Settings | Person 1 | Required for API keys |
| ChromaDB | Person 8 | Required for vector storage |

## Deliverables To

| Recipient | What They Get |
|-----------|--------------|
| Person 3 | RAG engine, confidence scoring integration points |
| Person 4 | Embedding engine for analytics |
| Person 7 | Testable AI components |

---

## Tips for AI-Assisted Implementation

1. Start with `llm_engine.py` — test Gemini API connectivity first
2. Then build `embedding_engine.py` — verify embeddings are 768-dimensional
3. Build `text_splitter.py` — test with sample documents
4. Integrate with ChromaDB last — ensure it's running via Docker
5. Use LangChain's built-in abstractions to reduce boilerplate
6. Test with real documentation URLs from the demo scenario
7. Handle API key errors gracefully — they are the most common failure point
