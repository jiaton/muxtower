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
# A daemon started from inside tmux inherits $TMUX, which would make plain `tmux` (the "default" socket)
# talk to that server instead of the user's default one.
_ENV = {k: v for k, v in os.environ.items() if k not in ("TMUX", "TMUX_PANE")}


class TmuxError(Exception):
    pass


class TmuxCli:
    def __init__(self, binary: str = "tmux") -> None:
        self.binary = binary

    def _base(self, socket: str) -> list[str]:
        return [self.binary] if socket == DEFAULT_SOCKET else [self.binary, "-L", socket]

    def _run(self, socket: str, *args: str, check: bool = True) -> subprocess.CompletedProcess[str]:
        try:
            result = subprocess.run(  # noqa: S603 - argv list, no shell
                [*self._base(socket), *args], capture_output=True, text=True, timeout=TIMEOUT_SECONDS, env=_ENV
            )
        except (OSError, subprocess.TimeoutExpired) as exc:
            raise TmuxError(f"tmux {args[0]}: {exc}") from exc
        if check and result.returncode != 0:
            raise TmuxError(result.stderr.strip() or f"tmux {args[0]} failed")
        return result

    def new_session(
        self, socket: str, name: str, cwd: str, argv: list[str], env: dict[str, str], cols: int, rows: int
    ) -> PaneRef:
        env_args = [arg for key, value in env.items() for arg in ("-e", f"{key}={value}")]
        # Several command arguments make tmux exec them directly, without a shell.
        result = self._run(
            socket,
            "new-session", "-d", "-s", name, "-c", cwd, "-x", str(cols), "-y", str(rows),
            *env_args, "-P", "-F", "#{pane_id}", "--", *argv,
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
        args = ["capture-pane", "-p", "-J", "-t", pane.pane_id]
        if ansi:
            args.append("-e")
        if history:
            args += ["-S", f"-{history}"]
        result = self._run(pane.socket, *args, check=False)
        if result.returncode != 0:
            return None  # pane is gone
        return result.stdout.rstrip("\n")

    def send_text(self, pane: PaneRef, text: str) -> None:
        self._run(pane.socket, "send-keys", "-t", pane.pane_id, "-l", "--", text)

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
