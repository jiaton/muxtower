"""Which processes a process started (a tmux pane's shell and the agent it runs), and whether one is
alive: from /proc on Linux, from the kernel itself on macOS (`libproc.py`), and from `ps` and `lsof` where
neither answers. Those are slow (tens of ms a
call, more for lsof) and every pane asks each tick, several times: their answers are kept a few seconds
(`_kept`), so a tick costs a few calls, not dozens."""

import ctypes
import os
import shlex
import subprocess
import threading
import time
from collections.abc import Callable, Iterable, Iterator
from pathlib import Path
from typing import TypeVar

from muxtower.infra.libproc import LibProc, libproc

PS_TIMEOUT_SECONDS = 2
T = TypeVar("T")
TABLE_SECONDS = 2.0  # the process table (who started whom) from `ps`
PROCESS_SECONDS = 5.0  # one process's command line, folder, start and open files from `ps` / `lsof`

_known: dict[tuple[object, ...], tuple[float, object]] = {}
_lock = threading.Lock()


def _kernel(ask: Callable[[LibProc], T | None]) -> T | None:
    """What the macOS kernel answers (`libproc.py`), or None where it is not there or will not tell."""
    kernel = libproc()
    if kernel is None:
        return None
    try:
        return ask(kernel)
    except (OSError, ValueError, ctypes.ArgumentError):
        return None


def _kept(key: tuple[object, ...], seconds: float, read: Callable[[], T]) -> T:
    """What `read` returns, kept `seconds` under `key` (only for the outside tools: /proc is cheap)."""
    now = time.monotonic()
    with _lock:
        known = _known.get(key)
        if known is not None and now - known[0] < seconds:
            return known[1]  # type: ignore[return-value]
    value = read()
    with _lock:
        if len(_known) > 4096:  # drop what is old before it grows
            for k in [k for k, (at, _) in _known.items() if now - at >= PROCESS_SECONDS]:
                del _known[k]
        _known[key] = (now, value)
    return value


def alive(pid: int) -> bool:
    try:
        os.kill(pid, 0)
    except ProcessLookupError:
        return False
    except PermissionError:  # someone else's: alive
        return True
    except OSError:
        return False
    return True


class Children:
    """Children of processes, for one search: from `/proc/<pid>/task/*/children` where the kernel keeps it,
    else (kernels built without it, or no /proc at all) from every process's parent, read once."""

    def __init__(self, proc: Path = Path("/proc")) -> None:
        self.proc = proc
        self._by_parent: dict[int, list[int]] | None = None

    def __call__(self, pid: int) -> list[int]:
        found: list[int] = []
        try:
            for task in (self.proc / str(pid) / "task").iterdir():
                found += [int(c) for c in (task / "children").read_text().split()]
            return found
        except FileNotFoundError:
            pass
        except (OSError, ValueError):
            return found
        if self._by_parent is None:
            self._by_parent = {}
            for child, parent in self._parents():
                self._by_parent.setdefault(parent, []).append(child)
        return self._by_parent.get(pid, [])

    def _parents(self) -> Iterator[tuple[int, int]]:
        """(pid, parent pid) of every process, from `/proc/<pid>/stat`: the parent is the second field
        after the command name, which is in parentheses and may hold anything. Without /proc, from `ps`."""
        if not self.proc.is_dir():
            yield from _kept(
                ("ps-parents",), TABLE_SECONDS, lambda: _kernel(lambda k: k.parents()) or list(_ps_parents())
            )
            return
        for entry in self.proc.iterdir():
            if not entry.name.isdigit():
                continue
            try:
                fields = (entry / "stat").read_text().rsplit(")", 1)[1].split()
                yield int(entry.name), int(fields[1])
            except (OSError, IndexError, ValueError):
                continue


def _ps_parents() -> Iterator[tuple[int, int]]:
    try:
        out = subprocess.run(  # noqa: S603 - fixed argv
            ["ps", "-Ao", "pid=,ppid="],  # noqa: S607 - resolved via PATH on purpose
            capture_output=True, text=True, timeout=PS_TIMEOUT_SECONDS, check=True,
        ).stdout  # fmt: skip
    except (OSError, subprocess.SubprocessError):
        return
    for line in out.splitlines():
        fields = line.split()
        if len(fields) == 2 and fields[0].isdigit() and fields[1].isdigit():
            yield int(fields[0]), int(fields[1])


def family(pid: int, children: Children, depth: int) -> Iterator[int]:
    """The process and those it started, down to `depth` generations, parents first."""
    yield pid
    if depth:
        for child in children(pid):
            yield from family(child, children, depth - 1)


