"""Text splitter utility for RAG chunking with quality filtering."""

import re

try:
    # LangChain 0.2+ package split
    from langchain_text_splitters import RecursiveCharacterTextSplitter
except ImportError:  # pragma: no cover - fallback for older environments
    from langchain.text_splitter import RecursiveCharacterTextSplitter


def _is_quality_chunk(chunk: str) -> bool:
    """Return True if the chunk contains actual prose documentation.

    Rejects chunks that are dominated by:
      - Navigation / class-name listings (e.g. ``java.awt.color\\njava.awt.dnd``)
      - Bullet-pointed class/package lists (e.g. ``* java.nio.channels``)
      - Short newline-separated tokens with no sentence structure
      - Pure link/URL dumps from markdown crawls
    """
    if len(chunk) < 60:
        return False

    lines = [ln.strip() for ln in chunk.strip().splitlines() if ln.strip()]
    if not lines:
        return False

    # Normalize lines: strip markdown list markers (* , - , numbers)
    stripped_lines = []
    for ln in lines:
        clean = re.sub(r'^[\*\-\d]+[\.\)]*\s*', '', ln).strip()
        stripped_lines.append(clean)

    # Count lines that look like actual sentences (>15 chars, contain spaces)
    prose_lines = [ln for ln in lines if len(ln) > 15 and ' ' in ln]
    prose_ratio = len(prose_lines) / len(lines) if lines else 0

    # Count sentence-ending punctuation (periods, question marks, etc.)
    sentence_endings = len(re.findall(r'[.!?;:]\s', chunk))

    # Detect class/package listing patterns:
    # Lines like "java.nio.channels", "* java.awt", "ClosedSelectorException"
    # Check BOTH raw lines and lines with list markers stripped
    dotted_tokens = sum(
        1 for ln in stripped_lines
        if re.match(r'^[\w$.]+$', ln) and len(ln) > 5
    )
    dotted_ratio = dotted_tokens / len(lines) if lines else 0

    # Also catch single-word-per-line patterns (e.g. class name lists)
    single_word_lines = sum(1 for ln in stripped_lines if ' ' not in ln and len(ln) > 3)
    single_word_ratio = single_word_lines / len(lines) if lines else 0

    # Detect markdown link-only dumps: lines that are mostly [text](url)
    link_lines = sum(1 for ln in lines if ln.startswith('[') and '](' in ln)
    link_ratio = link_lines / len(lines) if lines else 0

    # Reject if >50% of lines are dotted identifiers (class/package lists)
    if dotted_ratio > 0.5:
        return False

    # Reject if >60% of lines are single words (class name dumps)
    if single_word_ratio > 0.6 and sentence_endings < 2:
        return False

    # Reject if >70% of lines are just markdown links
    if link_ratio > 0.7:
        return False

    # Reject if almost no prose (< 20% sentence-like lines) AND no punctuation
    if prose_ratio < 0.2 and sentence_endings < 2:
        return False

    return True


class TextSplitter:
    """Split long text into overlapping chunks with quality filtering."""

    def __init__(self, chunk_size: int = 500, chunk_overlap: int = 100) -> None:
        self.splitter = RecursiveCharacterTextSplitter(
            chunk_size=chunk_size,
            chunk_overlap=chunk_overlap,
            length_function=len,
            separators=["\n\n", "\n", ". ", " ", ""],
        )

    def split_text(self, text: str) -> list[str]:
        raw_chunks = self.splitter.split_text(text)
        return [c for c in raw_chunks if _is_quality_chunk(c)]

    def create_chunks_with_metadata(
        self, text: str, source_id: str, source_title: str = ""
    ) -> list[dict]:
        chunks = self.split_text(text)
        return [
            {
                "content": chunk,
                "metadata": {
                    "source_id": source_id,
                    "source_title": source_title,
                    "chunk_index": i,
                    "total_chunks": len(chunks),
                },
            }
            for i, chunk in enumerate(chunks)
        ]
