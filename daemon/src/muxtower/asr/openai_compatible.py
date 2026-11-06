"""Speech to text through an OpenAI-compatible `/audio/transcriptions` endpoint: Groq (Whisper) and
OpenAI both speak it. The only code here that sends audio anywhere."""

import logging
import re

import httpx

from muxtower.errors import Unavailable

PROVIDERS = {
    "groq": ("https://api.groq.com/openai/v1", "whisper-large-v3-turbo"),
    "openai": ("https://api.openai.com/v1", "gpt-4o-transcribe"),
}
TIMEOUT = httpx.Timeout(60, connect=10)
logger = logging.getLogger(__name__)


# The provider tells the format by the file's name: a phone browser records WebM (Chrome) or MP4 (Safari).
EXTENSIONS = {"audio/webm": "webm", "audio/ogg": "ogg", "audio/mpeg": "mp3", "audio/mp4": "mp4", "audio/m4a": "m4a"}


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
                files={"file": (f"speech.{EXTENSIONS.get(content_type, 'wav')}", audio, content_type)},
                timeout=TIMEOUT,
            )
        except httpx.HTTPError as exc:
            raise Unavailable(f"cannot reach {self.provider} ({type(exc).__name__})") from exc
        if response.status_code != 200:
            reason = _reason(response, self.api_key)  # the provider's own words, never a key nor the audio
            logger.warning("%s refused a transcription: HTTP %s %s", self.provider, response.status_code, reason)
            raise Unavailable(
                f"{self.provider} answered HTTP {response.status_code}" + (f": {reason}" if reason else "")
            )
        text = response.json().get("text")
        return text.strip() if isinstance(text, str) else ""


# What looks like an API key in a provider's message (Groq gsk_…, OpenAI sk-…), as some echo it back.
KEYLIKE = re.compile(r"\b(?:gsk|sk)[-_][\w-]{4,}|\b[\w-]{32,}\b")


def _reason(response: httpx.Response, api_key: str) -> str:
    """The error message an OpenAI-compatible API gives (`{"error": {"message": …}}`), shortened, with
    the key and anything shaped like one taken out."""
    try:
        body = response.json()
    except ValueError:
        return ""
    error = body.get("error") if isinstance(body, dict) else None
    message = error.get("message") if isinstance(error, dict) else error
    if not message:
        return ""
    text = str(message).replace(api_key, "…") if api_key else str(message)
    return KEYLIKE.sub("…", text)[:200]
