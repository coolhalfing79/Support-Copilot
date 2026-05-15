"""Simulate what the new pipeline would produce for Stripe docs (sample)."""
import asyncio
from utils.web_scraper import WebScraper
from utils.content_cleaner import clean_and_filter_pages, clean_page
from utils.text_splitter import TextSplitter

async def main():
    scraper = WebScraper()
    splitter = TextSplitter()
    
    # Test with a single Stripe page
    print("=== Fetching a single Stripe page ===")
    raw = await scraper.fetch_content("https://docs.stripe.com/payments/accept-a-payment")
    
    print(f"Raw Jina output: {len(raw)} chars")
    
    # Clean it
    cleaned = clean_page(raw)
    print(f"After cleaning:  {len(cleaned)} chars ({(1-len(cleaned)/len(raw))*100:.0f}% reduction)")
    
    # Chunk raw vs cleaned
    raw_chunks = splitter.splitter.split_text(raw)  # bypass quality filter
    clean_chunks = splitter.split_text(cleaned)       # with quality filter
    
    print(f"\nRaw chunks:     {len(raw_chunks)}")
    print(f"Clean chunks:   {len(clean_chunks)}")
    print(f"Chunk reduction: {(1-len(clean_chunks)/max(len(raw_chunks),1))*100:.0f}%")
    
    print("\n=== First clean chunk (preview): ===")
    if clean_chunks:
        print(clean_chunks[0][:300])
    
    print("\n=== First raw chunk for comparison: ===")
    if raw_chunks:
        print(raw_chunks[0][:300])

asyncio.run(main())
