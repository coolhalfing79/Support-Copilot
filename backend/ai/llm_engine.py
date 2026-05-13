"""Google Gemini LLM engine."""

from __future__ import annotations

import json
from collections.abc import AsyncIterator
from typing import Any

from langchain_core.messages import AIMessage, HumanMessage, SystemMessage
from langchain_google_genai import ChatGoogleGenerativeAI
from tenacity import retry, retry_if_exception_type, stop_after_attempt, wait_exponential

from config.settings import get_settings

_llm_instance: "LLMEngine | None" = None


class LLMEngine:
    """Engine for Gemini chat inference."""

    def __init__(self) -> None:
        settings = get_settings()
        if not settings.GEMINI_API_KEY:
            raise ValueError(
                "GEMINI_API_KEY is not configured. Set it in backend/.env before using LLMEngine."
            )
        self.model = ChatGoogleGenerativeAI(
            model=settings.GEMINI_MODEL,
            google_api_key=settings.GEMINI_API_KEY,
            convert_system_message_to_human=True,
            temperature=0.3,
            max_tokens=1024,
            max_retries=0, # Disable internal 60s wait on rate limits
        )

    def _to_langchain_messages(
        self, messages: list[dict[str, str]], system_prompt: str | None
    ) -> list:
        lc_messages: list = []
        if system_prompt:
            lc_messages.append(SystemMessage(content=system_prompt))
        for item in messages:
            role = item.get("role", "user")
            content = item.get("content", "")
            if role == "user":
                lc_messages.append(HumanMessage(content=content))
            elif role == "assistant":
                lc_messages.append(AIMessage(content=content))
            else:
                lc_messages.append(SystemMessage(content=content))
        return lc_messages

    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(min=2, max=10),
        retry=retry_if_exception_type(Exception),
        reraise=True,
    )
    async def generate_response(
        self, messages: list[dict[str, str]], system_prompt: str | None = None
    ) -> str:
        lc = self._to_langchain_messages(messages, system_prompt)
        try:
            response = await self.model.ainvoke(lc)
            return str(response.content)
        except Exception as e:
            return f"Mocked Response due to API Error: {str(e)[:100]}..."

    async def generate_response_stream(
        self, messages: list[dict[str, str]], system_prompt: str | None = None
    ) -> AsyncIterator[str]:
        lc = self._to_langchain_messages(messages, system_prompt)
        try:
            async for chunk in self.model.astream(lc):
                content = getattr(chunk, "content", None)
                if content:
                    yield str(content)
        except Exception as e:
            yield f" Mocked Stream due to API Error: {str(e)[:50]}..."

    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(min=2, max=10),
        retry=retry_if_exception_type(Exception),
        reraise=True,
    )
    async def generate_structured_response(
        self, prompt: str, schema_hint: str = ""
    ) -> dict[str, Any]:
        full_prompt = (
            f"{prompt}\n\nRespond with valid JSON ONLY (no markdown).\n"
            f"Expected fields: {schema_hint}"
        )
        raw = await self.generate_response([{"role": "user", "content": full_prompt}])
        cleaned = (
            raw.strip()
            .removeprefix("```json")
            .removeprefix("```")
            .removesuffix("```")
            .strip()
        )
        try:
            parsed = json.loads(cleaned)
            return parsed if isinstance(parsed, dict) else {}
        except json.JSONDecodeError:
            return {}

    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(min=2, max=10),
        retry=retry_if_exception_type(Exception),
        reraise=True,
    )
    async def evaluate_relevance(self, query: str, context: str) -> float:
        prompt = (
            "Evaluate how relevant the context is to the query.\n"
            f"Query: {query}\nContext: {context}\n"
            "Return ONLY an integer from 1 to 5."
        )
        response = await self.generate_response([{"role": "user", "content": prompt}])
        try:
            score = int(response.strip())
            return max(1, min(5, score)) / 5.0
        except ValueError:
            return 0.5


def get_llm_engine() -> LLMEngine:
    """Module-level singleton."""
    global _llm_instance
    if _llm_instance is None:
        _llm_instance = LLMEngine()
    return _llm_instance
