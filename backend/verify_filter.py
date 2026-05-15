"""Verify the new quality filter would fix the Java data issue."""
from utils.text_splitter import TextSplitter, _is_quality_chunk

import chromadb
from config.settings import get_settings

settings = get_settings()
client = chromadb.HttpClient(host=settings.CHROMA_HOST, port=settings.CHROMA_PORT)
collection = client.get_collection(settings.CHROMA_COLLECTION)

# Get all Java chunks
all_data = collection.get(
    where={"source_id": "8b97b458-2e9b-4951-a6a5-43a0f64e8d4c"},
    include=["documents"]
)
docs = all_data.get("documents", [])

passed = 0
rejected = 0
for doc in docs:
    if _is_quality_chunk(doc):
        passed += 1
    else:
        rejected += 1

print(f"Java chunks: {len(docs)} total")
print(f"  Would PASS quality filter:  {passed}")
print(f"  Would be REJECTED:          {rejected}")
print(f"  Rejection rate:             {rejected/len(docs)*100:.1f}%")

print("\n--- Chunks that PASS (showing first 3): ---")
count = 0
for doc in docs:
    if _is_quality_chunk(doc) and count < 3:
        print(f"\n[PASS] {doc[:200]}...")
        count += 1
