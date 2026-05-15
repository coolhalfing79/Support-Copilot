"""Deep inspect Java chunks to see the data quality issue."""
import chromadb
from config.settings import get_settings

settings = get_settings()
client = chromadb.HttpClient(host=settings.CHROMA_HOST, port=settings.CHROMA_PORT)
collection = client.get_collection(settings.CHROMA_COLLECTION)

# Get Java chunks only
all_data = collection.get(
    where={"source_id": "8b97b458-2e9b-4951-a6a5-43a0f64e8d4c"},
    include=["documents", "metadatas"]
)
docs = all_data.get("documents", [])

# Classify chunks by content quality
nav_chunks = 0  # Just class lists, package names, navigation
content_chunks = 0  # Actual documentation with sentences
short_chunks = 0

for doc in docs:
    # Detect if this chunk has actual sentences (periods followed by spaces)
    sentences = len([s for s in doc.split('. ') if len(s) > 20])
    words = doc.split()
    has_prose = sentences >= 2
    is_short = len(doc) < 100
    
    # Detect class listing patterns
    is_class_list = (
        doc.count('\n') > 5 and
        any(p in doc for p in ['java.', 'javax.', 'org.']) and
        sentences < 2
    )
    
    if is_short:
        short_chunks += 1
    elif is_class_list or not has_prose:
        nav_chunks += 1
    else:
        content_chunks += 1

print(f"Java source: {len(docs)} total chunks")
print(f"  Navigation/class lists (low quality): {nav_chunks}")
print(f"  Actual documentation (good quality):  {content_chunks}")
print(f"  Too short (<100 chars):               {short_chunks}")
print()

# Show a few examples of each type
print("=== EXAMPLE NAV/CLASS LIST CHUNK ===")
for doc in docs:
    if doc.count('\n') > 5 and 'java.' in doc and len([s for s in doc.split('. ') if len(s) > 20]) < 2:
        print(doc[:400])
        break

print()
print("=== EXAMPLE GOOD CONTENT CHUNK ===")
for doc in docs:
    sentences = len([s for s in doc.split('. ') if len(s) > 20])
    if sentences >= 3 and 'java.' not in doc[:50]:
        print(doc[:400])
        break
