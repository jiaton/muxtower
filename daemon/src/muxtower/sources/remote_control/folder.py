"""Where a Remote Control session works, read off its event log (pure; no I/O).

The listing has no working directory. The log has two hints: `system/vcs_state_changed` names the
session's directory, and each tool call carries the directory it ran in (`wire_ingest_context`). The
first wins; without it, the deepest directory that holds most of the tool calls (an agent that cd's
into a subfolder or /tmp now and then still counts as working in its project).
"""

from collections import Counter
from dataclasses import dataclass, field
from pathlib import PurePosixPath
from typing import Any

from muxtower.sources.remote_control.ports import RawEvent

MAX_SEEN = 200  # tool-call directories remembered per session


def _tool_dirs(payload: dict[str, Any]) -> list[str]:
    context = payload.get("wire_ingest_context")
    if not isinstance(context, dict):
        return []
    return [str(v["cwd"]) for v in context.values() if isinstance(v, dict) and v.get("cwd")]


@dataclass
class WorkingFolder:
    declared: str | None = None
    seen: list[str] = field(default_factory=list)

    def feed(self, events: list[RawEvent]) -> None:
        for event in sorted(events, key=lambda e: e.seq):
            payload = event.payload
            if payload.get("type") == "system" and payload.get("subtype") == "vcs_state_changed" and payload.get("cwd"):
                self.declared = str(payload["cwd"])
            self.seen += _tool_dirs(payload)
        del self.seen[:-MAX_SEEN]

    @property
    def cwd(self) -> str:
        if self.declared:
            return self.declared
        if not self.seen:
            return ""
        covered: Counter[str] = Counter()
        for seen in self.seen:
            path = PurePosixPath(seen)
            covered.update(str(p) for p in (path, *path.parents))
        most = [d for d, n in covered.items() if n * 2 > len(self.seen) and d != "/"]
        return max(most, key=lambda d: len(PurePosixPath(d).parts), default="")
