"""Which hub this daemon joined, as a node: its address, the name it got there and its token (0600)."""

import json
from dataclasses import asdict, dataclass
from pathlib import Path


@dataclass(frozen=True)
class Joined:
    url: str
    name: str
    token: str


class HubStore:
    def __init__(self, path: Path) -> None:
        self.path = path

    def load(self) -> Joined | None:
        try:
            data = json.loads(self.path.read_text())
            return Joined(url=str(data["url"]), name=str(data["name"]), token=str(data["token"]))
        except (OSError, ValueError, KeyError):
            return None

    def save(self, joined: Joined) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.path.touch(mode=0o600)
        self.path.chmod(0o600)
        self.path.write_text(json.dumps(asdict(joined)))

    def clear(self) -> None:
        self.path.unlink(missing_ok=True)
