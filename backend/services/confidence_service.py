"""
Confidence Scoring Engine

Multi-factor confidence scoring for user queries.

Formula:
    confidence = (W_RETRIEVAL × retrieval_score)
               + (W_RELEVANCE × relevance_score)
               + (W_COMPLETENESS × completeness_score)

Two-phase approach:
    1. Initial phase  — heuristic score from conversation context (no docs yet).
    2. Post-retrieval  — full formula using retrieved docs, LLM relevance, and
                         completeness heuristic from ai/utils.py.
"""

from __future__ import annotations

import logging
from typing import Any

from ai.llm_engine import LLMEngine
from ai.prompts import CLARIFICATION_PROMPT
from ai.utils import compute_completeness_score

logger = logging.getLogger(__name__)


class ConfidenceService:
    """Calculates confidence scores and decides the next action."""

    # Thresholds
    LOW_THRESHOLD = 0.20
    HIGH_THRESHOLD = 0.60

    # Weight factors
    W_RETRIEVAL = 0.40
    W_RELEVANCE = 0.35
    W_COMPLETENESS = 0.25

    def __init__(
        self,
        llm_engine: LLMEngine | None = None,
    ) -> None:
        # Import lazily so module can be imported even if the LLM isn't configured.
        if llm_engine is None:
            from ai.llm_engine import get_llm_engine
            llm_engine = get_llm_engine()
        self.llm_engine = llm_engine

    # ------------------------------------------------------------------
    # Phase 1 — Initial confidence (before RAG search)
    # ------------------------------------------------------------------

    async def calculate_initial_confidence(
        self,
        query: str,
        conversation_history: list[str] | None = None,
        follow_up_responses: list[str] | None = None,
    ) -> dict[str, Any]:
        """Heuristic-only confidence (no retrieved docs yet).

        Returns:
            Dict with ``score``, ``action``, and optionally ``follow_up_questions``.
        """
        # Default to 'searching' (0.40) so we at least try RAG.
        # We only force clarification if the query is extremely short/vague.
        base_score = 0.40

        # Heuristic: very short queries (less than 3 words) are likely vague.
        words = query.strip().split()
        if len(words) < 3:
            base_score = 0.15

        # Boost if the user already answered clarification questions.
        if follow_up_responses:
            base_score = max(base_score, 0.50)

        # Boost if there is meaningful conversation history.
        if conversation_history and len(conversation_history) > 1:
            base_score = min(base_score + 0.10, 0.70)

        action = self._score_to_action(base_score)

        result: dict[str, Any] = {
            "score": round(base_score, 4),
            "action": action,
        }

        if action == "clarification":
            result["follow_up_questions"] = await self._generate_clarification_questions(query)

        return result

    # ------------------------------------------------------------------
    # Phase 2 — Post-retrieval confidence (full formula)
    # ------------------------------------------------------------------

    async def calculate_post_retrieval_confidence(
        self,
        query: str,
        retrieved_docs: list[dict[str, Any]],
    ) -> dict[str, Any]:
        """Full-formula confidence using retrieved documents.

        Args:
            query: Original user query.
            retrieved_docs: List of dicts with at least ``content`` and ``similarity`` keys
                            (as returned by ``RAGEngine.search()``).

        Returns:
            Dict with ``score``, ``action``, individual factor scores.
        """
        if not retrieved_docs:
            return {
                "score": 0.0,
                "action": "escalated",
                "retrieval_score": 0.0,
                "relevance_score": 0.0,
                "completeness_score": 0.0,
            }

        retrieval_score = self._calculate_retrieval_score(retrieved_docs)
        relevance_score = await self._calculate_relevance_score(query, retrieved_docs)
        chunks = [doc.get("content", "") for doc in retrieved_docs]
        completeness_score = compute_completeness_score(chunks)

        confidence = (
            self.W_RETRIEVAL * retrieval_score
            + self.W_RELEVANCE * relevance_score
            + self.W_COMPLETENESS * completeness_score
        )
        confidence = round(min(confidence, 1.0), 4)

        action = self._score_to_action(confidence)

        return {
            "score": confidence,
            "action": action,
            "retrieval_score": round(retrieval_score, 4),
            "relevance_score": round(relevance_score, 4),
            "completeness_score": round(completeness_score, 4),
        }

    # ------------------------------------------------------------------
    # Scoring helpers
    # ------------------------------------------------------------------

    @staticmethod
    def _calculate_retrieval_score(docs: list[dict[str, Any]]) -> float:
        """Average cosine similarity of retrieved chunks."""
        if not docs:
            return 0.0
        total = sum(doc.get("similarity", 0.0) for doc in docs)
        return total / len(docs)

    async def _calculate_relevance_score(
        self,
        query: str,
        docs: list[dict[str, Any]],
    ) -> float:
        """LLM-assessed relevance of the top document."""
        if not docs:
            return 0.0
        top_content = docs[0].get("content", "")
        if not top_content:
            return 0.0
        try:
            return await self.llm_engine.evaluate_relevance(query, top_content)
        except Exception:
            logger.warning("LLM relevance evaluation failed; defaulting to 0.5")
            return 0.5

    def _score_to_action(self, score: float) -> str:
        if score <= self.LOW_THRESHOLD:
            return "clarification"
        if score < self.HIGH_THRESHOLD:
            return "searching"
        return "resolve"

    # ------------------------------------------------------------------
    # Clarification question generation
    # ------------------------------------------------------------------

    async def _generate_clarification_questions(self, query: str) -> list[str]:
        """Use LLM to generate 2-3 clarifying questions for a vague query."""
        # NOTE: CLARIFICATION_PROMPT is a static template — we concatenate the
        # query inline rather than calling .format() to avoid KeyError.
        prompt = (
            f"User query: {query}\n\n"
            f"{CLARIFICATION_PROMPT}\n\n"
            "Return each question on its own line, numbered 1-3."
        )

        try:
            response = await self.llm_engine.generate_response(
                [{"role": "user", "content": prompt}]
            )
        except Exception:
            logger.warning("Failed to generate clarification questions")
            return [
                "Which product or module is affected?",
                "What is the exact error message you see?",
                "What were you trying to do when the issue occurred?",
            ]

        # Parse numbered lines from LLM output.
        questions: list[str] = []
        for line in response.strip().splitlines():
            cleaned = line.strip().lstrip("0123456789.-*)• ")
            if cleaned and len(cleaned) > 10:
                questions.append(cleaned)

        return questions[:3] if questions else [
            "Which product or module is affected?",
            "What is the exact error message you see?",
            "What were you trying to do when the issue occurred?",
        ]
