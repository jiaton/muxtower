from typing import Protocol


class Summarizer(Protocol):
    def summarize(self, instructions: str, text: str) -> str:
        """Blocking; raises Unavailable when the model cannot be reached or fails."""
        ...


class SummaryRepository(Protocol):
    def recent(self, limit: int) -> dict[str, str]: ...
    def save(self, reply_hash: str, summary: str) -> None: ...
