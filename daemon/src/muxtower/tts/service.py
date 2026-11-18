"""The voice Read aloud speaks in, made on the hub: Azure's neural voices through its official Speech REST
API (the key stays on the hub), mp3. Made once per text and voice, kept on disk (bounded); characters
counted per month against a soft cap (Azure's free tier is 500,000 neural characters a month). When it is
off, has no key, is over the cap or Azure refuses or is slow, the phone speaks with its own voice."""

import hashlib
import json
import logging
import threading
import time
from collections.abc import Callable
from datetime import UTC, datetime
from pathlib import Path
from typing import Protocol
from xml.sax.saxutils import escape, quoteattr

import httpx
from pydantic import BaseModel, Field

from muxtower.config import TtsSettings
from muxtower.errors import Unavailable

logger = logging.getLogger("muxtower.tts")

FORMAT = "audio-24khz-48kbitrate-mono-mp3"
TIMEOUT_SECONDS = 3.0  # then the phone's voice: a slow answer is no answer while driving
MAX_TEXT = 1000  # characters in one request (Read all sends a reply in pieces)
CACHE_BYTES = 64 * 1024 * 1024
FREE_TIER = 500_000
REFUSAL_SECONDS = 600  # Azure's refusal (quota, key) believed this long: then asked again

# The voice for a language when none is set (`tts.voice` empty): a set one always wins. Multilingual voices
# say mixed text (a Chinese sentence with English words) in one voice; one for any language not listed.
VOICE_FOR = {
    "zh": "zh-CN-XiaoxiaoNeural", "en": "en-US-AvaMultilingualNeural", "ja": "ja-JP-NanamiNeural",
    "ko": "ko-KR-SunHiNeural", "de": "de-DE-SeraphinaMultilingualNeural", "fr": "fr-FR-VivienneMultilingualNeural",
    "es": "es-ES-XimenaMultilingualNeural", "it": "it-IT-IsabellaMultilingualNeural",
    "pt": "pt-BR-ThalitaMultilingualNeural",
}  # fmt: skip
ANY_LANGUAGE = "en-US-AvaMultilingualNeural"

# Azure's neural voices offered in Settings (its catalog; a voice the region lacks says so when used).
VOICES = (
    "zh-CN-XiaoxiaoMultilingualNeural", "zh-CN-YunyiMultilingualNeural", "en-US-AvaMultilingualNeural",
    "en-US-AndrewMultilingualNeural", "en-US-EmmaMultilingualNeural", "en-US-BrianMultilingualNeural",
    "zh-CN-XiaoxiaoNeural", "zh-CN-XiaoyiNeural", "zh-CN-XiaochenNeural", "zh-CN-XiaohanNeural",
    "zh-CN-XiaomengNeural", "zh-CN-XiaomoNeural", "zh-CN-XiaoqiuNeural", "zh-CN-XiaoruiNeural",
    "zh-CN-XiaoshuangNeural", "zh-CN-XiaoxuanNeural", "zh-CN-XiaoyanNeural", "zh-CN-XiaozhenNeural",
    "zh-CN-YunxiNeural", "zh-CN-YunjianNeural", "zh-CN-YunyangNeural", "zh-CN-YunxiaNeural",
    "zh-CN-YunfengNeural", "zh-CN-YunhaoNeural", "zh-CN-YunyeNeural", "zh-CN-YunzeNeural",
    "en-US-AvaNeural", "en-US-AndrewNeural", "en-GB-SoniaNeural", "ja-JP-NanamiNeural", "ko-KR-SunHiNeural",
)  # fmt: skip


def voice_for(set_voice: str, language: str | None) -> str:
    """The voice to speak in: the one set, else the language's, else one that speaks any."""
    return set_voice or VOICE_FOR.get((language or "").lower(), ANY_LANGUAGE)


STYLES = ("", "chat", "assistant", "customerservice", "cheerful", "calm", "gentle", "newscast")


class Refused(Unavailable):
    """Azure would not, or could not in time: `why` is quota, key, timeout or failed."""

    def __init__(self, why: str, detail: str = "") -> None:
        super().__init__(f"text to speech unavailable ({why}){': ' + detail if detail else ''}")
        self.why = why


class Synthesizer(Protocol):
    def synthesize(self, ssml: str, key: str, region: str) -> bytes: ...


class AzureSpeech:
    """POST https://<region>.tts.speech.microsoft.com/cognitiveservices/v1 with SSML: mp3 back."""

    def __init__(self, timeout: float = TIMEOUT_SECONDS) -> None:
        self.timeout = timeout

    def synthesize(self, ssml: str, key: str, region: str) -> bytes:
        url = f"https://{region}.tts.speech.microsoft.com/cognitiveservices/v1"
        headers = {
            "Ocp-Apim-Subscription-Key": key, "Content-Type": "application/ssml+xml",
            "X-Microsoft-OutputFormat": FORMAT, "User-Agent": "muxtower",
        }  # fmt: skip
        try:
            res = httpx.post(url, content=ssml.encode(), headers=headers, timeout=self.timeout)
        except httpx.TimeoutException as exc:
            raise Refused("timeout") from exc
        except httpx.HTTPError as exc:
            raise Refused("failed", str(exc)) from exc
        if res.status_code == 429:
            raise Refused("quota")
        if res.status_code in (401, 403):
            raise Refused("key", f"HTTP {res.status_code}")
        if res.status_code != 200:
            raise Refused("failed", f"HTTP {res.status_code}")
        return res.content


