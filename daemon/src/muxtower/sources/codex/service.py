"""Codex threads muxtower runs headless, in its own app-server (`adapter.py`), as muxtower sessions.

The app-server pushes everything: a thread's status (`thread/status/changed`, whose active flags say
it waits on an approval or an answer), its items as they start and complete, a turn's end, and the
requests it waits on (command, file change and permission approvals, questions). So nothing is polled
and nothing is read off a screen. The threads muxtower starts are remembered (`FileThreadStore`) and
resumed whenever the app-server (re)starts.

Messages are applied by the loop's worker thread and requests come from FastAPI's thread pool: the cache
is guarded by a lock that is never held across a call to the app-server.
"""

import asyncio
import logging
import threading
from typing import Any

from muxtower.errors import Conflict, Invalid, NotFound, Unavailable
from muxtower.infra.bus import EventBus
from muxtower.runtimes.models import AgentState
from muxtower.sessions.models import Conversation, Session
from muxtower.sources.codex.ports import AppServerPort, Message
from muxtower.sources.codex.requests import QUESTIONS, answer, refusal
from muxtower.sources.codex.store import FileThreadStore
from muxtower.sources.codex.thread import KEYS, Applied, CodexThread, apply, to_session, waiting_flag
from muxtower.terminal.models import ImageInput

logger = logging.getLogger("muxtower.codex")

WAIT_SECONDS = 1.0
RETRY_SECONDS = 15.0


