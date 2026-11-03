"""What project a folder belongs to, read from git on this machine: its origin remote (the same repository
cloned at other paths, or on other machines, is one project), else its repository's top folder (its
worktrees together), else the folder itself."""

import os
import re
import subprocess
import threading
import time
from collections.abc import Callable

from muxtower.teams.ports import Checkout

GIT_SECONDS = 3.0
CACHE_SECONDS = 120.0


def _git(cwd: str, *args: str) -> str | None:
    try:
        done = subprocess.run(  # noqa: S603 - argv list, no shell
            ["git", "-C", cwd, *args], capture_output=True, text=True, timeout=GIT_SECONDS,  # noqa: S607
        )  # fmt: skip
    except (OSError, subprocess.TimeoutExpired):
        return None
    return done.stdout.strip() or None if done.returncode == 0 else None


def remote_name(url: str) -> str:
    """A remote as a project name: its path without host, scheme or .git (`owner/repo`), so the ssh and
    https forms of one repository are the same project."""
    path = re.sub(r"^[a-z+]+://[^/]+/|^[^@/]+@[^:]+:", "", url.strip()).rstrip("/").removesuffix(".git")
    return path.strip("/") or url


def checkout(cwd: str) -> Checkout:
    """Blocking (git). For a folder on this machine: the innermost repository it lies in (a submodule is
    its own), the worktree it is in, and the repository's main folder, which all its worktrees share."""
    name = os.path.basename(cwd.rstrip("/")) or cwd
    if not os.path.isdir(cwd):
        return Checkout(name, "folder")
    told = _git(
        cwd, "rev-parse", "--path-format=absolute", "--show-toplevel", "--git-common-dir", "--abbrev-ref", "HEAD"
    )
    if told is None or len(lines := told.splitlines()) < 3:
        return Checkout(name, "folder")
    root, common, head = lines[0], lines[1], lines[2]
    # A worktree's common dir is its main folder's .git; a submodule's lies in its parent's .git/modules.
    repo = os.path.dirname(common) if common.endswith("/.git") else root
    branch = None if head == "HEAD" else head  # detached
    remote = _git(cwd, "config", "--get", "remote.origin.url")
    project = remote_name(remote) if remote else (os.path.basename(repo) or repo)
    return Checkout(project, "git remote" if remote else "git root", root, branch, repo, remote and remote_name(remote))


class CheckoutCache:
    """`checkout` per folder, read again after a while (a branch changes): every listing asks."""

    def __init__(self, read: Callable[[str], Checkout] = checkout, seconds: float = CACHE_SECONDS) -> None:
        self.read = read
        self.seconds = seconds
        self._lock = threading.Lock()
        self._known: dict[str, tuple[float, Checkout]] = {}

    def get(self, cwd: str) -> Checkout:
        """Blocking (git, when not known or old)."""
        with self._lock:
            known = self._known.get(cwd)
        if known is None or time.monotonic() - known[0] > self.seconds:
            known = (time.monotonic(), self.read(cwd))
            with self._lock:
                self._known[cwd] = known
        return known[1]
