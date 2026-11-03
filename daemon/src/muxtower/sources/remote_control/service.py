"""Claude Code Remote Control sessions as muxtower sessions.

Every poll lists the account's active sessions. A session whose fingerprint (last event, worker and
bucket status, unread, title) changed gets its new events and details fetched; its conversation is
built from the structured event log, so nothing is read off a screen. State comes from the worker's
own status and the unanswered permission prompt in the log. Answering a prompt re-reads the log first.

The poll runs in a worker thread and requests in FastAPI's thread pool, so the cache is guarded by a
lock that is never held across a network call.
"""

import asyncio
import logging
import threading
from dataclasses import dataclass, field, replace
from typing import Any

from muxtower.errors import LoginExpired, NotFound, Unavailable
from muxtower.infra.bus import EventBus
from muxtower.sessions.models import Conversation, ConversationItem, Session
from muxtower.sources.remote_control import lineage
from muxtower.sources.remote_control.actions import EVENTS_PER_PAGE, RcActions
from muxtower.sources.remote_control.ports import RawEvent, RemoteControlPort
from muxtower.sources.remote_control.view import RcSession, to_session

logger = logging.getLogger("muxtower.remote_control")

FIRST_LOAD_EVENTS = 150
MAX_EVENT_PAGES = 5
MAX_SESSION_PAGES = 4
FINGERPRINT = ("last_event_at", "worker_status", "status_bucket", "unread", "title")


@dataclass
class RcTick:
    changed: bool = False
    attention: list[str] = field(default_factory=list)
    conversation: dict[str, list[ConversationItem]] = field(default_factory=dict)