class CodexSource:
    runtime = "codex"  # the runtime it starts headless (`HeadlessStarter`)
    shared = False  # its threads are muxtower's own (`SharedCodexSource`: those of Codex's own app-server)

    def __init__(self, port: AppServerPort, store: FileThreadStore, options: dict[str, Any] | None = None) -> None:
        self.port = port
        self.store = store
        self.options = {"approvalPolicy": "on-request", "sandbox": "workspace-write", **(options or {})}  # thread/start
        self.threads: dict[str, CodexThread] = {}
        self._lock = threading.Lock()
        self._connected = False

    # --- reading ------------------------------------------------------------------------------

    def owns(self, session_id: str) -> bool:
        with self._lock:
            return session_id in self.threads

    def _thread(self, session_id: str) -> CodexThread:
        found = self.threads.get(session_id)
        if found is None:
            raise NotFound(f"unknown session {session_id}")
        return found

    def views(self) -> list[Session]:
        with self._lock:
            return [to_session(t, self.shared) for t in self.threads.values()]

    def get(self, session_id: str) -> Session:
        with self._lock:
            return to_session(self._thread(session_id), self.shared)

    def conversation(self, session_id: str, after: int, limit: int) -> Conversation:
        with self._lock:
            items = self._thread(session_id).items
            return Conversation(
                session_id=session_id, items=items.after(after, limit), latest_seq=max(items.items, default=0)
            )

    # --- the app-server's messages ------------------------------------------------------------

    def _adopt(self, raw: dict[str, Any], turns: list[Any]) -> CodexThread:
        """Under the lock: a thread started or resumed here, with the turns it already has."""
        thread = self.threads.get(str(raw.get("id"))) or CodexThread(raw=raw)
        thread.take(raw, turns)
        self.threads[thread.id] = thread
        return thread

    def apply(self, message: Message) -> Applied:
        """One message from the app-server into the cache (`thread.apply`)."""
        params = message.params
        thread_id = str(params.get("threadId") or (params.get("thread") or {}).get("id"))
        with self._lock:
            thread = self.threads.get(thread_id)
            if thread is None:
                return Applied()
            result = apply(thread, message)
            if result.gone:
                del self.threads[thread_id]
        return result

    def _connect(self) -> bool:
        """Blocking: the app-server up and the remembered threads resumed in it."""
        if not self.port.ensure():
            self._connected = False
            return False
        if self._connected:
            return True
        kept = []
        for thread_id in self.store.load():
            try:
                resumed = self.port.request("thread/resume", {"threadId": thread_id})
            except Conflict as exc:
                logger.info("codex thread %s is gone: %s", thread_id, exc)
                continue
            found = resumed.get("thread")
            raw: dict[str, Any] = found if isinstance(found, dict) else {"id": thread_id}
            with self._lock:
                self._adopt(raw, list(raw.get("turns") or resumed.get("turns") or []))
            kept.append(thread_id)
        self.store.save(kept)
        self._connected = True
        return True

    def due(self) -> bool:
        """Whether `refresh` has anything to do now (cheap: asked between every two messages)."""
        return False

    def refresh(self) -> bool:
        """Blocking, between messages: look for news the app-server does not push. True when the list changed."""
        return False

    async def run_loop(self, bus: EventBus) -> None:
        logger.info("Codex headless source starting")
        while True:
            try:
                if not await asyncio.to_thread(self._connect):
                    await asyncio.sleep(RETRY_SECONDS)
                    continue
                if self.due() and await asyncio.to_thread(self.refresh):
                    bus.publish("sessions", None)
                message = await asyncio.to_thread(self.port.next_message, WAIT_SECONDS)
                if message is None:
                    continue
                result = self.apply(message)
            except Unavailable as exc:
                logger.warning("codex app-server: %s", exc)
                self._connected = False
                await asyncio.sleep(RETRY_SECONDS)
                continue
            except Exception:
                logger.exception("codex message failed")
                continue
            thread_id = str(message.params.get("threadId") or "")
            if result.changed:
                bus.publish("sessions", None)
            if result.conversation:
                bus.publish(f"conversation:{thread_id}", result.conversation)
            if result.attention:
                bus.publish(f"attention:{thread_id}", None)

    # --- actions ------------------------------------------------------------------------------

    def start(self, cwd: str, name: str | None) -> Session:
        """A new headless thread in `cwd`; its first message starts it working."""
        if not self._connected and not self._connect():
            raise Unavailable("the Codex app-server is not running")
        started = self.port.request("thread/start", {"cwd": cwd, **self.options})
        raw = started.get("thread")
        if not isinstance(raw, dict):
            raise Unavailable("the Codex app-server started no thread")
        if name:
            self.port.request("thread/name/set", {"threadId": raw["id"], "name": name})
            raw["name"] = name
        with self._lock:
            thread = self._adopt(raw, [])
            self.store.save(list(self.threads))
            return to_session(thread, self.shared)

    def _request(self, session_id: str, option: str | None) -> tuple[AgentState, str]:
        with self._lock:
            thread = self._thread(session_id)
            if not thread.requests:
                if waiting_flag(thread) in (AgentState.NEEDS_PERMISSION, AgentState.NEEDS_ANSWER):
                    raise Conflict("it asked before muxtower joined Codex: answer it where it runs")
                raise Conflict("nothing is waiting for an answer")
            request_id, request = list(thread.requests.items())[-1]
            pending = thread.pending()
            picked = option if option is not None else (pending.recommended if pending else None)
            if picked is None and request.method in QUESTIONS:
                raise Conflict("a question needs an option")
        assert request.id is not None
        body, status = answer(request, picked)
        self.port.respond(request.id, body)
        with self._lock:
            thread.requests.pop(request_id, None)
            thread.items.resolve(request_id, status)
        return (pending.state if pending else AgentState.IDLE), picked or refusal(request)

    def approve(
        self, session_id: str, option: str | None, answers: list[list[str]] | None = None
    ) -> tuple[AgentState, str]:
        if answers is not None:
            raise Invalid("pick an option: a Codex question is answered one at a time")
        return self._request(session_id, option)

    def deny(self, session_id: str) -> AgentState:
        with self._lock:
            request = list(self._thread(session_id).requests.values())[-1:] or None
        if request is None:
            raise Conflict("nothing is waiting for an answer")
        state, _ = self._request(session_id, None if request[0].method in QUESTIONS else refusal(request[0]))
        return state

    def send_text(self, session_id: str, text: str, images: list[ImageInput] | None = None) -> None:
        with self._lock:
            turn_id = self._thread(session_id).turn_id
        message = [{"type": "text", "text": text}]
        if turn_id:  # working: add to the turn in flight
            self.port.request("turn/steer", {"threadId": session_id, "expectedTurnId": turn_id, "input": message})
        else:
            self.port.request("turn/start", {"threadId": session_id, "input": message})

    def send_key(self, session_id: str, key: str) -> None:
        if key not in KEYS:
            raise Conflict("this session only takes Escape (interrupt) as a key")
        with self._lock:
            turn_id = self._thread(session_id).turn_id
        if turn_id is None:
            raise Conflict("nothing is running")
        self.port.request("turn/interrupt", {"threadId": session_id, "turnId": turn_id})

    def mark_read(self, session_id: str) -> None:
        self.get(session_id)  # read state is muxtower's own (marks)

    def detect_folder(self, session_id: str) -> str | None:
        return None

    def archive(self, session_id: str) -> None:
        self.get(session_id)
        self.port.request("thread/archive", {"threadId": session_id})
        with self._lock:
            self.threads.pop(session_id, None)
            self.store.save(list(self.threads))
