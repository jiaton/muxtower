"""The only code that runs tmux. Plain subprocess calls (argv lists, never a shell) with a timeout."""

import logging
import os
import subprocess

from muxtower.terminal.ports import PaneInfo, PaneRef

logger = logging.getLogger("muxtower.tmux")

DEFAULT_SOCKET = "default"
TIMEOUT_SECONDS = 3.0
_FIELDS = (
    "#{pane_id}\t#{session_name}\t#{pane_current_command}\t#{pane_current_path}\t#{pane_pid}\t#{socket_path}"
    "\t#{window_activity}\t#{alternate_on}\t#{session_attached}"
)
# What marks a process as running inside a Claude Code session (its id, its Remote Control bridge, "child
# session"). A daemon started from one inherits it, and so would a tmux server it starts: an agent launched
# there would take itself for that session's child (no transcript kept, the wrong bridge). Only these, not
# the owner's own settings (CLAUDE_CODE_USE_BEDROCK, CLAUDE_CONFIG_DIR…).
INSIDE_CLAUDE = frozenset({
    "CLAUDECODE", "CLAUDE_PID", "CLAUDE_EFFORT", "CLAUDE_CODE_ENTRYPOINT", "CLAUDE_CODE_CHILD_SESSION",
    "CLAUDE_CODE_SESSION_ID", "CLAUDE_CODE_SESSION_ATTENDED", "CLAUDE_CODE_EXECPATH", "CLAUDE_CODE_VERSION",
    "CLAUDE_CODE_ENVIRONMENT_KIND", "CLAUDE_CODE_WORKER_EPOCH",
})  # fmt: skip
INSIDE_CLAUDE_PREFIXES = ("CLAUDE_CODE_BRIDGE_", "CLAUDE_CODE_MESSAGING_")


def inside_claude(name: str) -> bool:
    return name in INSIDE_CLAUDE or name.startswith(INSIDE_CLAUDE_PREFIXES)


def without_inside_claude(argv: list[str], names: set[str]) -> list[str]:
    """`argv` run with those of `names` that mark another Claude Code session unset."""
    unset = [arg for name in sorted(names) if inside_claude(name) for arg in ("-u", name)]
    return ["env", *unset, *argv] if unset else argv


# A daemon started from inside tmux inherits $TMUX, which would make plain `tmux` (the "default" socket)
# talk to that server instead of the user's default one.
_ENV = {k: v for k, v in os.environ.items() if k not in ("TMUX", "TMUX_PANE") and not inside_claude(k)}


class TmuxError(Exception):
    pass


