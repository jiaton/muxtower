"""How the CLI reaches the daemon on this machine: the local URL and the 0600 CLI token."""

import json
import os
import subprocess
import sys
import time
import urllib.error
import urllib.request
from typing import Any

from muxtower.builders import local_cli_token
from muxtower.config import Settings


class DaemonError(Exception):
    pass


class LocalDaemon:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self.url = settings.local_url

    def request(self, method: str, path: str, body: Any = None) -> Any:
        data = json.dumps(body).encode() if body is not None else None
        req = urllib.request.Request(  # noqa: S310 - local daemon URL from settings
            self.url + path,
            data=data,
            method=method,
            headers={"Authorization": f"Bearer {local_cli_token(self.settings)}", "Content-Type": "application/json"},
        )
        try:
            with urllib.request.urlopen(req, timeout=10) as res:  # noqa: S310
                raw = res.read()
        except urllib.error.HTTPError as exc:
            detail = json.loads(exc.read() or b"{}").get("detail", exc.reason)
            raise DaemonError(str(detail)) from exc
        except OSError as exc:
            raise DaemonError(f"cannot reach the daemon at {self.url}: {exc}") from exc
        return json.loads(raw) if raw else None

    def running(self) -> bool:
        try:
            with urllib.request.urlopen(self.url + "/v1/health", timeout=1):  # noqa: S310
                return True
        except OSError:
            return False

    def ensure_running(self) -> None:
        """Starts `muxtower serve` in the background when nothing answers on the local URL."""
        if self.running():
            return
        log = self.settings.state_dir / "daemon.log"
        log.parent.mkdir(parents=True, exist_ok=True)
        with log.open("ab") as out:
            subprocess.Popen(  # noqa: S603 - our own interpreter and module
                [sys.executable, "-m", "muxtower", "serve"],
                stdout=out,
                stderr=out,
                stdin=subprocess.DEVNULL,
                start_new_session=True,
                env=os.environ.copy(),
            )
        for _ in range(50):
            if self.running():
                print(f"started the muxtower daemon ({self.url}, log: {log})", file=sys.stderr)
                return
            time.sleep(0.2)
        raise DaemonError(f"the daemon did not start; see {log}")
