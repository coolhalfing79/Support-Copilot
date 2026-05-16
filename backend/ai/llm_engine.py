"""OpenAI chat LLM engine."""

from __future__ import annotations

import json
from collections.abc import AsyncIterator
from typing import Any

from openai import AsyncOpenAI
from tenacity import retry, retry_if_exception_type, stop_after_attempt, wait_exponential

from config.settings import get_settings

_llm_instance: "LLMEngine | None" = None


class LLMEngine:
    """Engine for OpenAI chat inference."""

    def __init__(self) -> None:
        settings = get_settings()
        if not settings.OPENAI_API_KEY:
            raise ValueError(
                "OPENAI_API_KEY is not configured. Set it in backend/.env before using LLMEngine."
            )
        self.client = AsyncOpenAI(api_key=settings.OPENAI_API_KEY)
        self.model = settings.OPENAI_MODEL
        self.max_tokens = settings.OPENAI_MAX_TOKENS

    def _to_langchain_messages(
        self, messages: list[dict[str, str]], system_prompt: str | None
    ) -> list[dict[str, str]]:
        lc_messages: list[dict[str, str]] = []
        if system_prompt:
            lc_messages.append({"role": "system", "content": system_prompt})
        for item in messages:
            role = item.get("role", "user")
            content = item.get("content", "")
            if role == "user":
                lc_messages.append({"role": "user", "content": content})
            elif role == "assistant":
                lc_messages.append({"role": "assistant", "content": content})
            else:
                lc_messages.append({"role": "system", "content": content})
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
            response = await self.client.chat.completions.create(
                model=self.model,
                messages=lc,
                temperature=0.3,
                max_tokens=self.max_tokens,
            )
            content = response.choices[0].message.content
            return str(content or "")
        except Exception as e:
            return f"Mocked Response due to API Error: {str(e)[:100]}..."

    async def generate_response_stream(
        self, messages: list[dict[str, str]], system_prompt: str | None = None
    ) -> AsyncIterator[str]:
        lc = self._to_langchain_messages(messages, system_prompt)
        try:
            stream = await self.client.chat.completions.create(
                model=self.model,
                messages=lc,
                temperature=0.3,
                max_tokens=self.max_tokens,
                stream=True,
            )
            async for chunk in stream:
                content = chunk.choices[0].delta.content
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
