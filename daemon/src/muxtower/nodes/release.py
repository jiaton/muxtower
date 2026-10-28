"""Keeping nodes on their hub's build: the hub hands out the wheel it runs, and a node on another build
installs it over itself and starts again, so nobody copies wheels between computers.

Every build is version 0.1.0.dev0, so the build is told by the sha256 of the wheel it was installed
from, which the installer recorded (`direct_url.json`, next to where it came from). The hub keeps a copy
of its own wheel in the state directory the first time that file still matches, so a newer build lying
there, not installed yet, is never handed out. On every link the hub names its build (event `release`);
a node on another one downloads it with its node token (`GET /v1/nodes/release`), checks the hash,
installs it with pipx (or pip, outside pipx) and replaces itself with the new code (exec: the same pid,
so a service manager sees no exit). A source checkout has no wheel: it neither hands one out nor takes
one. `[hub] auto_update = false` keeps a node as it is."""

import hashlib
import importlib.metadata
import json
import logging
import os
import re
import shutil
import subprocess
import sys
from collections.abc import Callable
from dataclasses import dataclass
from pathlib import Path
from typing import Any
from urllib.parse import unquote, urlparse

import httpx

from muxtower import __version__
from muxtower.nodes.store import Joined

logger = logging.getLogger("muxtower.release")

WHEEL_NAME = re.compile(r"^[A-Za-z0-9_.+-]+\.whl$")
SHA256 = re.compile(r"^[0-9a-f]{64}$")
INSTALL_SECONDS = 600
PIPX = ("~/.local/bin/pipx", "/opt/homebrew/bin/pipx", "/usr/local/bin/pipx")  # off a service's PATH


@dataclass(frozen=True)
class Build:
    sha256: str
    wheel: Path  # the file it was installed from


def installed(distribution: str = "muxtower") -> Build | None:
    """This install's build, when it came from a wheel file."""
    try:
        raw = importlib.metadata.distribution(distribution).read_text("direct_url.json")
        data = json.loads(raw or "")
    except (importlib.metadata.PackageNotFoundError, ValueError):
        return None
    archive = data.get("archive_info") or {}
    sha = (archive.get("hashes") or {}).get("sha256") or str(archive.get("hash", "")).removeprefix("sha256=")
    url = urlparse(str(data.get("url", "")))
    if url.scheme != "file" or not url.path.endswith(".whl") or not SHA256.match(sha or ""):
        return None
    return Build(sha256=sha, wheel=Path(unquote(url.path)))


def sha256_of(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            digest.update(chunk)
    return digest.hexdigest()


def restart() -> None:
    """This daemon, again, with the code just installed (`muxtower serve …` as it was started)."""
    sys.stdout.flush()
    sys.stderr.flush()
    os.execv(sys.executable, [sys.executable, "-m", "muxtower", *sys.argv[1:]])  # noqa: S606 - ourselves


class Release:
    """As a hub: the wheel it runs, to hand out. As a node: taking the hub's when it is another build."""

    def __init__(self, state_dir: Path, auto_update: bool = True, build: Build | None = None) -> None:
        self.dir = state_dir / "release"
        self.auto_update = auto_update
        self.build = build
        self.run: Callable[..., subprocess.CompletedProcess[str]] = subprocess.run
        self.restart = restart
        self._tried: set[str] = set()  # builds a node failed to take: not again until it restarts

    @property
    def version(self) -> str:
        return f"{__version__}+{self.build.sha256[:12]}" if self.build else __version__

    def _kept(self, sha: str, name: str) -> Path:
        return self.dir / sha[:16] / name

    # --- as a hub ------------------------------------------------------------------------------

    def wheel(self) -> Path | None:
        """The wheel this daemon runs, once copied here (blocking: hashes it the first time)."""
        if self.build is None:
            return None
        kept = self._kept(self.build.sha256, self.build.wheel.name)
        if kept.is_file():
            return kept
        source = self.build.wheel
        if not source.is_file() or sha256_of(source) != self.build.sha256:
            return None  # rebuilt or gone since it was installed
        kept.parent.mkdir(parents=True, exist_ok=True)
        partial = kept.with_name(kept.name + ".part")
        shutil.copyfile(source, partial)
        partial.replace(kept)
        for old in self.dir.iterdir():
            if old != kept.parent:
                shutil.rmtree(old, ignore_errors=True)
        return kept

    def offer(self) -> dict[str, str] | None:
        wheel = self.wheel()
        return None if wheel is None or self.build is None else {"sha256": self.build.sha256, "wheel": wheel.name}

    # --- as a node -----------------------------------------------------------------------------

    def wanted(self, offer: Any) -> tuple[str, str] | None:
        if not isinstance(offer, dict) or not self.auto_update or self.build is None:
            return None
        sha, name = str(offer.get("sha256", "")), str(offer.get("wheel", ""))
        if not SHA256.match(sha) or not WHEEL_NAME.match(name) or sha == self.build.sha256 or sha in self._tried:
            return None
        return sha, name

    def take(self, offer: Any, joined: Joined, headers: dict[str, str]) -> None:
        """Blocking: installs the hub's build and starts again on it; on any failure, stays as it is."""
        wanted = self.wanted(offer)
        if wanted is None:
            return
        sha, name = wanted
        self._tried.add(sha)
        logger.info("the hub runs build %s; installing it", sha[:12])
        try:
            wheel = self._download(joined, headers, sha, name)
            command = self._installer(wheel)
            done = self.run(command, capture_output=True, text=True, timeout=INSTALL_SECONDS, check=False)
        except (httpx.HTTPError, OSError, ValueError, subprocess.SubprocessError) as exc:
            logger.warning("could not take the hub's build: %s", exc)
            return
        if done.returncode != 0:
            logger.warning("installing the hub's build failed: %s", (done.stderr or done.stdout).strip()[-800:])
            return
        logger.info("installed build %s; restarting", sha[:12])
        self.restart()

    def _download(self, joined: Joined, headers: dict[str, str], sha: str, name: str) -> Path:
        kept = self._kept(sha, name)
        kept.parent.mkdir(parents=True, exist_ok=True)
        partial = kept.with_name(name + ".part")
        digest = hashlib.sha256()
        auth = {**headers, "Authorization": f"Bearer {joined.token}"}
        with httpx.stream("GET", f"{joined.url}/v1/nodes/release", headers=auth, timeout=60) as response:
            if response.status_code != 200:
                raise ValueError(f"the hub answered {response.status_code}")
            with partial.open("wb") as out:
                for chunk in response.iter_bytes():
                    digest.update(chunk)
                    out.write(chunk)
        if digest.hexdigest() != sha:
            partial.unlink(missing_ok=True)
            raise ValueError("the wheel did not match the build the hub named")
        partial.replace(kept)
        return kept

    def _installer(self, wheel: Path) -> list[str]:
        if Path(sys.prefix).parent.name == "venvs":  # pipx keeps each app in <pipx home>/venvs/<app>
            candidates = [p for p in map(os.path.expanduser, PIPX) if os.access(p, os.X_OK)]
            found = shutil.which("pipx") or next(iter(candidates), None)
            if found:
                return [found, "install", "--force", str(wheel)]
        return [sys.executable, "-m", "pip", "install", "--force-reinstall", str(wheel)]
