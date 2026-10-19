from muxtower.asr.models import Transcript
from muxtower.asr.ports import Transcriber
from muxtower.errors import Conflict, Invalid

MAX_AUDIO_BYTES = 4 * 1024 * 1024  # ~2 minutes of 16 kHz mono 16-bit WAV
AUDIO_TYPES = ("audio/wav", "audio/x-wav", "audio/webm", "audio/ogg", "audio/mpeg", "audio/mp4", "audio/m4a")


class AsrService:
    def __init__(self, transcriber: Transcriber | None, language: str | None) -> None:
        self.transcriber = transcriber
        self.language = language

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
        return Transcript(text=self.transcriber.transcribe(audio, kind, language or self.language))
