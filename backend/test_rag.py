import asyncio
from ai.rag_pipeline import get_rag_engine

async def main():
    rag = get_rag_engine()
    results = await rag.search("What are the steps to reconfigure the Mail Server after completing the installation of IBM Verify Identity Governance - Container?", top_k=5)
    for r in results:
        print(r['similarity'], r['content'][:200])

if __name__ == "__main__":
    asyncio.run(main())
