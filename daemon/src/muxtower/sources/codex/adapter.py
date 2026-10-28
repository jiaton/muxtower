"""Codex's app-server, run by muxtower for itself: `codex app-server --listen unix://<state>/…sock`.

A private socket on purpose: a `codex` TUI looks for an app-server at Codex's default place and joins it,
which would move the TUIs in tmux into this process. The socket carries a websocket (JSON-RPC 2.0 without
the "jsonrpc" field, a text frame per message); the server rejects the compression extension. One reader
thread routes answers to the request waiting on them and queues the rest (`next_message`).
"""

import hashlib
import json
import logging
import os
import queue
import subprocess
import tempfile
import threading
import time
from pathlib import Path
from typing import Any

from websockets.exceptions import ConnectionClosed
from websockets.sync.client import ClientConnection, unix_connect

from muxtower.errors import Conflict, Unavailable
from muxtower.sources.codex.ports import Message

logger = logging.getLogger("muxtower.codex")

START_SECONDS = 20.0
REQUEST_SECONDS = 60.0
CLIENT = {"name": "muxtower", "title": "muxtower", "version": "1"}


class CodexAppServer:
    def __init__(self, binary: str, socket_path: Path, log_path: Path) -> None:
        self.binary = binary
        self.socket_path = socket_path
        self.log_path = log_path
        self._process: subprocess.Popen[bytes] | None = None
        self._ws: ClientConnection | None = None
        self._lock = threading.Lock()  # one start at a time; sends
        self._waiting: dict[int, queue.Queue[dict[str, Any]]] = {}
        self._messages: queue.Queue[Message] = queue.Queue()
        self._next_id = 0
        self._noisy = True  # a server muxtower runs itself should come up: say so when it does not

    # --- lifecycle ----------------------------------------------------------------------------

    def _alive(self) -> bool:
        return self._ws is not None and self._process is not None and self._process.poll() is None

    def ensure(self) -> bool:
        with self._lock:
            if self._alive():
                return True
            self._stop()
            try:
                self._start()
            except (OSError, TimeoutError, ValueError) as exc:
                logger.log(logging.WARNING if self._noisy else logging.DEBUG, "codex app-server: %s", exc)
                self._stop()
                return False
        try:
            self.request("initialize", {"clientInfo": CLIENT, "capabilities": {"experimentalApi": True}})
            self._send({"method": "initialized"})
        except (Unavailable, Conflict) as exc:
            logger.warning("codex app-server did not initialize: %s", exc)
            with self._lock:
                self._stop()  # a connection that never said hello is not one to go on with
            return False
        logger.info("codex app-server up on %s", self.socket_path)
        return True

    def _start(self) -> None:
        self.socket_path.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
        self.log_path.parent.mkdir(parents=True, exist_ok=True)
        self.socket_path.unlink(missing_ok=True)
        log = self.log_path.open("ab")
        self._process = subprocess.Popen(  # noqa: S603 - argv list, no shell
            [self.binary, "app-server", "--listen", f"unix://{self.socket_path}"],
            stdin=subprocess.DEVNULL, stdout=log, stderr=log, start_new_session=True,
        )  # fmt: skip
        log.close()
        deadline = time.monotonic() + START_SECONDS
        while not self.socket_path.exists():
            if self._process.poll() is not None or time.monotonic() > deadline:
                raise TimeoutError("no socket")
            time.sleep(0.1)
        while True:  # the socket file exists a moment before it accepts
            try:
                self._ws = unix_connect(str(self.socket_path), uri="ws://localhost/", compression=None, max_size=None)
                break
            except OSError:
                if time.monotonic() > deadline:
                    raise
                time.sleep(0.2)
        threading.Thread(target=self._read, args=(self._ws,), name="codex-app-server", daemon=True).start()

    def _stop(self) -> None:
        if self._ws is not None:
            self._ws.close()
            self._ws = None
        if self._process is not None and self._process.poll() is None:
            self._process.terminate()
            try:
                self._process.wait(5)
            except subprocess.TimeoutExpired:
                self._process.kill()
        self._process = None
        for waiting in self._waiting.values():
            waiting.put({"error": {"message": "codex app-server went away"}})
        self._waiting.clear()

    def close(self) -> None:
        with self._lock:
            self._stop()

    # --- messages -----------------------------------------------------------------------------

    def _read(self, ws: ClientConnection) -> None:
        try:
            for frame in ws:
                message = json.loads(frame)
                if not isinstance(message, dict):
                    continue
                if "method" not in message and isinstance(message.get("id"), int):
                    waiting = self._waiting.pop(message["id"], None)
                    if waiting is not None:
                        waiting.put(message)
                    continue
                params = message.get("params")
                self._messages.put(
                    Message(str(message.get("method")), params if isinstance(params, dict) else {}, message.get("id"))
                )
        except (ConnectionClosed, OSError, ValueError) as exc:  # the connection or the server ended
            logger.warning("codex app-server connection closed: %s", exc)
        with self._lock:
            if self._ws is ws:
                self._ws = None  # `ensure` starts it again

    def _send(self, message: dict[str, Any]) -> None:
        ws = self._ws
        if ws is None:
            raise Unavailable("codex app-server is not running")
        try:
            ws.send(json.dumps(message))
        except Exception as exc:
            raise Unavailable(f"codex app-server: {exc}") from exc

    def request(self, method: str, params: dict[str, Any]) -> dict[str, Any]:
        waiting: queue.Queue[dict[str, Any]] = queue.Queue(maxsize=1)
        with self._lock:
            self._next_id += 1
            request_id = self._next_id
            self._waiting[request_id] = waiting
        self._send({"id": request_id, "method": method, "params": params})
        try:
            answer = waiting.get(timeout=REQUEST_SECONDS)
        except queue.Empty as exc:
            self._waiting.pop(request_id, None)
            raise Unavailable(f"codex app-server did not answer {method}") from exc
        if "error" in answer:
            raise Conflict(str((answer["error"] or {}).get("message") or answer["error"]))
        result = answer.get("result")
        return result if isinstance(result, dict) else {}

    def respond(self, request_id: int | str, result: dict[str, Any]) -> None:
        self._send({"id": request_id, "result": result})

    def next_message(self, timeout: float) -> Message | None:
        try:
            return self._messages.get(timeout=timeout)
        except queue.Empty:
            return None


