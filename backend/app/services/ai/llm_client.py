"""Provider-agnostic LLM & Speech-to-Text client (Groq / OpenAI / Gemini)."""

from __future__ import annotations

import logging
from typing import Any

import httpx

from app.config import get_settings

logger = logging.getLogger(__name__)


class LLMProviderError(Exception):
    def __init__(self, message: str, status_code: int = 502):
        super().__init__(message)
        self.status_code = status_code


class LLMClient:
    """Unified wrapper over OpenAI-compatible Chat Completions + Whisper APIs."""

    PROVIDER_BASE_URLS = {
        "groq": "https://api.groq.com/openai/v1",
        "openai": "https://api.openai.com/v1",
        "gemini": "https://generativelanguage.googleapis.com/v1beta/openai",
    }

    def __init__(self):
        self.settings = get_settings()
        groq_key = (self.settings.GROQ_API_KEY or "").strip()
        gemini_key = (self.settings.GEMINI_API_KEY or "").strip()
        openai_key = (self.settings.OPENAI_API_KEY or "").strip()

        configured_provider = (self.settings.AI_PROVIDER or "").strip().lower()
        if configured_provider == "groq" and not groq_key and gemini_key:
            self.provider = "gemini"
        elif configured_provider == "groq" and not groq_key and openai_key:
            self.provider = "openai"
        else:
            self.provider = configured_provider or ("groq" if groq_key else "gemini" if gemini_key else "groq")

        self.base_url = self.PROVIDER_BASE_URLS.get(
            self.provider, self.PROVIDER_BASE_URLS["groq"]
        )
        self.api_key = self._resolve_api_key()

        if self.provider == "gemini" and (not self.settings.AI_MODEL or "llama" in self.settings.AI_MODEL):
            self.model = "gemini-2.0-flash"
            self.fallback_model = "gemini-1.5-flash"
        else:
            configured_model = (self.settings.AI_MODEL or "").strip()
            if not configured_model or "llama-3" in configured_model:
                self.model = "openai/gpt-oss-120b"
            else:
                self.model = configured_model
            self.fallback_model = "openai/gpt-oss-20b"

        self.whisper_model = self.settings.AI_WHISPER_MODEL or "whisper-large-v3-turbo"

    def _resolve_api_key(self) -> str:
        if self.provider == "openai":
            return (self.settings.OPENAI_API_KEY or self.settings.GROQ_API_KEY or "").strip()
        if self.provider == "gemini":
            return (self.settings.GEMINI_API_KEY or self.settings.GROQ_API_KEY or "").strip()
        return (self.settings.GROQ_API_KEY or self.settings.OPENAI_API_KEY or "").strip()

    @property
    def is_configured(self) -> bool:
        return bool(self.api_key and self.api_key not in ("your-groq-api-key", "change-me"))

    def chat(
        self,
        messages: list[dict[str, Any]],
        tools: list[dict[str, Any]] | None = None,
        temperature: float = 0.1,
    ) -> dict[str, Any]:
        """Send chat completion request with optional function-calling tools.
        Automatically retries with `fallback_model` on 429/404/400 errors.
        """
        if not self.is_configured:
            raise LLMProviderError("AI API key is not configured.", status_code=503)

        try:
            return self._call_completions(
                model=self.model,
                messages=messages,
                tools=tools,
                temperature=temperature,
            )
        except LLMProviderError as exc:
            if exc.status_code in (429, 404, 400) and self.fallback_model and self.fallback_model != self.model:
                logger.warning(
                    "Error (%s) on primary model %s; retrying with fallback %s",
                    exc.status_code,
                    self.model,
                    self.fallback_model,
                )
                return self._call_completions(
                    model=self.fallback_model,
                    messages=messages,
                    tools=tools,
                    temperature=temperature,
                )
            raise

    def _call_completions(
        self,
        model: str,
        messages: list[dict[str, Any]],
        tools: list[dict[str, Any]] | None,
        temperature: float,
    ) -> dict[str, Any]:
        payload: dict[str, Any] = {
            "model": model,
            "messages": messages,
            "temperature": temperature,
            "max_tokens": 1024,
        }
        if tools:
            payload["tools"] = tools
            payload["tool_choice"] = "auto"

        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }

        try:
            with httpx.Client(timeout=25.0) as client:
                resp = client.post(
                    f"{self.base_url}/chat/completions",
                    json=payload,
                    headers=headers,
                )
        except httpx.RequestError as exc:
            logger.error("Network error calling LLM provider %s: %s", self.provider, exc)
            raise LLMProviderError(f"Network error contacting AI provider: {exc}", status_code=502)

        if resp.status_code != 200:
            detail = resp.text[:300]
            logger.warning("LLM provider returned %s: %s", resp.status_code, detail)
            raise LLMProviderError(
                f"AI provider error ({resp.status_code}): {detail}",
                status_code=resp.status_code,
            )

        data = resp.json()
        choices = data.get("choices") or []
        if not choices:
            raise LLMProviderError("Empty response from AI provider.", status_code=502)

        return choices[0].get("message", {})

    def transcribe(
        self,
        audio_bytes: bytes,
        filename: str = "voice.webm",
        content_type: str = "audio/webm",
    ) -> str:
        """Transcribe Hindi/Hinglish/English audio using Groq Whisper."""
        groq_key = (self.settings.GROQ_API_KEY or self.api_key or "").strip()
        if not groq_key:
            raise LLMProviderError(
                "GROQ_API_KEY is required in backend/.env for server-side Whisper transcription.",
                status_code=503,
            )

        headers = {"Authorization": f"Bearer {groq_key}"}
        files = {"file": (filename, audio_bytes, content_type)}
        data = {
            "model": self.whisper_model,
            "language": "en",
            "prompt": (
                "Transcribe strictly in Roman English alphabet (English and Hinglish, never Devanagari): "
                "Who is present today, Aaj kaun present hai, kaun leave pe hai, aaj kaun chhutti pe hai, "
                "late comers, pending approvals, Engineering, Sales, HR, Finance, Product, Rahul Sharma."
            ),
            "response_format": "json",
            "temperature": "0",
        }

        try:
            with httpx.Client(timeout=30.0) as client:
                resp = client.post(
                    "https://api.groq.com/openai/v1/audio/transcriptions",
                    headers=headers,
                    files=files,
                    data=data,
                )
        except httpx.RequestError as exc:
            raise LLMProviderError(f"Whisper network error: {exc}", status_code=502)

        if resp.status_code != 200:
            raise LLMProviderError(
                f"Whisper transcription failed ({resp.status_code}): {resp.text[:200]}",
                status_code=resp.status_code,
            )

        body = resp.json()
        return (body.get("text") or "").strip()
