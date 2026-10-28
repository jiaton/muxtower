"""Keeping nodes on their hub's version. Releases are published to PyPI; daemons only tell each other
which version they run.

On every link the hub says its version (event `hub`), before it refuses a node whose protocol it does
not speak. Such a node must update: it installs the hub's version from PyPI (pipx, or pip outside
pipx) and execs itself, the same pid, so a service manager sees no exit. A node that is only older is
told so (`muxtower`, the app's Daemons page) and with `hub.update = "always"` updates itself too;
`"never"` only tells. A source checkout installs nothing, and a failed install (PyPI may serve a release
minutes after it is published) is tried again RETRY_SECONDS later, while the hub still runs that version."""

import importlib.metadata
import json
import logging
import os
import re
import shutil
import subprocess
import sys
import time
from collections.abc import Callable
from typing import Any, Literal

from muxtower import __version__

logger = logging.getLogger("muxtower.update")

Policy = Literal["always", "incompatible", "never"]
VERSION = re.compile(r"^(\d+(?:\.\d+)*)(?:\.?(a|b|rc|dev)(\d*))?$")
INSTALL_SECONDS = 600
RETRY_SECONDS = 600.0
PIPX = ("~/.local/bin/pipx", "/opt/homebrew/bin/pipx", "/usr/local/bin/pipx")  # off a service's PATH


def _key(version: str) -> tuple[tuple[int, ...], int, int] | None:
    found = VERSION.match(version)
    if found is None:
        return None
    release = tuple(int(n) for n in found[1].split("."))
    release += (0,) * (3 - len(release))
    return release, ("dev", "a", "b", "rc", None).index(found[2]), int(found[3] or 0)


def newer(version: str | None, than: str | None) -> bool:
    """Whether `version` is a later release than `than` (PEP 440's plain forms; anything else: no)."""
    a, b = _key(version or ""), _key(than or "")
    return a is not None and b is not None and a > b


def from_source() -> bool:
    """Run from a checkout (an editable install), not a release."""
    try:
        raw = importlib.metadata.distribution("muxtower").read_text("direct_url.json")
    except importlib.metadata.PackageNotFoundError:
        return True
    try:
        return bool(json.loads(raw or "{}").get("dir_info", {}).get("editable"))
    except ValueError:
        return False


def restart() -> None:
    """This daemon, again, with the code just installed (`muxtower serve …` as it was started)."""
    sys.stdout.flush()
    sys.stderr.flush()
    os.execv(sys.executable, [sys.executable, "-m", "muxtower", *sys.argv[1:]])  # noqa: S606 - ourselves


def installer(requirement: str) -> list[str]:
    if os.path.basename(os.path.dirname(sys.prefix)) == "venvs":  # pipx keeps each app in <home>/venvs/<app>
        candidates = [p for p in map(os.path.expanduser, PIPX) if os.access(p, os.X_OK)]
        found = shutil.which("pipx") or next(iter(candidates), None)
        if found:
            return [found, "install", "--force", requirement]
    return [sys.executable, "-m", "pip", "install", requirement]


class Updater:
    def __init__(self, policy: Policy = "incompatible", version: str = __version__) -> None:
        self.policy = policy
        self.version = version
        self.hub: str | None = None  # the hub's version, as it last said
        self.source = from_source()
        self.run: Callable[..., subprocess.CompletedProcess[str]] = subprocess.run
        self.restart = restart
        self.clock = time.monotonic
        self._tried: dict[str, float] = {}  # version -> when its install was last tried

    @property
    def available(self) -> str | None:
        """The hub's version, when it is a later one than this."""
        return self.hub if newer(self.hub, self.version) else None

    def heard(self, data: Any = None) -> str | None:
        """The hub said its version (None: as before): the one to install now, if this node always follows it."""
        if isinstance(data, dict) and isinstance(data.get("version"), str):
            self.hub = data["version"]
        return self._target(self.policy == "always")

    def refused(self) -> str | None:
        """The hub does not speak this node's protocol: the version to install, if it may."""
        return self._target(self.policy != "never")

    def _target(self, allowed: bool) -> str | None:
        target = self.available
        if not (allowed and target) or self.source:
            return None
        tried = self._tried.get(target)
        return target if tried is None or self.clock() - tried >= RETRY_SECONDS else None

    def install(self, version: str) -> None:
        """Blocking: installs that version from PyPI and starts again on it; on failure, stays as it is."""
        self._tried[version] = self.clock()
        logger.info("installing muxtower %s, the hub's version", version)
        try:
            done = self.run(
                installer(f"muxtower=={version}"), capture_output=True, text=True, timeout=INSTALL_SECONDS, check=False
            )
        except (OSError, subprocess.SubprocessError) as exc:
            logger.warning("could not install muxtower %s: %s", version, exc)
            return
        if done.returncode != 0:
            logger.warning("installing muxtower %s failed: %s", version, (done.stderr or done.stdout).strip()[-800:])
            return
        logger.info("installed muxtower %s; restarting", version)
        self.restart()

    def advice(self) -> str:
        """What to do when the hub refused this node's protocol."""
        if self.available:
            return f"the hub runs muxtower {self.hub}: run `pipx install --force muxtower=={self.hub}` here"
        return f"the hub runs an older muxtower ({self.hub or 'unknown'}): update the hub"
