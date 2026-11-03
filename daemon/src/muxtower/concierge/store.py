import json
import os
from dataclasses import asdict
from pathlib import Path

from muxtower.concierge.ports import ConciergeState


class FileConciergeStore:
    """The concierge's session id and watch list (they survive restarts), and its private files."""

    def __init__(self, path: Path, files_dir: Path) -> None:
        self.path = path
        self.files_dir = files_dir

    def write_private(self, name: str, content: str) -> Path:
        self.files_dir.mkdir(parents=True, exist_ok=True)
        target = self.files_dir / name
        fd = os.open(target, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
        with os.fdopen(fd, "w") as f:
            f.write(content)
        return target

    def load(self) -> ConciergeState:
        try:
            data = json.loads(self.path.read_text())
            return ConciergeState(
                session_id=data.get("session_id"),
                watched=list(data.get("watched") or []),
                names=dict(data.get("names") or {}),
                events=int(data.get("events") or 0),
            )
        except (OSError, ValueError, AttributeError, TypeError):
            return ConciergeState()

    def save(self, state: ConciergeState) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.path.write_text(json.dumps(asdict(state)))
