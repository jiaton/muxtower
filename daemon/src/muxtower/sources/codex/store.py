import json
from pathlib import Path


class FileThreadStore:
    """The ids of the Codex threads muxtower runs, so they are resumed after a restart."""

    def __init__(self, path: Path) -> None:
        self.path = path

    def load(self) -> list[str]:
        try:
            data = json.loads(self.path.read_text())
        except (OSError, ValueError):
            return []
        return [str(t) for t in data] if isinstance(data, list) else []

    def save(self, thread_ids: list[str]) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.path.write_text(json.dumps(thread_ids))