def default_socket(state_dir: Path) -> Path:
    """In the state folder, or where a unix socket path is short enough (about 100 bytes): a private folder
    of this user's (Codex refuses a world-writable one such as /tmp itself), one socket per state folder."""
    path = state_dir / "codex" / "app-server.sock"
    if len(str(path)) < 100:
        return path
    base = Path(os.environ.get("XDG_RUNTIME_DIR") or tempfile.gettempdir()) / f"muxtower-{os.getuid()}"
    return base / f"codex-{hashlib.sha256(str(state_dir).encode()).hexdigest()[:8]}.sock"


class SharedAppServer(CodexAppServer):
    """The app-server Codex itself keeps for the `codex` TUIs, desktop app and editors on this machine,
    reached on its control socket as one more client. Never started here (that is Codex's own business:
    a TUI starts it when it needs one), only joined while it runs."""

    def __init__(self, socket_path: Path) -> None:
        super().__init__("codex", socket_path, socket_path)
        self._noisy = False  # Codex may simply not be running one

    def _alive(self) -> bool:
        return self._ws is not None

    def _start(self) -> None:
        if not self.socket_path.exists():
            raise TimeoutError("Codex runs no shared app-server")
        self._ws = unix_connect(str(self.socket_path), uri="ws://localhost/", compression=None, max_size=None)
        threading.Thread(target=self._read, args=(self._ws,), name="codex-shared", daemon=True).start()


def shared_socket() -> Path:
    """Where Codex keeps the control socket of its shared app-server."""
    home = Path(os.environ.get("CODEX_HOME") or Path.home() / ".codex")
    return home / "app-server-control" / "app-server-control.sock"
