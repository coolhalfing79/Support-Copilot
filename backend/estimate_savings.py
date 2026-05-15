"""Estimate token/chunk savings across all existing sources."""
from utils.content_cleaner import clean_page
from utils.text_splitter import TextSplitter, _is_quality_chunk

import chromadb
from config.settings import get_settings

settings = get_settings()
client = chromadb.HttpClient(host=settings.CHROMA_HOST, port=settings.CHROMA_PORT)
collection = client.get_collection(settings.CHROMA_COLLECTION)

all_data = collection.get(include=["documents", "metadatas"])
docs = all_data.get("documents", [])
metas = all_data.get("metadatas", [])

total_raw_chars = sum(len(d) for d in docs)
total_raw_chunks = len(docs)

# Simulate cleaning each chunk (note: in production this happens at page level,
# but this gives us a directional estimate)
cleaned_docs = [clean_page(d) for d in docs]
quality_docs = [d for d in cleaned_docs if _is_quality_chunk(d)]

total_clean_chars = sum(len(d) for d in quality_docs)
total_clean_chunks = len(quality_docs)

print(f"Current state:")
print(f"  Total chunks:    {total_raw_chunks:,}")
print(f"  Total chars:     {total_raw_chars:,}")
print(f"  ~Embedding tokens: {total_raw_chars // 4:,}")
print()
print(f"After cleaning + filtering:")
print(f"  Total chunks:    {total_clean_chunks:,}")
print(f"  Total chars:     {total_clean_chars:,}")
print(f"  ~Embedding tokens: {total_clean_chars // 4:,}")
print()
print(f"Savings:")
print(f"  Chunks reduced:   {total_raw_chunks - total_clean_chunks:,} ({(1-total_clean_chunks/total_raw_chunks)*100:.0f}%)")
print(f"  Chars reduced:    {total_raw_chars - total_clean_chars:,} ({(1-total_clean_chars/total_raw_chars)*100:.0f}%)")
print(f"  Token savings:    ~{(total_raw_chars - total_clean_chars) // 4:,} tokens")
