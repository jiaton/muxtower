"""Which Remote Control session a pane's Claude Code process belongs to.

Claude Code keeps a file per running process, `~/.claude/sessions/<pid>.json`, whose `bridgeSessionId`
(`session_<id>`) is that process's Remote Control session (`cse_<id>` in the API). The pane's own process
may be a shell, so its children are searched too (some kernels keep no list of children: then every
process's parent is read; on macOS, from `ps`). Its `sessionId` names the transcript Claude Code writes,
`projects/<cwd, every non-alphanumeric as ->/<sessionId>.jsonl`, or where that one says the
conversation went on (`continued`). The file also holds the session's
name (what `/rename` set, or the one Claude Code gave it), which a tmux session goes by unless the owner
named it in muxtower, and says how Claude Code was started
(`entrypoint`: `cli`, `sdk-cli`, the desktop app or an IDE…), which is what the session's origin is. Its
`tmux` field is not used: workers spawned by `claude remote-control` inherit it from wherever the server
was started.

Claude Code (2.1.322+) can move a pane's conversation to the background (← on an empty prompt): a
`claude daemon run` child of the pane's process takes it on as a new session (`--fork-session`, the same
`--settings`, so its hooks still report as the pane's session), the old transcript ends in `continued-in`
the new one, and the Remote Control bridge moves to that process's file, the pane's left with none. The
pane's session follows it (`moved`): its transcript is the new one, and its Remote Control session the
one of the live process whose `sessionId` is where the transcript went on, so it is listed once."""

import json
import os
import re
import threading
import time
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path

from muxtower.infra.procfs import Children, alive, family, started_at
from muxtower.sessions.models import GitPlace
from muxtower.sessions.naming import AgentName

SEARCH_DEPTH = 3
BRIDGE_PREFIX = "session_"
REMOTE_PREFIX = "cse_"
RUNNING_TTL_SECONDS = 5.0
TAIL_BYTES = 16_384  # the end of a transcript, where a `continued-in` line is
MAX_HOPS = 8
MXT_TMUX = re.compile(r"^mxt-([0-9a-f]{8})")  # muxtower's own tmux sessions: mxt-<its id's first 8>
# A process file is its process's when written after that process started: its startedAt is not before
# the start, but may come well after (12–14 s seen on a loaded machine; a slow start, a resume, a clear). A
# file left by an earlier process whose pid is now another's was written before this one started. The
# start is read to the second (`ps -o lstart`), so a little before still counts.
START_SKEW_SECONDS = 2.0
# What Claude Code's agents view says in the pane while the conversation is in the background.
AGENTS_VIEW = "conversation moved to the background"


def _continued_in(path: Path) -> str | None:
    """The session a transcript says it goes on in: its last line, `{"type": "continued-in",
    "continuedInSessionId": …}`, which Claude Code writes when the conversation moves to another
    session (a job, another folder) while its process file still names this one."""
    try:
        with path.open("rb") as f:
            f.seek(max(0, path.stat().st_size - TAIL_BYTES))
            lines = f.read().splitlines()[-3:]
    except OSError:
        return None
    for line in reversed(lines):
        try:
            entry = json.loads(line)
        except ValueError:
            continue
        if isinstance(entry, dict) and entry.get("type") == "continued-in":
            following = entry.get("continuedInSessionId")
            return following if isinstance(following, str) and re.fullmatch(r"[0-9a-f-]{36}", following) else None
    return None


def continued(path: Path, projects_dir: Path) -> str:
    """The transcript a conversation goes on in, following its `continued-in` lines (into any folder)."""
    for _ in range(MAX_HOPS):
        following = _continued_in(path)
        found = next(projects_dir.glob(f"*/{following}.jsonl"), None) if following else None
        if found is None:
            break
        path = found
    return str(path)


def continuations(path: Path, projects_dir: Path) -> list[str]:
    """The sessions a conversation went on in, in order (`continued-in`, followed into any folder); the
    last may have no transcript yet."""
    ids: list[str] = []
    for _ in range(MAX_HOPS):
        following = _continued_in(path)
        if not following or following in ids:
            break
        ids.append(following)
        found = next(projects_dir.glob(f"*/{following}.jsonl"), None)
        if found is None:
            break
        path = found
    return ids


