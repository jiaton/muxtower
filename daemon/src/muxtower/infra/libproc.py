"""What /proc tells on Linux, read on macOS from the kernel itself (libproc and sysctl, through ctypes), so
nothing has to run `ps` or `lsof` there. Every call answers None when the kernel will not tell (no such
process, not ours, a layout this code does not know), and the caller then asks the outside tools as before.

The structures are those of <sys/proc_info.h>; a reply whose size is not theirs is not trusted."""

import ctypes
import struct
import sys
from functools import cache

PROC_ALL_PIDS = 1
PROC_PIDLISTFDS = 1
PROC_PIDTBSDINFO = 3
PROC_PIDTASKINFO = 4
PROC_PIDVNODEPATHINFO = 9
PROC_PIDFDVNODEPATHINFO = 2
PROX_FDTYPE_VNODE = 1
CTL_KERN, KERN_ARGMAX, KERN_PROCARGS2 = 1, 8, 49
MAXPATHLEN = 1024

BSDINFO_SIZE = 136  # struct proc_bsdinfo
TASKINFO_SIZE = 96  # struct proc_taskinfo
VNODE_INFO_SIZE = 152  # struct vnode_info: vinfo_stat (136), type, pad, fsid
VNODEPATHINFO_SIZE = 2 * (VNODE_INFO_SIZE + MAXPATHLEN)  # struct proc_vnodepathinfo: cwd, then root
FILEINFO_SIZE = 24  # struct proc_fileinfo
FDPATH_SIZE = FILEINFO_SIZE + VNODE_INFO_SIZE + MAXPATHLEN  # struct vnode_fdinfowithpath
FDINFO_SIZE = 8  # struct proc_fdinfo: fd, type


def path_at(raw: bytes, offset: int) -> str | None:
    """A NUL-terminated path in a structure, or None when empty."""
    path = raw[offset : offset + MAXPATHLEN].split(b"\0", 1)[0]
    return path.decode(errors="replace") or None


def bsd_fields(raw: bytes) -> tuple[int, str, float] | None:
    """(parent pid, command name, start in epoch seconds) from a struct proc_bsdinfo."""
    if len(raw) != BSDINFO_SIZE:
        return None
    ppid = struct.unpack_from("<I", raw, 16)[0]  # after flags, status, xstatus, pid
    comm = raw[48:64].split(b"\0", 1)[0].decode(errors="replace")
    seconds, micros = struct.unpack_from("<QQ", raw, 120)
    return ppid, comm, seconds + micros / 1e6


def task_fields(raw: bytes) -> tuple[int, int, int] | None:
    """(resident bytes, CPU time in Mach units, threads) from a struct proc_taskinfo."""
    if len(raw) != TASKINFO_SIZE:
        return None
    _, resident, user, system = struct.unpack_from("<QQQQ", raw, 0)
    threads = struct.unpack_from("<i", raw, 84)[0]
    return resident, user + system, threads


def procargs(raw: bytes) -> list[str] | None:
    """argv from KERN_PROCARGS2: argc, the executable's path, NUL padding, then argc strings."""
    if len(raw) < 4:
        return None
    argc = struct.unpack_from("<i", raw, 0)[0]
    rest = raw[4:]
    end = rest.find(b"\0")  # past the executable's path
    if argc <= 0 or end < 0:
        return None
    rest = rest[end:].lstrip(b"\0")
    args = rest.split(b"\0")[:argc]
    return [a.decode(errors="replace") for a in args] if len(args) == argc else None


