"""Speech to text through an OpenAI-compatible `/audio/transcriptions` endpoint: Groq (Whisper) and
OpenAI both speak it. The only code here that sends audio anywhere."""

import httpx

from muxtower.errors import Unavailable

PROVIDERS = {
    "groq": ("https://api.groq.com/openai/v1", "whisper-large-v3-turbo"),
    "openai": ("https://api.openai.com/v1", "gpt-4o-transcribe"),
}
TIMEOUT = httpx.Timeout(60, connect=10)


class OpenAICompatibleTranscriber:
    def __init__(self, provider: str, api_key: str, model: str | None = None) -> None:
        base_url, default_model = PROVIDERS[provider]
        self.url = f"{base_url}/audio/transcriptions"
        self.api_key = api_key
        self.model = model or default_model
        self.provider = provider

    def transcribe(self, audio: bytes, content_type: str, language: str | None, prompt: str | None) -> str:
        data = {"model": self.model, "response_format": "json"}
        if language:
            data["language"] = language
        if prompt:
            data["prompt"] = prompt
        try:
            response = httpx.post(
                self.url,
                headers={"Authorization": f"Bearer {self.api_key}"},
                data=data,
                files={"file": ("speech.wav", audio, content_type)},
                timeout=TIMEOUT,
            )
        except httpx.HTTPError as exc:
            raise Unavailable(f"cannot reach {self.provider} ({type(exc).__name__})") from exc
        if response.status_code != 200:
            raise Unavailable(f"{self.provider} answered HTTP {response.status_code}")
        text = response.json().get("text")
        return text.strip() if isinstance(text, str) else ""
