"""Check quality filter impact on ALL sources, not just Java."""
from utils.text_splitter import _is_quality_chunk

import chromadb
from config.settings import get_settings

settings = get_settings()
client = chromadb.HttpClient(host=settings.CHROMA_HOST, port=settings.CHROMA_PORT)
collection = client.get_collection(settings.CHROMA_COLLECTION)

all_data = collection.get(include=["documents", "metadatas"])
docs = all_data.get("documents", [])
metas = all_data.get("metadatas", [])

# Group by source
sources = {}
for i in range(len(docs)):
    sid = metas[i].get("source_title", "?") if metas[i] else "?"
    if sid not in sources:
        sources[sid] = {"total": 0, "pass": 0, "reject": 0}
    sources[sid]["total"] += 1
    if _is_quality_chunk(docs[i]):
        sources[sid]["pass"] += 1
    else:
        sources[sid]["reject"] += 1

print(f"{'Source':<40} {'Total':>6} {'Pass':>6} {'Reject':>6} {'Reject%':>8}")
print("-" * 70)
for sid, data in sorted(sources.items(), key=lambda x: x[1]["total"], reverse=True):
    pct = data["reject"] / data["total"] * 100 if data["total"] else 0
    print(f"{sid[:40]:<40} {data['total']:>6} {data['pass']:>6} {data['reject']:>6} {pct:>7.1f}%")
