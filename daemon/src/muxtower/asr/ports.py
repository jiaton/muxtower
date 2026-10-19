from typing import Protocol


class Transcriber(Protocol):
    def transcribe(self, audio: bytes, content_type: str, language: str | None) -> str:
        """Blocking; raises Unavailable when the provider cannot be reached or refuses."""
        ...
