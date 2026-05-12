"""
Web scraper utility for knowledge ingestion.

Fetches web pages and extracts clean text using httpx + BeautifulSoup.
"""

from __future__ import annotations

import re

import httpx
from bs4 import BeautifulSoup


class WebScraper:
    """Fetches and cleans web content for knowledge ingestion."""

    def __init__(self, timeout: float = 30.0) -> None:
        self.timeout = timeout

    async def fetch_content(self, url: str) -> str:
        """Fetch a URL and return cleaned text content.

        Args:
            url: The URL to fetch.

        Returns:
            Cleaned plain-text content.

        Raises:
            httpx.HTTPStatusError: On non-2xx responses.
        """
        headers = {
            "User-Agent": "Mozilla/5.0 (compatible; CopilotBot/1.0)",
        }
        async with httpx.AsyncClient(timeout=self.timeout, follow_redirects=True) as client:
            response = await client.get(url, headers=headers)
            response.raise_for_status()
            return self._parse_html(response.text)

    # ------------------------------------------------------------------
    # Crawling functionality
    # ------------------------------------------------------------------

    async def crawl_website(self, start_url: str, max_pages: int = 200, max_concurrent: int = 5) -> list[str]:
        """Crawl a website recursively, restricted to the start_url path.

        Uses a single shared HTTP client for connection reuse and adds
        polite delays between requests to avoid being rate-limited or
        blocked by the target server.

        Args:
            start_url: Root URL to start crawling from.
            max_pages: Maximum number of pages to fetch.
            max_concurrent: Maximum concurrent HTTP requests.

        Returns:
            List of cleaned text content strings, one per page.
        """
        import asyncio
        import logging
        from urllib.parse import urljoin, urldefrag

        logger = logging.getLogger(__name__)

        visited: set[str] = {start_url}
        queue: list[str] = [start_url]
        results: list[str] = []
        headers = {"User-Agent": "Mozilla/5.0 (compatible; CopilotBot/1.0)"}
        semaphore = asyncio.Semaphore(max_concurrent)

        async def fetch_one(client: httpx.AsyncClient, url: str) -> tuple[str, list[str]]:
            """Fetch a single page and extract its text + discovered links."""
            async with semaphore:
                try:
                    response = await client.get(url, headers=headers)
                    response.raise_for_status()
                except httpx.HTTPStatusError as exc:
                    logger.warning("HTTP %s for %s", exc.response.status_code, url)
                    return "", []
                except Exception as exc:
                    logger.warning("Failed to fetch %s: %s", url, exc)
                    return "", []

                html = response.text
                soup = BeautifulSoup(html, "html.parser")

                # --- extract links ---
                new_urls: list[str] = []
                for tag in soup.find_all(["a", "frame", "iframe"]):
                    href = tag.get("href") or tag.get("src")
                    if href:
                        abs_url = urljoin(url, href)
                        abs_url, _ = urldefrag(abs_url)
                        if abs_url.startswith(start_url):
                            new_urls.append(abs_url)

                # --- extract text ---
                for tag in soup(["script", "style", "nav", "footer", "header", "aside", "noscript"]):
                    tag.decompose()
                text = soup.get_text(separator="\n")
                lines = (line.strip() for line in text.splitlines())
                text = "\n".join(line for line in lines if line)
                text = re.sub(r"\n{3,}", "\n\n", text).strip()

                # Small delay per request to be polite to the server.
                await asyncio.sleep(0.3)

                return text, new_urls

        logger.info("Starting crawl of %s (max_pages=%d)", start_url, max_pages)

        async with httpx.AsyncClient(timeout=self.timeout, follow_redirects=True) as client:
            while queue and len(results) < max_pages:
                # Take a batch from the queue.
                batch = queue[:max_concurrent]
                queue = queue[max_concurrent:]

                tasks = [fetch_one(client, u) for u in batch]
                batch_results = await asyncio.gather(*tasks)

                for text, new_urls in batch_results:
                    if text and len(text) >= 50:
                        results.append(text)
                    for u in new_urls:
                        if u not in visited and len(visited) < max_pages:
                            visited.add(u)
                            queue.append(u)

                if len(results) % 20 == 0 and results:
                    logger.info("Crawl progress: %d pages collected, %d in queue", len(results), len(queue))

        logger.info("Crawl finished: %d pages collected from %s", len(results), start_url)
        return results

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    @staticmethod
    def _parse_html(html: str) -> str:
        """Strip boilerplate elements and return plain text."""
        soup = BeautifulSoup(html, "html.parser")

        # Remove non-content elements.
        for tag in soup(["script", "style", "nav", "footer", "header", "aside", "noscript"]):
            tag.decompose()

        text = soup.get_text(separator="\n")

        # Collapse excessive whitespace while preserving paragraph breaks.
        lines = (line.strip() for line in text.splitlines())
        text = "\n".join(line for line in lines if line)

        # Collapse runs of 3+ newlines into 2.
        text = re.sub(r"\n{3,}", "\n\n", text)
        return text.strip()

    # ------------------------------------------------------------------
    # Stub methods for non-HTML content (future work)
    # ------------------------------------------------------------------

    async def fetch_pdf(self, url: str) -> str:
        """Fetch and extract text from a PDF (placeholder)."""
        # TODO: Implement with PyPDF2 or pdfplumber if needed.
        raise NotImplementedError("PDF ingestion not yet implemented")

    async def fetch_docx(self, url: str) -> str:
        """Fetch and extract text from a DOCX file (placeholder)."""
        # TODO: Implement with python-docx if needed.
        raise NotImplementedError("DOCX ingestion not yet implemented")
