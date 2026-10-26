"""Reading /proc: which processes a process started (a tmux pane's shell and the agent it runs)."""

from collections.abc import Iterator
from pathlib import Path


class Children:
    """Children of processes, for one search: from `/proc/<pid>/task/*/children` where the kernel keeps it,
    else (kernels built without it) from every process's parent, read once."""

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
        after the command name, which is in parentheses and may hold anything."""
        for entry in self.proc.iterdir():
            if not entry.name.isdigit():
                continue
            try:
                fields = (entry / "stat").read_text().rsplit(")", 1)[1].split()
                yield int(entry.name), int(fields[1])
            except (OSError, IndexError, ValueError):
                continue


def family(pid: int, children: Children, depth: int) -> Iterator[int]:
    """The process and those it started, down to `depth` generations, parents first."""
    yield pid
    if depth:
        for child in children(pid):
            yield from family(child, children, depth - 1)