class LibProc:
    def __init__(self, libc: ctypes.CDLL) -> None:
        self.c = libc
        self.c.proc_pidinfo.argtypes = [ctypes.c_int, ctypes.c_int, ctypes.c_uint64, ctypes.c_void_p, ctypes.c_int]
        self.c.proc_pidfdinfo.argtypes = [ctypes.c_int, ctypes.c_int, ctypes.c_int, ctypes.c_void_p, ctypes.c_int]
        self.c.proc_listpids.argtypes = [ctypes.c_uint32, ctypes.c_uint32, ctypes.c_void_p, ctypes.c_int]
        # Declared in full: an int passed where size_t is meant leaves the register's top half to chance (arm64).
        self.c.sysctl.argtypes = [
            ctypes.POINTER(ctypes.c_int), ctypes.c_uint, ctypes.c_void_p, ctypes.POINTER(ctypes.c_size_t),
            ctypes.c_void_p, ctypes.c_size_t,
        ]  # fmt: skip
        self.argmax = self._argmax()
        self.timebase = self._timebase()

    def _info(self, pid: int, flavor: int, size: int, arg: int = 0) -> bytes | None:
        buf = ctypes.create_string_buffer(size)
        got = self.c.proc_pidinfo(pid, flavor, arg, buf, size)
        return buf.raw[:got] if got > 0 else None

    def _argmax(self) -> int:
        mib = (ctypes.c_int * 2)(CTL_KERN, KERN_ARGMAX)
        value, size = ctypes.c_int(0), ctypes.c_size_t(ctypes.sizeof(ctypes.c_int))
        ok = self.c.sysctl(mib, 2, ctypes.cast(ctypes.byref(value), ctypes.c_void_p), ctypes.byref(size), None, 0) == 0
        return value.value if ok and value.value > 0 else 256 * 1024

    def _timebase(self) -> float:
        """Nanoseconds in one Mach time unit (1 on Intel, not on Apple silicon)."""

        class Timebase(ctypes.Structure):
            _fields_ = [("numer", ctypes.c_uint32), ("denom", ctypes.c_uint32)]

        info = Timebase()
        try:
            if self.c.mach_timebase_info(ctypes.byref(info)) == 0 and info.denom:
                return float(info.numer) / float(info.denom)
        except AttributeError:
            pass
        return 1.0

    def pids(self) -> list[int] | None:
        size = self.c.proc_listpids(PROC_ALL_PIDS, 0, None, 0)
        if size <= 0:
            return None
        count = size // 4 + 64  # room for some started meanwhile
        buf = (ctypes.c_int * count)()
        got = self.c.proc_listpids(PROC_ALL_PIDS, 0, buf, ctypes.sizeof(buf))
        return [p for p in buf[: got // 4] if p > 0] if got > 0 else None

    def bsd(self, pid: int) -> tuple[int, str, float] | None:
        raw = self._info(pid, PROC_PIDTBSDINFO, BSDINFO_SIZE)
        return bsd_fields(raw) if raw else None

    def parents(self) -> list[tuple[int, int]] | None:
        """(pid, parent pid) of every process."""
        pids = self.pids()
        if pids is None:
            return None
        return [(pid, info[0]) for pid in pids if (info := self.bsd(pid))]

    def argv(self, pid: int) -> list[str] | None:
        mib = (ctypes.c_int * 3)(CTL_KERN, KERN_PROCARGS2, pid)
        buf = ctypes.create_string_buffer(self.argmax)
        size = ctypes.c_size_t(self.argmax)
        if self.c.sysctl(mib, 3, buf, ctypes.byref(size), None, 0) != 0:
            return None
        return procargs(buf.raw[: size.value])

    def cwd(self, pid: int) -> str | None:
        raw = self._info(pid, PROC_PIDVNODEPATHINFO, VNODEPATHINFO_SIZE)
        return path_at(raw, VNODE_INFO_SIZE) if raw and len(raw) == VNODEPATHINFO_SIZE else None

    def started(self, pid: int) -> float | None:
        info = self.bsd(pid)
        return info[2] if info else None

    def open_files(self, pid: int) -> list[str] | None:
        nfds = 4096
        raw = self._info(pid, PROC_PIDLISTFDS, nfds * FDINFO_SIZE)
        if raw is None:
            return None
        found = []
        buf = ctypes.create_string_buffer(FDPATH_SIZE)
        for i in range(len(raw) // FDINFO_SIZE):
            fd, kind = struct.unpack_from("<iI", raw, i * FDINFO_SIZE)
            if kind != PROX_FDTYPE_VNODE:
                continue
            got = self.c.proc_pidfdinfo(pid, fd, PROC_PIDFDVNODEPATHINFO, buf, FDPATH_SIZE)
            if got == FDPATH_SIZE and (path := path_at(buf.raw, FILEINFO_SIZE + VNODE_INFO_SIZE)):
                found.append(path)
        return found

    def task(self, pid: int) -> tuple[float, float, int] | None:
        """(resident MB, CPU seconds, threads) of a process."""
        raw = self._info(pid, PROC_PIDTASKINFO, TASKINFO_SIZE)
        fields = task_fields(raw) if raw else None
        if fields is None:
            return None
        resident, cpu, threads = fields
        return resident / 1048576, cpu * self.timebase / 1e9, threads


@cache
def libproc() -> LibProc | None:
    """The macOS kernel's process calls, or None elsewhere (or when they will not load)."""
    if sys.platform != "darwin":
        return None
    try:
        return LibProc(ctypes.CDLL("/usr/lib/libSystem.B.dylib", use_errno=True))
    except (OSError, AttributeError):
        return None
