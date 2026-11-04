"""What the process uses, read cheaply: /proc where there is one (Linux), the kernel's own calls on macOS
(`infra/libproc.py`), the standard library otherwise. None where it cannot be read, never a made-up 0. No
outside commands."""

import os
import resource
import sys
import threading
from pathlib import Path

from muxtower.infra.libproc import libproc
from muxtower.infra.procfs import Children

PROC = Path("/proc")
CLOCK_TICKS = os.sysconf("SC_CLK_TCK") if hasattr(os, "sysconf") and "SC_CLK_TCK" in os.sysconf_names else 100


def cpu_seconds() -> float:
    """CPU time this process has used, user and system."""
    times = os.times()
    return times.user + times.system


def _task(pid: int | str) -> tuple[float, float, int] | None:
    kernel = libproc()
    return kernel.task(os.getpid() if pid == "self" else int(pid)) if kernel else None


def rss_mb(pid: int | str = "self", proc: Path = PROC) -> float | None:
    if not proc.is_dir():
        task = _task(pid)
        return task[0] if task else None
    try:
        for line in (proc / str(pid) / "status").read_text().splitlines():
            if line.startswith("VmRSS:"):
                return int(line.split()[1]) / 1024
    except (OSError, ValueError, IndexError):
        return None
    return None


def peak_rss_mb() -> float | None:
    peak = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss
    return peak / (1024 * 1024) if sys.platform == "darwin" else peak / 1024  # bytes there, KiB here


def threads(proc: Path = PROC) -> int | None:
    try:
        for line in (proc / "self" / "status").read_text().splitlines():
            if line.startswith("Threads:"):
                return int(line.split()[1])
    except (OSError, ValueError, IndexError):
        pass
    if not proc.is_dir():
        task = _task("self")
        return task[2] if task else threading.active_count()  # Python's own, where nothing else tells
    return None


def open_files() -> int | None:
    for fds in ("/proc/self/fd", "/dev/fd"):  # Linux; macOS
        try:
            return max(len(os.listdir(fds)) - 1, 0)  # less the one listing it
        except OSError:
            continue
    return None


def children(proc: Path = PROC) -> list[tuple[int, str, float]] | None:
    """(pid, name, CPU seconds) of this process's children, or None without /proc (macOS: only `ps` knows,
    and no outside command runs here)."""
    if not proc.is_dir():
        kernel = libproc()
        if kernel is None or (table := kernel.parents()) is None:
            return None
        mine = sorted(pid for pid, parent in table if parent == os.getpid())
        return [(pid, info[1], task[1]) for pid in mine if (info := kernel.bsd(pid)) and (task := kernel.task(pid))]
    found = []
    for pid in sorted(Children(proc)(os.getpid())):
        try:
            name = (proc / str(pid) / "comm").read_text().strip()
            fields = (proc / str(pid) / "stat").read_text().rsplit(")", 1)[1].split()
            found.append((pid, name, (int(fields[11]) + int(fields[12])) / CLOCK_TICKS))  # utime, stime
        except (OSError, ValueError, IndexError):
            continue
    return found
