import asyncio
import logging
import traceback
import sys

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
sys.path.insert(0, ".")

from utils.web_scraper import WebScraper
from utils.text_splitter import TextSplitter
from ai.rag_pipeline import get_rag_engine


async def test():
    url = "https://docs.oracle.com/javase/8/docs/api/"

    # Step 1: Crawl
    print("\n--- Step 1: Crawling ---")
    scraper = WebScraper()
    pages = await scraper.crawl_website(url, max_pages=200)
    print(f"Crawled {len(pages)} pages")

    # Step 2: Chunk
    print("\n--- Step 2: Chunking ---")
    splitter = TextSplitter()
    chunks = []
    for p in pages:
        chunks.extend(splitter.split_text(p))
    print(f"Total chunks: {len(chunks)}")

    # Step 3: Embed + store
    print("\n--- Step 3: Embedding ---")
    try:
        rag = get_rag_engine()
        n = await rag.add_documents(
            source_id="test-source",
            source_title="Java 8 API",
            chunks=chunks,
        )
        print(f"\n=== SUCCESS: stored {n} chunks ===")
    except Exception:
        traceback.print_exc()


if __name__ == "__main__":
    asyncio.run(test())