def ssml(text: str, voice: str, style: str = "") -> str:
    lang = "-".join(voice.split("-")[:2])
    said = escape(text)
    if style:
        said = f"<mstts:express-as style={quoteattr(style)}>{said}</mstts:express-as>"
    return (
        f'<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" '
        f'xmlns:mstts="https://www.w3.org/2001/mstts" xml:lang="{lang}">'
        f"<voice name={quoteattr(voice)}>{said}</voice></speak>"
    )


class TtsStatus(BaseModel):
    provider: str
    available: bool = Field(description="Read aloud uses the hub's voice now (else the phone's)")
    why_not: str | None = Field(default=None, description="off, key (missing or refused), cap, quota")
    region: str
    voice: str = Field(description="the voice set; empty: by the language spoken (voice_for)")
    voice_for: dict[str, str] = Field(default_factory=dict, description="the voice per language when none is set")
    style: str
    key_present: bool
    month: str
    characters: int = Field(description="sent to Azure this month")
    soft_cap: int
    free_tier: int = FREE_TIER
    voices: list[str]
    styles: list[str]


class TtsService:
    def __init__(
        self, settings: Callable[[], TtsSettings], state_dir: Path, client: Synthesizer | None = None,
        cache_bytes: int = CACHE_BYTES,
    ) -> None:  # fmt: skip
        self.settings = settings
        self.cache = state_dir / "tts-cache"
        self.usage_file = state_dir / "tts-usage.json"
        self.client = client or AzureSpeech()
        self.cache_bytes = cache_bytes
        self._lock = threading.Lock()
        self._refused: tuple[str, float] | None = None  # Azure's last refusal (quota, key), and when

    def _usage(self) -> tuple[str, int]:
        month = datetime.now(UTC).strftime("%Y-%m")
        try:
            data = json.loads(self.usage_file.read_text())
            if data.get("month") == month:
                return month, int(data.get("characters", 0))
        except (OSError, ValueError):
            pass
        return month, 0

    def why_not(self) -> str | None:
        s = self.settings()
        if s.provider == "off":
            return "off"
        if not s.key():
            return "key"
        if self._usage()[1] >= s.monthly_soft_cap:
            return "cap"
        if self._refused and time.monotonic() - self._refused[1] < REFUSAL_SECONDS:
            return self._refused[0]
        return None

    def status(self) -> TtsStatus:
        s = self.settings()
        month, used = self._usage()
        why = self.why_not()
        return TtsStatus(
            provider=s.provider, available=why is None, why_not=why, region=s.region, voice=s.voice,
            voice_for=dict(VOICE_FOR), style=s.style,
            key_present=bool(s.key()), month=month, characters=used, soft_cap=s.monthly_soft_cap,
            voices=list(VOICES), styles=list(STYLES),
        )  # fmt: skip

    def _path(self, text: str, voice: str, style: str) -> Path:
        digest = hashlib.sha256(f"{voice}\\n{style}\\n{text}".encode()).hexdigest()
        return self.cache / f"{digest}.mp3"

    def speak(
        self, text: str, voice: str | None = None, style: str | None = None, language: str | None = None
    ) -> bytes:
        """Blocking: the text said, mp3. Kept and reused; a new one counted. Refused (Unavailable) when
        the hub cannot say it now: then the phone does."""
        s = self.settings()
        text = text.strip()[:MAX_TEXT]
        if not text:
            raise Refused("failed", "nothing to say")
        voice = voice or voice_for(s.voice, language)
        style = s.style if style is None else style
        path = self._path(text, voice, style)
        if path.exists():
            path.touch()
            return path.read_bytes()
        if (why := self.why_not()) is not None:
            raise Refused(why)
        key = s.key()
        assert key is not None
        try:
            audio = self.client.synthesize(ssml(text, voice, style), key, s.region)
        except Refused as refused:
            if refused.why in ("quota", "key"):
                self._refused = (refused.why, time.monotonic())  # believed a while, then asked again
            logger.warning("Azure TTS refused: %s", refused)
            raise
        self._refused = None
        with self._lock:
            month, used = self._usage()
            self.usage_file.parent.mkdir(parents=True, exist_ok=True)
            self.usage_file.write_text(json.dumps({"month": month, "characters": used + len(text)}))
            self.cache.mkdir(parents=True, exist_ok=True)
            path.write_bytes(audio)
            self._trim()
        return audio

    def _trim(self) -> None:
        files = sorted(self.cache.glob("*.mp3"), key=lambda p: p.stat().st_mtime)
        total = sum(p.stat().st_size for p in files)
        for p in files:
            if total <= self.cache_bytes:
                break
            total -= p.stat().st_size
            p.unlink(missing_ok=True)