HEAD_LINES = 200  # a transcript's first message is looked for in its first lines (before it: snapshots, a summary)
UUID = re.compile(r"[0-9a-f-]{36}")


def first_message(path: Path) -> str | None:
    """The id (`uuid`) of a transcript's first message (a user's or the agent's): the same id the message
    has in the Remote Control session that carried the conversation (`lineage.Lineage.first`)."""
    try:
        with path.open("rb") as f:
            for _, line in zip(range(HEAD_LINES), f, strict=False):
                try:
                    entry = json.loads(line)
                except ValueError:
                    continue
                if isinstance(entry, dict) and entry.get("type") in ("user", "assistant"):
                    uuid = entry.get("uuid")
                    return uuid if isinstance(uuid, str) and UUID.fullmatch(uuid) else None
    except OSError:
        return None
    return None


@dataclass(frozen=True)
class ClaudeProcess:
    pid: int
    cwd: str
    entrypoint: str | None = None
    machine: str | None = None  # the node it runs on, as its hub knows it; None: this machine
    git: GitPlace | None = None  # its folder's repository, as that node read it (git runs only there)

    @property
    def origin(self) -> str | None:
        """In the vocabulary of Remote Control's `origin` (claude_code_cli, claude_code_sdk_cli…)."""
        return f"claude_code_{self.entrypoint.replace('-', '_')}" if self.entrypoint else None


def _ticks(pid: int, proc: Path) -> str | None:
    """When a process started, in clock ticks after boot (/proc/<pid>/stat's field 22), as Claude Code
    writes it in a process file (`procStart`)."""
    try:
        return (proc / str(pid) / "stat").read_text().rsplit(")", 1)[1].split()[19]
    except (OSError, IndexError):
        return None


def runs(pid: int, info: dict[str, object], proc: Path = Path("/proc"), listed: bool = False) -> bool:
    """Whether the process a file names still runs, and is the one that wrote it: after a restart, its pid
    may be another process's (a file left from before is no live Claude Code). Linux: the start Claude Code
    wrote (`procStart`) is the process's own; else (macOS) the file's `startedAt` is not before the process's
    start (`START_SKEW_SECONDS`), however long after. A file that says neither is taken as it is, if its pid
    is alive (`listed`: found in a live process tree, so it is)."""
    if not listed and not alive(pid):
        return False
    written = info.get("procStart")
    if isinstance(written, str | int) and str(written).isdigit() and (ticks := _ticks(pid, proc)) is not None:
        return str(written) == ticks
    at = info.get("startedAt")
    if isinstance(at, int | float) and (start := started_at(pid, proc)) is not None:
        return at / 1000 >= start - START_SKEW_SECONDS
    return True


def _remote_id(info: object) -> str | None:
    bridge = info.get("bridgeSessionId") if isinstance(info, dict) else None
    if isinstance(bridge, str) and bridge.startswith(BRIDGE_PREFIX):
        return REMOTE_PREFIX + bridge.removeprefix(BRIDGE_PREFIX)
    return None


