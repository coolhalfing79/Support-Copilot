import asyncio
import logging

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")

import sys
sys.path.insert(0, ".")

from utils.web_scraper import WebScraper

async def test():
    scraper = WebScraper()
    # Test with just 10 pages to verify it works
    results = await scraper.crawl_website("https://docs.oracle.com/javase/8/docs/api/", max_pages=10)
    print(f"\n=== Got {len(results)} pages ===")
    for i, text in enumerate(results):
        print(f"  Page {i+1}: {len(text)} chars | preview: {text[:80]}...")

if __name__ == "__main__":
    asyncio.run(test())