class RemoteControlSource(RcActions):
    def __init__(self, port: RemoteControlPort, environments: dict[str, str]) -> None:
        self.port = port
        self.environments = environments
        self.sessions: dict[str, RcSession] = {}
        self._lock = threading.Lock()
        self._unsent: dict[str, list[ConversationItem]] = {}  # items read outside a poll, for the next tick
        self.login_expired = False  # the last poll was refused for the login: nothing here updates

    # --- reading ------------------------------------------------------------------------------

    def owns(self, session_id: str) -> bool:
        with self._lock:
            return session_id in self.sessions

    def views(self) -> list[Session]:
        with self._lock:
            forks = lineage.forks(self.sessions)
            return [lineage.placed(s, forks) for s in self.sessions.values() if s.view is not None]

    def _session(self, session_id: str) -> RcSession:
        found = self.sessions.get(session_id)
        if found is None or found.view is None:
            raise NotFound(f"unknown session {session_id}")
        return found

    def get(self, session_id: str) -> Session:
        with self._lock:
            return lineage.placed(self._session(session_id), lineage.forks(self.sessions))

    def conversation(self, session_id: str, after: int, limit: int) -> Conversation:
        with self._lock:
            builder = self._session(session_id).builder
            items = builder.after(after, limit)
            latest = max(builder.items, default=0)
        return Conversation(session_id=session_id, items=items, latest_seq=latest)

    # --- fetching (network; no lock held) -----------------------------------------------------

    def _active(self) -> list[dict[str, Any]]:
        """Active sessions, newest first; stops paging at the first page with none."""
        found: list[dict[str, Any]] = []
        cursor: str | None = None
        for _ in range(MAX_SESSION_PAGES):
            page, cursor = self.port.list_sessions(cursor)
            active = [s for s in page if s.get("status") == "active" and s.get("id")]
            found += active
            if not active or not cursor:
                break
        return found

    def _events_after(self, session_id: str, seq: int) -> list[RawEvent]:
        events: list[RawEvent] = []
        for _ in range(MAX_EVENT_PAGES):
            page = self.port.events_after(session_id, seq, EVENTS_PER_PAGE)
            events += page
            if len(page) < EVENTS_PER_PAGE:
                break
            seq = max(e.seq for e in page)
        return events

    def _apply(self, rc: RcSession, events: list[RawEvent], detail: dict[str, Any]) -> list[ConversationItem]:
        """Under the lock: new events and details into the cache; returns the new or changed items."""
        items = rc.builder.feed(events)
        rc.folder.feed(events)
        rc.detail = detail
        for key in ("status", "worker_status"):  # the details are newer than the listing
            if key in detail:
                rc.raw[key] = detail[key]
        rc.view = to_session(rc, self.environments)
        return items

    def _refresh(self, session_id: str) -> None:
        with self._lock:
            seq = self._session(session_id).builder.latest_event_seq
        events, detail = self._events_after(session_id, seq), self.port.get_session(session_id)
        with self._lock:
            items = self._apply(self._session(session_id), events, detail)
            if items:
                self._unsent.setdefault(session_id, []).extend(items)

    # --- polling ------------------------------------------------------------------------------

    def tick(self) -> RcTick:
        """Blocking (HTTP); run from a worker thread."""
        result = RcTick()
        listed = self._active()
        for raw in listed:
            session_id = str(raw["id"])
            fingerprint = tuple(raw.get(k) for k in FINGERPRINT)
            with self._lock:
                known = self.sessions.get(session_id)
                if known is not None and known.fingerprint == fingerprint:
                    continue
                seq = known.builder.latest_event_seq if known is not None else None
            lineage_ = None
            if seq is None:
                events = self.port.recent_events(session_id, FIRST_LOAD_EVENTS)
                lineage_ = lineage.read(self.port.events_after, session_id, raw)
            else:
                events = self._events_after(session_id, seq)
            detail = self.port.get_session(session_id)
            with self._lock:
                rc = self.sessions.setdefault(session_id, RcSession(raw=raw))
                if lineage_ is not None:
                    rc.lineage = lineage_
                before = rc.view
                rc.raw, rc.fingerprint = raw, fingerprint
                if items := self._apply(rc, events, detail):
                    result.conversation[session_id] = items
                assert rc.view is not None
                entered = rc.view.needs_attention and (before is None or before.state != rc.view.state)
                if entered and before is not None:  # not on first sight: no alerts for old prompts at startup
                    result.attention.append(session_id)
            result.changed = True
        with self._lock:
            for gone in set(self.sessions) - {str(raw["id"]) for raw in listed}:
                del self.sessions[gone]
                result.changed = True
            for session_id, items in self._unsent.items():
                if session_id in self.sessions:
                    result.conversation[session_id] = items + result.conversation.get(session_id, [])
                    result.changed = True
            self._unsent.clear()
            searches = lineage.to_search(lineage.listed(self.sessions))
        if searches and self._search_copies(searches):
            result.changed = True
        return result

    def _search_copies(self, searches: dict[str, list[str]]) -> bool:
        """Blocking (HTTP). Places the copies no first message did (`lineage.search`); True when one was."""
        with self._lock:
            firsts = {cid: rc.lineage.first for cid, rc in self.sessions.items() if cid in searches}
        found = lineage.search(self.port.events_after, searches, firsts)
        with self._lock:
            for copy_id, parent in found.items():
                if rc := self.sessions.get(copy_id):
                    rc.lineage = replace(rc.lineage, searched=True, found_in=parent)
        return any(found.values())

    async def run_loop(self, bus: EventBus, interval: float) -> None:
        logger.info("Remote Control source polling every %ss", interval)
        while True:
            try:
                result = await asyncio.wait_for(asyncio.to_thread(self.tick), timeout=60)
            except TimeoutError:
                logger.warning("Remote Control poll timed out")
            except LoginExpired as exc:
                if not self.login_expired:  # once, not every poll until someone logs in again
                    self.login_expired = True
                    logger.warning("Remote Control poll failed: %s; its sessions stop updating until then", exc)
                    bus.publish("claude-login:expired", None)
            except Unavailable as exc:
                logger.warning("Remote Control poll failed: %s", exc)
            except Exception:
                logger.exception("Remote Control poll failed")
            else:
                if self.login_expired:
                    self.login_expired = False
                    logger.info("Remote Control works again: the Claude login was renewed")
                if result.changed:
                    bus.publish("sessions", None)
                for session_id, items in result.conversation.items():
                    bus.publish(f"conversation:{session_id}", items)
                for session_id in result.attention:
                    bus.publish(f"attention:{session_id}", None)
            await asyncio.sleep(interval)
