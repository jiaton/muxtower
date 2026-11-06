from muxtower.asr.models import Transcript
from muxtower.asr.ports import Transcriber
from muxtower.errors import Conflict, Invalid

MAX_AUDIO_BYTES = 4 * 1024 * 1024  # ~2 minutes of 16 kHz mono 16-bit WAV
AUDIO_TYPES = ("audio/wav", "audio/x-wav", "audio/webm", "audio/ogg", "audio/mpeg", "audio/mp4", "audio/m4a")


# Whisper follows the style of its prompt: written in Simplified Chinese, it keeps Mandarin out of
# Traditional characters, and the jargon of driving agents in it is spelled right. Nothing private goes
# to the provider in it: no session names, only these words and the owner's own (`[asr] prompt`).
BASE_PROMPT = (
    "以下是对编程助手说的话，普通话夹杂英文，用简体中文。常用词：会话、批准、拒绝、中断、继续、Claude、tmux、approve。"
)
# Groq refuses a prompt over 896 "characters", counted as UTF-8 bytes (a Chinese character is three).
MAX_PROMPT_BYTES = 880


class AsrService:
    def __init__(self, transcriber: Transcriber | None, language: str | None, extra_prompt: str | None = None) -> None:
        self.transcriber = transcriber
        self.language = language
        self.extra_prompt = extra_prompt

    def prompt(self) -> str:
        """The base prompt, then the owner's extra words, within the provider's limit."""
        return _fit(" ".join(p for p in (BASE_PROMPT, self.extra_prompt or "") if p))

    @property
    def available(self) -> bool:
        return self.transcriber is not None

    def transcribe(self, audio: bytes, content_type: str, language: str | None) -> Transcript:
        if self.transcriber is None:
            raise Conflict("speech to text is not configured on this hub")
        kind = content_type.split(";", 1)[0].strip().lower()
        if kind not in AUDIO_TYPES:
            raise Invalid(f"unsupported audio type {kind!r}")
        if not audio:
            raise Invalid("no audio")
        if len(audio) > MAX_AUDIO_BYTES:
            raise Invalid("recording too long")
        return Transcript(text=self.transcriber.transcribe(audio, kind, language or self.language, self.prompt()))


def _fit(text: str) -> str:
    """At most MAX_PROMPT_BYTES of it, cut between characters."""
    return text.encode()[:MAX_PROMPT_BYTES].decode(errors="ignore")