class TmuxCli:
    def __init__(self, binary: str = "tmux") -> None:
        self.binary = binary

    def _base(self, socket: str) -> list[str]:
        return [self.binary] if socket == DEFAULT_SOCKET else [self.binary, "-L", socket]

    def _run(
        self, socket: str, *args: str, check: bool = True, stdin: str | None = None
    ) -> subprocess.CompletedProcess[str]:
        try:
            result = subprocess.run(  # noqa: S603 - argv list, no shell
                [*self._base(socket), *args], capture_output=True, text=True, timeout=TIMEOUT_SECONDS, env=_ENV,
                input=stdin,
            )  # fmt: skip
        except (OSError, subprocess.TimeoutExpired) as exc:
            raise TmuxError(f"tmux {args[0]}: {exc}") from exc
        if check and result.returncode != 0:
            raise TmuxError(result.stderr.strip() or f"tmux {args[0]} failed")
        return result

    def new_session(
        self, socket: str, name: str, cwd: str, argv: list[str], env: dict[str, str], cols: int, rows: int
    ) -> PaneRef:
        env_args = [arg for key, value in env.items() for arg in ("-e", f"{key}={value}")]
        # A server already running keeps the environment it started with: whatever it has is unset too.
        shown = self._run(socket, "show-environment", "-g", check=False).stdout
        names = {line.lstrip("-").split("=", 1)[0] for line in shown.splitlines()} | set(os.environ)
        # Several command arguments make tmux exec them directly, without a shell.
        result = self._run(
            socket,
            "new-session", "-d", "-s", name, "-c", cwd, "-x", str(cols), "-y", str(rows),
            *env_args, "-P", "-F", "#{pane_id}", "--", *without_inside_claude(argv, names),
        )  # fmt: skip
        return PaneRef(socket=socket, pane_id=result.stdout.strip())

    def list_panes(self, socket: str) -> list[PaneInfo]:
        result = self._run(socket, "list-panes", "-a", "-F", _FIELDS, check=False)
        if result.returncode != 0:
            return []  # no server running on this socket
        panes = []
        for line in result.stdout.splitlines():
            parts = line.split("\t")
            if len(parts) == 9:
                pid = int(parts[4]) if parts[4].isdigit() else 0
                activity = int(parts[6]) if parts[6].isdigit() else 0
                alternate, attached = parts[7] == "1", parts[8] not in ("", "0")
                pane_id, session, command, cwd, server = parts[0], parts[1], parts[2], parts[3], parts[5]
                info = PaneInfo(socket, pane_id, session, command, cwd, pid, server, activity, alternate, attached)
                panes.append(info)
        return panes

    def capture(self, pane: PaneRef, ansi: bool = False, history: int = 0) -> str | None:
        """The pane's text (`ansi`: with its colors, for showing it). Plain text joins wrapped lines (-J),
        so screen rules see a sentence whole; shown text does not, since a pane made narrower (a phone
        fitting it) rewraps its history, and joined back those lines are wider than the pane."""
        args = ["capture-pane", "-p", "-t", pane.pane_id]
        args.append("-e" if ansi else "-J")
        if history:
            args += ["-S", f"-{history}"]
        result = self._run(pane.socket, *args, check=False)
        if result.returncode != 0:
            return None  # pane is gone
        return result.stdout.rstrip("\n")

    def send_text(self, pane: PaneRef, text: str) -> None:
        self._run(pane.socket, "send-keys", "-t", pane.pane_id, "-l", "--", text)

    def paste(self, pane: PaneRef, text: str) -> None:
        """As a paste (bracketed, when the app asked for it): Claude Code takes a pasted image path for the
        image itself."""
        buffer = f"mxt-{pane.pane_id.lstrip('%')}"
        self._run(pane.socket, "load-buffer", "-b", buffer, "-", stdin=text)
        self._run(pane.socket, "paste-buffer", "-p", "-d", "-b", buffer, "-t", pane.pane_id)

    def send_key(self, pane: PaneRef, key: str) -> None:
        self._run(pane.socket, "send-keys", "-t", pane.pane_id, key)

    def resize(self, pane: PaneRef, cols: int, rows: int) -> None:
        """Size the *pane* to cols x rows. tmux sizes windows: the window gets the pane's size plus the
        room its other panes (a split) take, then the pane itself is set, since tmux spreads a window
        resize over all its panes."""
        sizes = self._run(
            pane.socket, "display-message", "-p", "-t", pane.pane_id,
            "#{window_width} #{window_height} #{pane_width} #{pane_height}",
        ).stdout.split()  # fmt: skip
        extra_cols, extra_rows = 0, 0
        if len(sizes) == 4 and all(v.isdigit() for v in sizes):
            window_w, window_h, pane_w, pane_h = map(int, sizes)
            extra_cols, extra_rows = window_w - pane_w, window_h - pane_h
        width, height = str(cols + extra_cols), str(rows + extra_rows)
        self._run(pane.socket, "resize-window", "-t", pane.pane_id, "-x", width, "-y", height)
        if extra_cols or extra_rows:
            self._run(pane.socket, "resize-pane", "-t", pane.pane_id, "-x", str(cols), "-y", str(rows), check=False)

    def release_size(self, pane: PaneRef) -> None:
        """Undo resize(): `resize-window -x/-y` pins the window to a manual size, which would keep a
        laptop that attaches later at the phone's width. Fit the attached clients again, then unset it:
        in that order, since resize-window itself sets window-size to manual."""
        self._run(pane.socket, "resize-window", "-A", "-t", pane.pane_id, check=False)
        self._run(pane.socket, "set-option", "-w", "-u", "-t", pane.pane_id, "window-size", check=False)

    def kill_session(self, socket: str, name: str) -> None:
        self._run(socket, "kill-session", "-t", f"={name}", check=False)

    def kill_pane(self, pane: PaneRef) -> None:
        """Ends what runs in the pane (it gets a hangup) and closes it; an emptied window closes too."""
        self._run(pane.socket, "kill-pane", "-t", pane.pane_id, check=False)
