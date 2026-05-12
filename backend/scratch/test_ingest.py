import asyncio
import logging
import traceback

# Show ALL logs
logging.basicConfig(level=logging.DEBUG)

from config.database import async_session_factory
from sqlalchemy import select
from models.knowledge_source import KnowledgeSource
from utils.web_scraper import WebScraper
from utils.text_splitter import TextSplitter
from ai.rag_pipeline import get_rag_engine


async def test_ingest():
    async with async_session_factory() as db:
        stmt = select(KnowledgeSource).where(KnowledgeSource.status == 'error')
        result = await db.execute(stmt)
        source = result.scalars().first()

        if not source:
            print("No source in error state.")
            return

        print(f"\n=== Source: {source.id} | URL: {source.url} | max_pages: {source.max_pages} ===\n")
        print(f"source_type raw value: {source.source_type!r}")
        
        # Check the source_type comparison
        print(f"source_type == 'web_page': {source.source_type == 'web_page'}")
        print(f"getattr check: {getattr(source, 'source_type', None)}")
        
        # Step 1: Crawl
        scraper = WebScraper()
        try:
            print("\n--- Step 1: Crawling ---")
            pages = await scraper.crawl_website(source.url, max_pages=source.max_pages)
            print(f"Crawled {len(pages)} pages")
        except Exception:
            traceback.print_exc()
            return

        # Step 2: Chunk
        try:
            print("\n--- Step 2: Chunking ---")
            splitter = TextSplitter()
            chunks = []
            for page_content in pages:
                chunks.extend(splitter.split_text(page_content))
            print(f"Total chunks: {len(chunks)}")
        except Exception:
            traceback.print_exc()
            return

        # Step 3: Embed + store
        try:
            print("\n--- Step 3: Embedding + Storing ---")
            rag = get_rag_engine()
            chunk_count = await rag.add_documents(
                source_id=str(source.id),
                source_title=source.title or source.url,
                chunks=chunks,
            )
            print(f"Stored {chunk_count} chunks in ChromaDB")
        except Exception:
            traceback.print_exc()
            return

        print("\n=== SUCCESS ===")


if __name__ == '__main__':
    asyncio.run(test_ingest())
