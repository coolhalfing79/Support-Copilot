"""
Content cleaner for RAG ingestion.

Sits between the web scraper (raw Jina markdown) and the text splitter.
Strips navigation boilerplate, link syntax, and low-signal noise so that
only actual documentation prose reaches the chunker.

This reduces:
  - Total chunk count (→ fewer embedding API calls → less token usage)
  - Vector DB noise  (→ better retrieval quality)
  - Duplicate content (→ no repeated nav menus across 200 pages)
"""

from __future__ import annotations

import hashlib
import logging
import re

logger = logging.getLogger(__name__)


# ── Patterns compiled once ─────────────────────────────────────────

# Markdown link syntax: [text](url) → keep just the text
_MD_LINK = re.compile(r'\[([^\]]*)\]\([^)]+\)')

# Markdown image syntax: ![alt](url) → remove entirely
_MD_IMAGE = re.compile(r'!\[[^\]]*\]\([^)]+\)')

# Bare URLs on their own line
_BARE_URL_LINE = re.compile(r'^https?://\S+\s*$', re.MULTILINE)

# Jina Reader metadata lines: "Title:", "URL Source:", "Published Time:", etc.
_JINA_META = re.compile(
    r'^(Title|URL Source|Published Time|Markdown Content|Description|Image \d+):\s*.*$',
    re.MULTILINE,
)

# Repeated whitespace / blank lines
_MULTI_NEWLINE = re.compile(r'\n{3,}')
_MULTI_SPACE = re.compile(r'[ \t]{3,}')

# Navigation boilerplate patterns (common across doc sites)
_NAV_PATTERNS = [
    re.compile(r'^(Prev|Next|Frames|No Frames|All Classes|Overview|Package|Class|Use|Tree|Deprecated|Index|Help)\s*$', re.MULTILINE),
    re.compile(r'^(Skip to content|Sign in|Create account|Search /|Ask AI)\s*$', re.MULTILINE),
    re.compile(r'^(Copyright|©|\u00a9).*$', re.MULTILINE),
]

# HTML tag remnants that Jina sometimes leaves behind
_HTML_TAGS = re.compile(r'<[^>]+>')


def clean_page(raw_text: str) -> str:
    """Clean a single page of Jina Reader markdown output.

    Transforms:
      1. Strip Jina metadata headers (Title:, URL Source:, etc.)
      2. Convert markdown links [text](url) → plain text
      3. Remove markdown images ![alt](url) entirely
      4. Remove bare URL lines
      5. Remove common navigation boilerplate
      6. Strip leftover HTML tags
      7. Collapse excessive whitespace

    Returns cleaned text, or empty string if nothing useful remains.
    """
    text = raw_text

    # 1. Strip Jina metadata
    text = _JINA_META.sub('', text)

    # 2. Convert links to plain text (keep the label, drop the URL)
    text = _MD_IMAGE.sub('', text)       # images first (they contain [])
    text = _MD_LINK.sub(r'\1', text)     # then links

    # 3. Remove bare URL lines
    text = _BARE_URL_LINE.sub('', text)

    # 4. Remove navigation boilerplate
    for pattern in _NAV_PATTERNS:
        text = pattern.sub('', text)

    # 5. Strip leftover HTML
    text = _HTML_TAGS.sub('', text)

    # 6. Collapse whitespace
    text = _MULTI_SPACE.sub(' ', text)
    text = _MULTI_NEWLINE.sub('\n\n', text)

    return text.strip()


def deduplicate_pages(pages: list[dict[str, str]], similarity_threshold: int = 50) -> list[dict[str, str]]:
    """Remove near-duplicate pages based on content fingerprinting."""
    seen: set[str] = set()
    unique: list[dict[str, str]] = []

    for page_data in pages:
        page = page_data["content"]
        if len(page) < 80:
            continue

        head = page[:200].strip()
        tail = page[-200:].strip() if len(page) > 200 else ''
        length_bucket = len(page) // 100

        fp = hashlib.md5(
            f"{head}|{tail}|{length_bucket}".encode()
        ).hexdigest()

        if fp not in seen:
            seen.add(fp)
            unique.append(page_data)

    removed = len(pages) - len(unique)
    if removed > 0:
        logger.info("Deduplication removed %d/%d pages (%.1f%%)",
                     removed, len(pages), removed / len(pages) * 100)

    return unique


def clean_and_filter_pages(raw_pages: list[dict[str, str]]) -> list[dict[str, str]]:
    """Full cleaning pipeline: clean → filter → deduplicate."""
    # Step 1: Clean each page
    cleaned: list[dict[str, str]] = []
    for p in raw_pages:
        c_text = clean_page(p["content"])
        if len(c_text) >= 100:
            cleaned.append({"url": p["url"], "content": c_text})

    # Step 2: Deduplicate near-identical pages
    cleaned = deduplicate_pages(cleaned)

    logger.info(
        "Content cleaning: %d raw pages → %d cleaned pages (%.0f%% reduction)",
        len(raw_pages), len(cleaned),
        (1 - len(cleaned) / max(len(raw_pages), 1)) * 100,
    )

    return cleaned
