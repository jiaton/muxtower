"""The Codex threads of this machine that muxtower did not start: a `codex` in a terminal, the desktop app,
an editor. Codex keeps one app-server for all of them (`codex` joins it, or starts it); muxtower joins it
as one more client on its control socket, and subscribes to every thread it has loaded, which is what
Remote Control is for Claude Code: each thread's status, its conversation, the approvals and questions it
waits on, answered from the phone, and messages sent to it. Like any client, muxtower hears only of what
happens after it subscribed (a request made before is only flagged in the thread's status: "waiting where
it runs"). The app-server tells every client when a thread starts and when its status changes, so a thread
is joined as soon as it is heard of, before it can ask anything; a look every few seconds finds the rest.

muxtower never starts this app-server, never archives a thread of it (that is Codex's history, not
muxtower's), and lists a thread only while it has been active lately: Codex keeps threads loaded long
after the terminal that ran them has gone.
"""

import logging
import time
from datetime import UTC, datetime
from typing import Any

from muxtower.errors import Conflict, Unavailable
from muxtower.sessions.models import Session
from muxtower.sources.codex.ports import AppServerPort, Message
from muxtower.sources.codex.service import CodexSource
from muxtower.sources.codex.thread import Applied, CodexThread, to_session, when

logger = logging.getLogger("muxtower.codex")

DISCOVER_SECONDS = 2.0
RETRY_FAILED_SECONDS = 5.0  # a loaded thread that cannot be joined yet (it has no rollout until its first message)
HEARD_OF = ("thread/started", "thread/status/changed")  # sent to every client, subscribed or not
LISTED_SECONDS = 2 * 3600  # a thread idle for longer is not listed


class NoThreads:
    """Nothing to remember: the app-server knows its threads."""

    def load(self) -> list[str]:
        return []

    def save(self, thread_ids: list[str]) -> None:
        pass


class SharedCodexSource(CodexSource):
    shared = True

    def __init__(self, port: AppServerPort) -> None:
        super().__init__(port, NoThreads())  # type: ignore[arg-type]
        self._looked = 0.0
        self._failed: dict[str, float] = {}
        self._heard: set[str] = set()  # threads heard of that are not joined yet

    def _connect(self) -> bool:
        if not self.port.ensure():
            self._connected = False
            return False
        if not self._connected:
            with self._lock:
                self.threads.clear()  # a new connection hears nothing of the old subscriptions
            self._looked = 0.0
            self._connected = True
        return True

    def _loaded(self) -> set[str]:
        found: set[str] = set()
        cursor: str | None = None
        while True:
            page = self.port.request("thread/loaded/list", {"cursor": cursor} if cursor else {})
            found |= {str(t) for t in page.get("data") or []}
            cursor = page.get("nextCursor")
            if not cursor:
                return found

    @staticmethod
    def _ours(raw: dict[str, Any]) -> bool:
        """Not a helper of another thread (sub-agents, throwaway ones)."""
        return not (raw.get("parentThreadId") or raw.get("ephemeral") or isinstance(raw.get("source"), dict))

    def apply(self, message: Message) -> Applied:
        params = message.params
        thread_id = str(params.get("threadId") or (params.get("thread") or {}).get("id"))
        if message.method in HEARD_OF and not self.owns(thread_id):
            self._heard.add(thread_id)
        return super().apply(message)

    def due(self) -> bool:
        return bool(self._heard) or time.monotonic() - self._looked >= DISCOVER_SECONDS

    def refresh(self) -> bool:
        now = time.monotonic()
        heard, self._heard = self._heard, set()
        if not heard and now - self._looked < DISCOVER_SECONDS:
            return False
        self._looked = now
        for thread_id in heard:
            self._failed.pop(thread_id, None)  # something happened to it: it may have a rollout by now
        try:
            loaded = self._loaded()
        except Unavailable:
            self._heard |= heard  # the app-server is away: what was heard is still to be looked at
            raise
        with self._lock:
            known = set(self.threads)
        changed = False
        for thread_id in sorted(loaded - known):
            if now - self._failed.get(thread_id, -RETRY_FAILED_SECONDS) < RETRY_FAILED_SECONDS:
                continue
            try:
                resumed = self.port.request("thread/resume", {"threadId": thread_id})
            except (Conflict, Unavailable) as exc:  # no rollout yet, or the app-server was slow with this one
                logger.debug("codex thread %s cannot be joined yet: %s", thread_id, exc)
                self._failed[thread_id] = now
                continue
            raw = resumed.get("thread")
            if not isinstance(raw, dict) or not self._ours(raw):
                self._failed[thread_id] = now
                continue
            with self._lock:
                thread = self._adopt(raw, list(raw.get("turns") or []))
                thread.updated_at = when(raw.get("updatedAt"))
            changed = True
        with self._lock:
            for gone in known - loaded:
                self.threads.pop(gone, None)
                changed = True
        self._failed = {t: at for t, at in self._failed.items() if t in loaded}
        return changed

    def _listed(self, thread: CodexThread) -> bool:
        return (datetime.now(UTC) - thread.updated_at).total_seconds() < LISTED_SECONDS or bool(thread.requests)

    def views(self) -> list[Session]:
        with self._lock:
            return [to_session(t, True) for t in self.threads.values() if self._listed(t)]

    def archive(self, session_id: str) -> None:
        self.get(session_id)  # Codex's own history stays as it is: ending the session ends what muxtower runs
