"""Inspect what's actually stored in ChromaDB for the Javaaa source."""
from ai.chroma_utils import get_chroma_client
from config.settings import get_settings

settings = get_settings()
client = get_chroma_client()
collection = client.get_collection(settings.CHROMA_COLLECTION)

# Get all documents
all_data = collection.get(include=["documents", "metadatas"])
ids = all_data.get("ids", [])
docs = all_data.get("documents", [])
metas = all_data.get("metadatas", [])

print(f"Total chunks in ChromaDB: {len(ids)}")
print()

# Group by source
sources = {}
for i in range(len(ids)):
    sid = metas[i].get("source_id", "unknown") if metas[i] else "unknown"
    title = metas[i].get("source_title", "?") if metas[i] else "?"
    if sid not in sources:
        sources[sid] = {"title": title, "chunks": []}
    sources[sid]["chunks"].append(docs[i])

for sid, data in sources.items():
    print(f"=== Source: {data['title']} (id={sid}) ===")
    print(f"    Chunks: {len(data['chunks'])}")
    for j, chunk in enumerate(data['chunks'][:3]):
        preview = chunk[:200].replace('\n', ' ')
        print(f"    [{j}] {preview}...")
    print()
