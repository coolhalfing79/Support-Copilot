import pytest
from ai.rag_pipeline import _clean_chunk

def test_clean_chunk_jina_meta():
    text = "Title: Some Doc\nURL Source: https://example.com\nMarkdown Content:\nActual content here."
    cleaned = _clean_chunk(text)
    assert cleaned == "Actual content here."

def test_clean_chunk_markdown_links():
    text = "Check [this link](https://example.com) for details."
    cleaned = _clean_chunk(text)
    assert cleaned == "Check this link for details."

def test_clean_chunk_markdown_images():
    text = "Here is an image: ![alt text](https://example.com/img.png)"
    cleaned = _clean_chunk(text)
    assert cleaned == "Here is an image:"

def test_clean_chunk_bare_urls():
    text = "Visit\nhttps://example.com\nfor more."
    cleaned = _clean_chunk(text)
    assert "https://example.com" not in cleaned
    assert "Visit" in cleaned
    assert "for more" in cleaned

def test_clean_chunk_html_tags():
    text = "<div>Hello <b>World</b></div>"
    cleaned = _clean_chunk(text)
    assert cleaned == "Hello World"

def test_clean_chunk_multiple_newlines():
    text = "Line 1\n\n\n\nLine 2"
    cleaned = _clean_chunk(text)
    assert cleaned == "Line 1\n\nLine 2"

def test_clean_chunk_combined():
    text = (
        "Title: Example\n"
        "URL Source: http://ex.com\n"
        "Published Time: 2024\n"
        "\n"
        "Here is a [link](http://link.com) and an ![image](img.png).\n"
        "\n"
        "<div>HTML</div>\n"
        "\n"
        "http://bare.url\n"
        "\n"
        "End of doc."
    )
    cleaned = _clean_chunk(text)
    assert "Title:" not in cleaned
    assert "link" in cleaned
    assert "image" not in cleaned
    assert "HTML" in cleaned
    assert "http://bare.url" not in cleaned
    assert "End of doc." in cleaned
