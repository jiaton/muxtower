"""What project a folder belongs to, read from git on this machine: its origin remote (the same repository
cloned at other paths, or on other machines, is one project), else its repository's top folder (its
worktrees together), else the folder itself."""

import os
import re
import subprocess

from muxtower.teams.ports import Checkout

GIT_SECONDS = 3.0


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
    """Blocking (git). For a folder on this machine."""
    name = os.path.basename(cwd.rstrip("/")) or cwd
    if not os.path.isdir(cwd):
        return Checkout(name, "folder")
    root = _git(cwd, "rev-parse", "--show-toplevel")
    if root is None:
        return Checkout(name, "folder")
    branch = _git(cwd, "rev-parse", "--abbrev-ref", "HEAD")
    common = _git(cwd, "rev-parse", "--path-format=absolute", "--git-common-dir")
    main_root = os.path.dirname(common) if common and common.endswith("/.git") else root
    if remote := _git(cwd, "config", "--get", "remote.origin.url"):
        return Checkout(remote_name(remote), "git remote", root, branch)
    return Checkout(os.path.basename(main_root) or main_root, "git root", root, branch)