def _tool(argv: list[str]) -> str:
    """Output of a process-listing tool in the C locale; empty when it is missing or fails."""
    try:
        return subprocess.run(  # noqa: S603 - fixed argv
            argv, capture_output=True, text=True, timeout=PS_TIMEOUT_SECONDS, check=False,
            env={**os.environ, "LC_ALL": "C"},
        ).stdout  # fmt: skip
    except (OSError, subprocess.SubprocessError):
        return ""


def argv_of(pid: int, proc: Path = Path("/proc")) -> list[str] | None:
    """A process's command line."""
    if proc.is_dir():
        try:
            return (proc / str(pid) / "cmdline").read_bytes().decode(errors="replace").rstrip("\0").split("\0")
        except OSError:
            return None
    if (argv := _kernel(lambda k: k.argv(pid))) is not None:
        return argv or None
    line = _kept(("argv", pid), PROCESS_SECONDS, lambda: _tool(["ps", "-o", "command=", "-p", str(pid)])).strip()
    try:
        return shlex.split(line) if line else None
    except ValueError:
        return line.split() or None


def cwd_of(pid: int, proc: Path = Path("/proc")) -> str | None:
    """The folder a process runs in."""
    if proc.is_dir():
        try:
            return os.readlink(proc / str(pid) / "cwd")
        except OSError:
            return None
    if (cwd := _kernel(lambda k: k.cwd(pid))) is not None:
        return cwd
    out = _kept(("cwd", pid), PROCESS_SECONDS, lambda: _tool(["lsof", "-a", "-d", "cwd", "-p", str(pid), "-Fn"]))
    names = [line[1:] for line in out.splitlines() if line[:1] == "n"]
    return names[0] if names else None


def started_at(pid: int, proc: Path = Path("/proc")) -> float | None:
    """When a process started (epoch seconds)."""
    if proc.is_dir():
        try:
            ticks = int((proc / str(pid) / "stat").read_text().rsplit(")", 1)[1].split()[19])
            boot = next(
                int(line.split()[1]) for line in (proc / "stat").read_text().splitlines() if line.startswith("btime ")
            )
        except (OSError, IndexError, ValueError, StopIteration):
            return None
        return boot + ticks / os.sysconf("SC_CLK_TCK")
    if (started := _kernel(lambda k: k.started(pid))) is not None:
        return started
    try:
        return time.mktime(
            time.strptime(
                _kept(
                    ("started", pid), PROCESS_SECONDS, lambda: _tool(["ps", "-o", "lstart=", "-p", str(pid)])
                ).strip(),
                "%a %b %d %H:%M:%S %Y",
            )
        )
    except ValueError:
        return None


def open_files(pids: Iterable[int], proc: Path = Path("/proc")) -> list[str]:
    """The files the processes hold open (paths only)."""
    pids = list(pids)
    if not pids:
        return []
    if proc.is_dir():
        found: list[str] = []
        for pid in pids:
            try:
                fds = list((proc / str(pid) / "fd").iterdir())
            except OSError:
                continue
            for fd in fds:
                try:
                    found.append(os.readlink(fd))
                except OSError:
                    continue
        return found

    def files_of(pid: int) -> list[str] | None:
        return _kernel(lambda k: k.open_files(pid))

    held = [files_of(pid) for pid in pids]
    if all(h is not None for h in held):
        return [path for h in held for path in h or [] if path.startswith("/")]
    listed = ",".join(map(str, sorted(pids)))
    out = _kept(("open", listed), PROCESS_SECONDS, lambda: _tool(["lsof", "-Fn", "-p", listed]))
    return [line[1:] for line in out.splitlines() if line[:1] == "n" and line[1:2] == "/"]


def all_commands(proc: Path = Path("/proc")) -> dict[int, list[str]]:
    """The command line of every process, in one pass (one `ps` where there is no /proc)."""
    if proc.is_dir():
        found = {
            pid: argv
            for pid in (int(e.name) for e in proc.iterdir() if e.name.isdigit())
            if (argv := argv_of(pid, proc))
        }
        return found
    kernel = libproc()
    if kernel is not None and (pids := kernel.pids()) is not None:
        return {pid: argv for pid in pids if (argv := kernel.argv(pid))}
    found = {}
    for line in _tool(["ps", "-Ao", "pid=,command="]).splitlines():
        pid, _, command = line.strip().partition(" ")
        if pid.isdigit() and command.strip():
            try:
                found[int(pid)] = shlex.split(command)
            except ValueError:
                found[int(pid)] = command.split()
    return found
