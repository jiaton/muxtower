"""What the process uses, read cheaply: /proc where there is one (Linux), the standard library otherwise.
None where it cannot be read, never a made-up 0. No outside commands."""

import os
import resource
import sys
import threading
from pathlib import Path

from muxtower.infra.procfs import Children

PROC = Path("/proc")
CLOCK_TICKS = os.sysconf("SC_CLK_TCK") if hasattr(os, "sysconf") and "SC_CLK_TCK" in os.sysconf_names else 100


def cpu_seconds() -> float:
    """CPU time this process has used, user and system."""
    times = os.times()
    return times.user + times.system


def rss_mb(pid: int | str = "self", proc: Path = PROC) -> float | None:
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
    return threading.active_count() if not proc.is_dir() else None  # Python's own, where there is no /proc


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
        return None
    found = []
    for pid in sorted(Children(proc)(os.getpid())):
        try:
            name = (proc / str(pid) / "comm").read_text().strip()
            fields = (proc / str(pid) / "stat").read_text().rsplit(")", 1)[1].split()
            found.append((pid, name, (int(fields[11]) + int(fields[12])) / CLOCK_TICKS))  # utime, stime
        except (OSError, ValueError, IndexError):
            continue
    return found
