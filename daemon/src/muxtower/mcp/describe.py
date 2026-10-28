"""How the MCP tools say what a session is, keeping three things apart: the device it runs on, what
reaches it (the muxtower daemon on a device, through tmux, headless or Codex's shared app-server, or only the
Claude account's Remote Control), and the agent harness (Claude Code from the CLI, the desktop app…, or Codex). What is
not known is said to be unknown: a session nobody places is not the hub's."""

from muxtower.nodes.processes import platform_of
from muxtower.sessions.models import Session
from muxtower.sessions.ports import SessionSource

HARNESSES = {"claude-code": "Claude Code", "codex": "Codex"}
# Where it was started, from `origin` (as the app's facets.ts reads it).
ORIGINS = (
    ("desktop", "desktop app"), ("android", "Android app"), ("ios", "iOS app"), ("mobile", "mobile app"),
    ("vscode", "VS Code"), ("jetbrains", "JetBrains"), ("sdk", "SDK"), ("web", "web"), ("claude_ai", "web"),
    ("cli", "CLI"),
)  # fmt: skip
PLATFORMS = {"darwin": "a Mac", "win32": "a Windows PC"}


def device(s: Session) -> str:
    if s.machine:
        return s.machine
    kind = PLATFORMS.get(platform_of(s.cwd) or "")
    return f"unknown device ({kind}, by its folder)" if kind else "unknown device"


def harness(s: Session) -> str:
    name = HARNESSES.get(s.runtime, s.runtime)
    if s.source is SessionSource.CODEX:
        return f"{name} (headless)"
    origin = (s.origin or "").lower()
    started = next((label for key, label in ORIGINS if key in origin), None)
    return f"{name} ({started})" if started else name


def reached(s: Session, hub: str) -> str:
    daemon = f"muxtower on {s.node or hub}"
    also = (
        (", also in Codex's shared app-server" if s.runtime == "codex" else ", also Remote Control")
        if s.remote_id
        else ""
    )
    if s.source is SessionSource.LAUNCHED:
        return f"{daemon}: started in tmux{also}"
    if s.source is SessionSource.ADOPTED:
        return f"{daemon}: found in tmux{also}"
    if s.source is SessionSource.CODEX:
        return f"{daemon}: headless"
    if s.source is SessionSource.CODEX_SHARED:
        return f"{daemon}: in Codex's shared app-server"
    return "the Claude account's Remote Control"


def line(s: Session, hub: str) -> str:
    said = (s.summary.detail or s.summary.recent or "") if s.summary else ""
    if not said and s.last_message and s.last_message.strip():
        said = s.last_message.strip().splitlines()[0][:160]
    flags = [f for f, on in (("archived", s.archived_at), ("hidden", s.hidden), ("offline", s.offline)) if on]
    state = " ".join([s.state.value, *flags]) + (" · NEEDS THE OWNER" if s.needs_attention else "")
    where = f"in {s.cwd}" if s.cwd else "folder unknown"
    if s.fork_of:
        where += f" · {'side chat' if s.side_chat else 'fork'} of {s.fork_of}"
    return f"{s.id} · {s.name} · @{device(s)} · {harness(s)} · via {reached(s, hub)} · {where} · {state} · {said}"
