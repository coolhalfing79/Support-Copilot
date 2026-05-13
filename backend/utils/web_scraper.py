"""
Web scraper utility for knowledge ingestion.

Fetches web pages and extracts clean text using httpx + BeautifulSoup.
"""

import asyncio
import logging
import re
from collections import deque
from urllib.parse import urldefrag, urljoin, urlparse

import httpx
from bs4 import BeautifulSoup

logger = logging.getLogger(__name__)


class WebScraper:
    """Fetches and cleans web content for knowledge ingestion."""

    def __init__(self, timeout: float = 30.0, polite_delay: float = 0.3) -> None:
        self.timeout = timeout
        self.polite_delay = polite_delay
        self.headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
        }

    async def fetch_content(self, url: str) -> str:
        """Fetch a URL and return cleaned text content using Jina AI Reader.

        Args:
            url: The URL to fetch.

        Returns:
            Cleaned plain-text (markdown) content.

        Raises:
            httpx.HTTPStatusError: On non-2xx responses.
        """
        async with httpx.AsyncClient(timeout=self.timeout, follow_redirects=True) as client:
            response = await client.get(f"https://r.jina.ai/{url}", headers=self.headers)
            if response.status_code != 200:
                logger.warning("Fetch failed for %s: Status %s", url, response.status_code)
            response.raise_for_status()
            return response.text

    # ------------------------------------------------------------------
    # Crawling functionality
    # ------------------------------------------------------------------

    async def crawl_website(self, start_url: str, max_pages: int = 200, max_concurrent: int = 5) -> list[str]:
        """Crawl a website recursively, restricted to the start_url path.

        Args:
            start_url: Root URL to start crawling from.
            max_pages: Maximum number of pages to fetch.
            max_concurrent: Maximum concurrent HTTP requests.

        Returns:
            List of cleaned text content strings, one per page.
        """
        parsed_start = urlparse(start_url)
        path = parsed_start.path
        if not path.endswith("/"):
            if "." in path.split("/")[-1]:
                path = "/".join(path.split("/")[:-1]) + "/"
            else:
                path += "/"
        
        scope_prefix = f"{parsed_start.scheme}://{parsed_start.netloc}{path}"
        base_domain = f"{parsed_start.scheme}://{parsed_start.netloc}"

        visited: set[str] = {start_url}
        queue: deque[str] = deque([start_url])
        results: list[str] = []
        semaphore = asyncio.Semaphore(max_concurrent)

        async def fetch_one(client: httpx.AsyncClient, url: str) -> tuple[str, list[str]]:
            """Fetch a single page and extract its text + discovered links."""
            async with semaphore:
                try:
                    # Fetch via Jina AI Reader (handles JS/SPAs and returns clean Markdown)
                    jina_resp = await client.get(f"https://r.jina.ai/{url}", headers=self.headers)
                    jina_resp.raise_for_status()
                    text = jina_resp.text
                except Exception as exc:
                    logger.warning("Failed to fetch %s: %s", url, exc)
                    return "", []

                new_urls: list[str] = []
                
                # --- extract links from Jina Markdown ---
                # Jina converts <a> tags to [text](url). We extract these urls.
                for match in re.finditer(r'\]\((https?://[^\s\)]+)\)', text):
                    abs_url = match.group(1)
                    abs_url, _ = urldefrag(abs_url)
                    
                    # Stay within domain for safety, but check scope for crawling depth
                    if abs_url.startswith(scope_prefix):
                        new_urls.append(abs_url)
                    elif abs_url.startswith(base_domain):
                        # Optional: could add some logic here if we want to follow domain but not path
                        pass

                # --- Storybook SPA Heuristic ---
                storybook_match = re.search(r'\?path=/docs/(.*?)$', url)
                if storybook_match:
                    try:
                        story_id = storybook_match.group(1).replace('--docs', '').replace('&viewMode=docs', '')
                        iframe_url = urljoin(url, f"/iframe.html?id={story_id}&viewMode=docs")
                        logger.info("Detected Storybook URL. Fetching iframe content: %s", iframe_url)
                        iframe_resp = await client.get(f"https://r.jina.ai/{iframe_url}", headers=self.headers)
                        if iframe_resp.status_code == 200 and iframe_resp.text:
                            text += "\n\n" + iframe_resp.text
                    except Exception as e:
                        logger.warning("Failed to fetch Storybook iframe for %s: %s", url, e)

                await asyncio.sleep(self.polite_delay)
                return text, new_urls

        logger.info("Starting crawl of %s (scope_prefix=%s, max_pages=%d)", start_url, scope_prefix, max_pages)

        async with httpx.AsyncClient(timeout=self.timeout, follow_redirects=True) as client:
            while queue and len(results) < max_pages:
                # Process in batches of max_concurrent
                current_batch = []
                while queue and len(current_batch) < max_concurrent:
                    current_batch.append(queue.popleft())

                tasks = [fetch_one(client, u) for u in current_batch]
                batch_results = await asyncio.gather(*tasks)

                for text, new_urls in batch_results:
                    if text and len(text) >= 50:
                        results.append(text)
                    
                    for u in new_urls:
                        if u not in visited and len(visited) < max_pages:
                            visited.add(u)
                            queue.append(u)

                if len(results) > 0 and len(results) % 20 == 0:
                    logger.info("Crawl progress: %d pages collected, %d in queue", len(results), len(queue))

        logger.info("Crawl finished: %d pages collected from %s", len(results), start_url)
        return results

    @staticmethod
    def _parse_html(html: str) -> str:
        """Strip boilerplate elements and return plain text (fallback if Jina not used)."""
        soup = BeautifulSoup(html, "html.parser")

        # Remove non-content elements.
        for tag in soup(["script", "style", "nav", "footer", "header", "aside", "noscript"]):
            tag.decompose()

        text = soup.get_text(separator="\n")
        lines = (line.strip() for line in text.splitlines())
        text = "\n".join(line for line in lines if line)
        text = re.sub(r"\n{3,}", "\n\n", text)
        return text.strip()

    # ------------------------------------------------------------------
    # Future work
    # ------------------------------------------------------------------

    async def fetch_pdf(self, url: str) -> str:
        raise NotImplementedError("PDF ingestion not yet implemented")

    async def fetch_docx(self, url: str) -> str:
        raise NotImplementedError("DOCX ingestion not yet implemented")
