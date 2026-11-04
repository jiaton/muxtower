"""Where a project sits in a device's folder tree (`Session.project_anchor`), so a project is nested like
any repository instead of standing apart at the top. Per device (paths differ between machines), worked
out on every listing from the project's live sessions there:

1. the main folder of the repository most of them run in (its worktrees count as it);
2. else, none of them in git, the folder most of them run in;
3. else (no folder known) none: the project stays at the top.

A tie keeps the anchor it had, else goes to the earliest session's, so it does not flip. Sessions of the
project elsewhere are listed inside the project as they are; they never move the anchor."""

import threading
from collections import Counter
from collections.abc import Iterable

from muxtower.sessions.models import Session


def _majority(places: list[tuple[str, Session]], before: str | None) -> str | None:
    if not places:
        return None
    counts = Counter(place for place, _ in places)
    top = max(counts.values())
    tied = {place for place, n in counts.items() if n == top}
    if before in tied:
        return before
    earliest = min((s for place, s in places if place in tied), key=lambda s: (s.created_at, s.id))
    return next(place for place, s in places if s is earliest)


class ProjectAnchors:
    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._anchors: dict[tuple[str, str], str] = {}  # (device, project) → its folder there

    def apply(self, sessions: Iterable[Session]) -> list[Session]:
        listed = list(sessions)
        groups: dict[tuple[str, str], list[Session]] = {}
        for s in listed:
            if s.project and s.project_source != "folder" and not s.archived_at:
                groups.setdefault((s.machine or "", s.project), []).append(s)
        found: dict[tuple[str, str], str] = {}
        with self._lock:
            for key, members in groups.items():
                before = self._anchors.get(key)
                repos = [(s.git.repo, s) for s in members if s.git and s.git.repo]
                folders = [(s.cwd, s) for s in members if s.cwd]
                anchor = _majority(repos, before) if repos else _majority(folders, before)
                if anchor:
                    found[key] = self._anchors[key] = anchor
        return [
            s.model_copy(update={"project_anchor": anchor})
            if s.project and (anchor := found.get((s.machine or "", s.project)))
            else s
            for s in listed
        ]
