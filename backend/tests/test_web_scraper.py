import pytest
import httpx
from unittest.mock import AsyncMock, patch, MagicMock, ANY
from utils.web_scraper import WebScraper
from bs4 import BeautifulSoup

@pytest.mark.asyncio
async def test_fetch_content_success():
    scraper = WebScraper()
    url = "https://example.com"
    mock_response = MagicMock()
    mock_response.status_code = 200
    mock_response.text = "Cleaned Content"
    mock_response.raise_for_status = MagicMock()

    with patch("httpx.AsyncClient.get", new_callable=AsyncMock) as mock_get:
        mock_get.return_value = mock_response
        content = await scraper.fetch_content(url)
        
        assert content == "Cleaned Content"
        mock_get.assert_called_once_with(f"https://r.jina.ai/{url}", headers=ANY)

@pytest.mark.asyncio
async def test_fetch_content_failure():
    scraper = WebScraper()
    url = "https://example.com"
    
    with patch("httpx.AsyncClient.get", new_callable=AsyncMock) as mock_get:
        mock_response = MagicMock()
        mock_response.status_code = 404
        mock_response.raise_for_status.side_effect = httpx.HTTPStatusError(
            "404 Not Found", request=MagicMock(), response=mock_response
        )
        mock_get.return_value = mock_response
        
        with pytest.raises(httpx.HTTPStatusError):
            await scraper.fetch_content(url)

def test_parse_html():
    html = """
    <html>
        <body>
            <nav>Nav</nav>
            <main>
                <h1>Title</h1>
                <p>Paragraph 1.</p>
            </main>
            <footer>Footer</footer>
        </body>
    </html>
    """
    cleaned = WebScraper._parse_html(html)
    assert "Title" in cleaned
    assert "Paragraph 1." in cleaned
    assert "Nav" not in cleaned
    assert "Footer" not in cleaned

@pytest.mark.asyncio
async def test_crawl_website_scope_and_limit():
    scraper = WebScraper(polite_delay=0)
    start_url = "https://example.com/docs/"
    
    # Page 1 has link to Page 2
    jina_page1 = "Page 1 [link](https://example.com/docs/page2) - Long enough to pass filter"
    jina_page2 = "Page 2 Content - This is also long enough to pass the 50 character limit filter"

    async def mock_get(url, **kwargs):
        resp = MagicMock()
        resp.status_code = 200
        if "page2" in url:
            resp.text = jina_page2
        else:
            resp.text = jina_page1
        return resp

    with patch("httpx.AsyncClient.get", side_effect=mock_get):
        results = await scraper.crawl_website(start_url, max_pages=5)
        
        assert len(results) == 2
        assert any("Page 2 Content" in r for r in results)
        assert any("Page 1" in r for r in results)

@pytest.mark.asyncio
async def test_crawl_storybook_heuristic():
    scraper = WebScraper(polite_delay=0)
    url = "https://example.com/?path=/docs/component--docs"
    
    jina_shell = "Storybook Shell Markdown - Long enough to pass filter"
    jina_iframe = "Actual Component Documentation - Also long enough to pass filter"

    async def mock_get(url, **kwargs):
        resp = MagicMock()
        resp.status_code = 200
        if "iframe.html" in url:
            resp.text = jina_iframe
        else:
            resp.text = jina_shell
        return resp

    with patch("httpx.AsyncClient.get", side_effect=mock_get):
        results = await scraper.crawl_website(url, max_pages=1)
        assert len(results) == 1
        assert "Actual Component Documentation" in results[0]
        assert "Storybook Shell Markdown" in results[0]