class ClaudeProcesses:
    def __init__(self, claude_dir: Path | None = None, proc: Path = Path("/proc")) -> None:
        self.proc = proc
        home = claude_dir or Path(os.environ.get("CLAUDE_CONFIG_DIR") or Path.home() / ".claude")
        self.sessions_dir = home / "sessions"
        self.projects_dir = home / "projects"
        self._running: tuple[float, dict[str, ClaudeProcess]] = (0.0, {})
        self._firsts: dict[Path, str] = {}  # each transcript's first message (never changes once written)
        self._firsts_lock = threading.Lock()

    def _info(self, pane_pid: int) -> dict[str, object] | None:
        """The process file of the pane's Claude Code, if it runs one."""
        for pid in family(pane_pid, Children(self.proc), SEARCH_DEPTH):
            try:
                info = json.loads((self.sessions_dir / f"{pid}.json").read_text())
            except (OSError, ValueError):
                continue
            if not isinstance(info, dict):
                return None
            if runs(pid, info, self.proc, listed=True):
                return info  # else a file left from before a restart, its pid now this one's: not its own
        return None

    def _path(self, info: dict[str, object]) -> Path | None:
        """The transcript a process file names (not followed)."""
        if not isinstance(info.get("sessionId"), str) or not isinstance(info.get("cwd"), str):
            return None
        return self.projects_dir / re.sub(r"[^A-Za-z0-9]", "-", str(info["cwd"])) / f"{info['sessionId']}.jsonl"

    def _moved_to(self, info: dict[str, object]) -> dict[str, object] | None:
        """The live process the pane's conversation was moved to (Claude Code's background), when its own
        process has no bridge and its transcript went on in a session a live process runs: the latest."""
        if _remote_id(info) or not (path := self._path(info)) or not path.is_file():
            return None
        ids = continuations(path, self.projects_dir)
        if not ids:
            return None
        best: tuple[int, dict[str, object]] | None = None
        for file in self.sessions_dir.glob("*.json"):
            try:
                other = json.loads(file.read_text())
                pid = int(other.get("pid") or file.stem)
            except (OSError, ValueError, AttributeError):
                continue
            at = ids.index(other["sessionId"]) if other.get("sessionId") in ids else -1
            if at >= 0 and (best is None or at > best[0]) and runs(pid, other, self.proc):
                best = (at, other)
        return best[1] if best else None

    def remote_id(self, pane_pid: int, screen: str = "") -> str | None:
        info = self._info(pane_pid)
        if not info:
            return None  # no Claude Code
        moved = self._moved_to(info)
        return _remote_id(moved or info)  # None: one without Remote Control

    def moved(self, pane_pid: int, screen: str = "") -> bool:
        """The pane shows Claude Code's agents view, its conversation running in the background (moved there
        by Claude Code). Once Enter brings it back into the pane, the transcript still says it went on
        elsewhere, but the screen no longer says so: only then is it not."""
        if AGENTS_VIEW not in " ".join(screen.split()):
            return False
        info = self._info(pane_pid)
        return bool(info and self._moved_to(info))

    def former_remote_ids(self, pane_pid: int) -> list[str]:
        """Remote Control sessions this pane's conversation ran before its own process's: those of process
        files whose process is gone (or that are left from before a restart) for the same conversation, or for one whose
        transcript went on into it (a resume, a move to the background). Never a fork: a fork goes on in
        a conversation of its own."""
        info = self._info(pane_pid)
        current = info.get("sessionId") if info else None
        if not info or not isinstance(current, str):
            return []
        own = self.remote_id(pane_pid)
        found = []
        for file in self.sessions_dir.glob("*.json"):
            try:
                other = json.loads(file.read_text())
                pid = int(other.get("pid") or file.stem)
            except (OSError, ValueError, AttributeError):
                continue
            remote_id = _remote_id(other)
            if not remote_id or remote_id == own or runs(pid, other, self.proc):
                continue  # a process still running is a session of its own (the same conversation resumed twice)
            if other.get("sessionId") == current or (
                (path := self._path(other)) is not None and path.is_file()
                and current in continuations(path, self.projects_dir)
            ):  # fmt: skip
                found.append(remote_id)
        return sorted(set(found))

    def name(self, pane_pid: int, screen: str = "") -> str | None:
        """The session's name in Claude Code (what `/rename` set, or the one it gave itself)."""
        info = self._info(pane_pid)
        name = info.get("name") if info else None
        return (name.strip()[:80] or None) if isinstance(name, str) else None

    def name_origin(self, pane_pid: int, screen: str = "") -> AgentName | None:
        """Where that name came from (`nameSource`: "user" or "derived") and since when (`nameSince`, ms)."""
        info = self._info(pane_pid)
        source = info.get("nameSource") if info else None
        if not isinstance(source, str):
            return None
        since = info.get("nameSince") if info else None
        at = datetime.fromtimestamp(since / 1000, UTC) if isinstance(since, int | float) else None
        return AgentName(source, at)

    def transcript(self, pane_pid: int, screen: str = "") -> str | None:
        """The transcript file of the pane's Claude Code session, when it exists."""
        info = self._info(pane_pid)
        path = self._path(info) if info else None
        return continued(path, self.projects_dir) if path and path.is_file() else None

    def transcript_for(self, agent_id: str) -> str | None:
        """The transcript of a conversation by its own id (a session whose process is gone: interrupted), or
        where it went on (`continued`); None when there is none here."""
        if not re.fullmatch(r"[0-9a-f-]{36}", agent_id):
            return None
        found = next(self.projects_dir.glob(f"*/{agent_id}.jsonl"), None)
        return continued(found, self.projects_dir) if found else None

    def agent_for_remote(self, remote_id: str) -> str | None:
        """The conversation's own id of a Remote Control session, from a process file that named it (left
        after its process ended, until Claude Code tidies it away); None when none is left."""
        for path in self.sessions_dir.glob("*.json"):
            try:
                info = json.loads(path.read_text())
            except (OSError, ValueError):
                continue
            agent = info.get("sessionId") if isinstance(info, dict) else None
            if _remote_id(info) == remote_id and isinstance(agent, str) and re.fullmatch(r"[0-9a-f-]{36}", agent):
                return agent
        return None

    def _first_of(self, path: Path) -> str | None:
        with self._firsts_lock:
            known = self._firsts.get(path)
        if known is None and (known := first_message(path)) is not None:
            with self._firsts_lock:
                self._firsts[path] = known  # one with no message yet is read again
        return known

    def starting_with(self, first: str) -> list[Path]:
        """Blocking (files). The transcripts whose first message is `first`: its conversation's own, and the
        copies a fork or a resume made of it."""
        return [p for p in self.projects_dir.glob("*/*.jsonl") if self._first_of(p) == first]

    def carries(self, transcript: str, first: str) -> bool:
        """Blocking (files). Whether the conversation whose first message is `first` (a Remote Control
        session's, `Lineage.first`) is the one this transcript is written for: it starts with that message
        (the conversation itself, or a resume of it), or a transcript that does went on into this one
        (`continued-in`: a move to the background, another folder). A fork starts with it too: the caller
        leaves forks out."""
        current = Path(transcript)
        if self._first_of(current) == first:
            return True
        return any(current.stem in continuations(p, self.projects_dir) for p in self.starting_with(first))

    def ended_bridges(self) -> dict[str, str]:
        """Remote Control sessions of muxtower's own tmux sessions whose Claude Code has ended (its process
        file is left, its process gone or another's): each to the first 8 of that muxtower session's id, as
        its tmux session is named. A bridge some process still runs is none of them."""
        found: dict[str, str] = {}
        for path in self.sessions_dir.glob("*.json"):
            try:
                info = json.loads(path.read_text())
                pid = int(info.get("pid") or path.stem)
            except (OSError, ValueError, AttributeError):
                continue
            remote_id, tmux = _remote_id(info), info.get("tmux")
            if not remote_id or not isinstance(tmux, str) or info.get("kind", "interactive") != "interactive":
                continue  # a worker of `claude remote-control` inherits the tmux of wherever its server runs
            if (named := MXT_TMUX.match(tmux)) and not runs(pid, info, self.proc):
                found[remote_id] = named.group(1)
        running = self.running()
        return {remote_id: prefix for remote_id, prefix in found.items() if remote_id not in running}

    def running(self) -> dict[str, ClaudeProcess]:
        """Every Claude Code process alive on this machine that runs Remote Control, by remote session
        id, in tmux or not (e.g. workers of `claude remote-control`). Cached for a few seconds."""
        at, found = self._running
        if time.monotonic() - at < RUNNING_TTL_SECONDS:
            return found
        found = {}
        for path in self.sessions_dir.glob("*.json"):
            try:
                info = json.loads(path.read_text())
                pid = int(info.get("pid") or path.stem)
            except (OSError, ValueError, AttributeError):
                continue
            remote_id = _remote_id(info)
            if remote_id and runs(pid, info, self.proc):
                entrypoint = info.get("entrypoint")
                found[remote_id] = ClaudeProcess(
                    pid=pid, cwd=str(info.get("cwd") or ""), entrypoint=str(entrypoint) if entrypoint else None
                )
        self._running = (time.monotonic(), found)
        return found
