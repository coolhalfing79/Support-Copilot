"""ChromaDB integration utilities."""

from functools import lru_cache
from pathlib import Path
from typing import Any

import chromadb

from config.settings import get_settings


@lru_cache(maxsize=1)
def get_chroma_client() -> Any:
    """Return an embedded persistent Chroma client."""
    settings = get_settings()
    Path(settings.CHROMA_PATH).expanduser().mkdir(parents=True, exist_ok=True)
    return chromadb.PersistentClient(path=settings.CHROMA_PATH)


def get_collection(client: Any, name: str = "knowledge_chunks") -> Any:
    """Get or create Chroma collection."""
    return client.get_or_create_collection(
        name=name,
        metadata={"hnsw:space": "cosine"},
    )


def reset_collection(client: Any, name: str = "knowledge_chunks") -> Any:
    """Delete and recreate collection."""
    try:
        client.delete_collection(name)
    except Exception:
        pass
    return get_collection(client, name=name)


def get_collection_stats(collection) -> dict[str, int | str]:
    """Return basic collection stats."""
    return {"name": collection.name, "count": collection.count()}
