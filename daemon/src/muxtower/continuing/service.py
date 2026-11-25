"""Continue in terminal: a Remote Control session only (Claude's desktop app, claude.ai) goes on in a muxtower
pane on the machine it ran on, driven as the owner (typed into the pane) instead of as an unattested Remote
Control peer, whose outward actions Claude refuses and whose messages wait for Deliver in the desktop app.

1. It must run on this daemon's machine or a linked node that is online (not in Anthropic's cloud), have its
   transcript there, and be between turns (`blocked`).
2. It is closed everywhere first: archived on the Claude account (as Archive does), read back so; if that
   fails or cannot be read back, nothing is started. Never two live copies writing one transcript: it is
   started only once no process on its machine has the conversation open any more (the desktop app lets go).
3. It is resumed in a pane there, in its folder (`claude --resume <conversation>`), by the normal launcher.
4. The Remote Control entry folds into the pane session (`carry.py`): one session, its name, project, role,
   note, chips and read state kept.

Each run is kept (`Job`): a second click while it runs, or after, starts nothing again; a pane that did not
start is said so and started again on the next POST (Retry), its conversation safe in its transcript."""

import logging
import threading
import time
from collections.abc import Callable

from muxtower.continuing.models import Continuation, ContinueStep
from muxtower.continuing.ports import Job, JobStore, Place
from muxtower.errors import Conflict, Invalid, NotFound, Unavailable
from muxtower.infra.audit import AuditLog
from muxtower.runtimes.models import AgentState
from muxtower.sessions.directory import SessionDirectory
from muxtower.sessions.endable import CLOUD
from muxtower.sessions.launcher import Launcher
from muxtower.sessions.models import CreateSession, Session
from muxtower.sessions.ports import SessionSource
from muxtower.sources.remote_control.service import RemoteControlSource

logger = logging.getLogger("muxtower.continuing")

RUNTIME = "claude-code"
READ_BACKS = 3  # reads of Remote Control, a second apart, before its archive counts as not done
LET_GO_SECONDS = 20.0  # how long its machine's process has, once archived, to close the conversation
FAILED = (Conflict, Invalid, NotFound, Unavailable)  # what a step may fail with (the rest is a bug: logged)

# Looks a conversation up where it runs: (node or None for here, remote id, conversation id) → Place.
Looker = Callable[[str | None, str | None, str | None], Place]


class Continuer:
    def __init__(
        self, directory: SessionDirectory, remote: RemoteControlSource | None, launcher: Launcher,
        store: JobStore, look: Looker, audit: AuditLog,
    ) -> None:  # fmt: skip
        self.directory, self.remote, self.launcher = directory, remote, launcher
        self.store, self.look, self.audit = store, look, audit
        self.is_node: Callable[[str], bool] = lambda _: False  # a machine name that is a node of this hub
        self.online: Callable[[str], bool] = lambda _: False
        self.carry: Callable[[Job, Session], None] = lambda job, started: None  # `carry.py`
        self.changed: Callable[[], None] = lambda: None  # the lists follow each step
        self.sleep: Callable[[float], None] = time.sleep
        self._runs: set[str] = set()  # the ones running now
        self._guard = threading.Lock()

    # --- reading ------------------------------------------------------------------------------

    def check(self, session_id: str) -> Continuation:
        """Blocking (a node may be asked). How far a run got, or whether one can start (and if not, why)."""
        if job := self.store.get(session_id):
            listed = self.remote is not None and self.remote.owns(session_id)
            if job.step != ContinueStep.FAILED or job.closed or not listed:  # else: tried again from the start
                return _view(job)
        session = self.directory.get(session_id)
        reason, _ = self.blocked(session)
        return Continuation(
            step=ContinueStep.BLOCKED if reason else ContinueStep.READY, reason=reason, machine=session.machine
        )

    def _where(self, session: Session) -> tuple[str | None, str | None]:
        """(why not, node): the machine it runs on, reachable from here."""
        if (
            self.remote is None or session.source != SessionSource.REMOTE_CONTROL or session.archived_at
            or not self.remote.owns(session.id)
        ):  # fmt: skip
            return "Only a session open in the Claude app or on claude.ai can be continued in a terminal", None
        machine = session.machine
        if machine == CLOUD:
            return "It runs in Anthropic's cloud (claude.ai): there is no machine of yours to continue it on", None
        if not machine or machine.startswith("env "):
            return "It runs on a machine muxtower does not know: link that computer to this hub first", None
        if session.on_host or machine == self.directory.hub_name:
            return None, None
        if not self.is_node(machine):
            return f"{machine} is not linked to this hub: link it first", None
        if not self.online(machine):
            return f"{machine} is offline: it can be continued once muxtower there is back", None
        return None, machine

    def offer(self, session: Session) -> tuple[bool, str | None]:
        """Whether it is a session to offer this for, and why it cannot be now, by what is known without asking
        anything (its transcript is looked for when asked: `check`). For every listing."""
        if self.remote is None or session.source != SessionSource.REMOTE_CONTROL or not self.remote.owns(session.id):
            return False, None
        return True, self._now(session)[0]

    def _now(self, session: Session) -> tuple[str | None, str | None]:
        """(why not, node): where it runs, and that it is between turns."""
        reason, node = self._where(session)
        if not reason and (session.state == AgentState.BUSY or session.needs_attention or session.pending):
            reason = "Wait until it's idle: it is in the middle of a turn"
        return reason, node

    def blocked(self, session: Session) -> tuple[str | None, tuple[str | None, Place] | None]:
        """Blocking (a node may be asked). Why it cannot be continued now, else (node, its conversation)."""
        reason, node = self._now(session)
        if reason:
            return reason, None
        try:
            place = self.look(node, session.id, None)
        except Invalid as exc:  # a node that knows no `claude_conversation`
            return f"{session.machine} cannot do this yet: update muxtower there ({exc})", None
        except (Conflict, Unavailable) as exc:
            return f"{session.machine} did not answer: {exc}", None
        if place.agent_id is None:
            return f"Its conversation was not found on {session.machine}: no Claude Code there names it", None
        if not place.transcript:
            return f"Its transcript is not on {session.machine}", None
        return None, (node, place)

    # --- the run ------------------------------------------------------------------------------

    def run(self, session_id: str, actor: str) -> Continuation:
        """Blocking. Closes it on the Claude account, then resumes it in a pane on its machine. A run already
        going, or done, is said as it is (nothing done twice); one that failed once closed starts the pane
        again. Conflict: it cannot be continued (`blocked`), and nothing was done."""
        with self._guard:
            if session_id in self._runs:  # a second click while it runs
                job = self.store.get(session_id)
                return _view(job) if job else Continuation(step=ContinueStep.CLOSING)
            self._runs.add(session_id)
        try:
            return self._run(session_id, actor)
        finally:
            with self._guard:
                self._runs.discard(session_id)

    def _run(self, session_id: str, actor: str) -> Continuation:
        job = self.store.get(session_id)
        if job and job.step == ContinueStep.DONE:
            return _view(job)
        if job is None or not job.closed:
            # Begun again, unless its archive went through but was not read back so (it is no longer listed).
            if job is None or self.remote is None or self.remote.owns(session_id):
                job = self._begin(session_id)
            try:
                self._close(job)
            except FAILED as exc:
                why = f"Could not close it in the Claude app: {exc}. Nothing was started."
                return self._failed(job, actor, why)
        return self._start(job, actor)

    def _begin(self, session_id: str) -> Job:
        if self.remote is not None and self.remote.owns(session_id):
            self.remote.refresh(session_id)  # what it does now, not at the last poll
        session = self.directory.get(session_id)
        reason, found = self.blocked(session)
        if reason or found is None:
            raise Conflict(reason or "it cannot be continued in a terminal")
        node, place = found
        assert place.agent_id is not None
        job = Job(
            session.id, session.machine or "", node, place.cwd or session.cwd or "", place.agent_id, session.name,
            session.unread, ContinueStep.CLOSING,
        )  # fmt: skip
        if not job.cwd:
            raise Conflict(f"Its folder on {job.machine} is not known")
        self._save(job)
        return job

    def _close(self, job: Job) -> None:
        """Archived on the Claude account, then read back so (else Conflict: not closed)."""
        assert self.remote is not None
        self.remote.close(job.remote_id)
        for attempt in range(READ_BACKS):
            if self.remote.closed(job.remote_id):
                job.closed = True
                self._save(job)
                logger.info("continuing %s: archived on Remote Control", job.remote_id)
                return
            if attempt + 1 < READ_BACKS:
                self.sleep(1.0)
        raise Conflict("Remote Control still lists it as active")

    def _let_go(self, job: Job) -> Place:
        """Its conversation as its machine sees it, once no process there has it open (or the wait is over)."""
        waited = 0.0
        while True:
            place = self.look(job.node, None, job.agent_id)
            if not place.live or waited >= LET_GO_SECONDS:
                return place
            self.sleep(1.0)
            waited += 1.0

    def _start(self, job: Job, actor: str) -> Continuation:
        job.step, job.reason = ContinueStep.STARTING, None
        self._save(job)
        try:
            place = self._let_go(job)
            if place.live:
                raise Conflict(
                    f"the Claude app on {job.machine} still has it open: close that conversation there, or quit "
                    "the app, then Retry"
                )
            if not place.transcript:
                raise Conflict(f"its transcript is no longer on {job.machine}")
            request = CreateSession(
                runtime=RUNTIME, cwd=job.cwd, name=job.name, args=["--resume", place.agent_id or job.agent_id],
                node=job.node,
            )  # fmt: skip
            started = self.launcher.create(request)
        except FAILED as exc:
            return self._failed(
                job, actor, f"It is closed in the Claude app, but did not start on {job.machine}: {exc}"
            )
        try:
            self.carry(job, started)
        except Exception:  # it runs: what it carries over is no reason to start it again
            logger.exception("continuing %s: carrying its marks over to %s failed", job.remote_id, started.id)
        job.step, job.session_id = ContinueStep.DONE, started.id
        self._save(job)
        self.audit.record(actor, "continue-in-terminal", job.remote_id, f"session={started.id} machine={job.machine}")
        return _view(job)

    def _failed(self, job: Job, actor: str, why: str) -> Continuation:
        job.step, job.reason = ContinueStep.FAILED, why
        self._save(job)
        stage = "start" if job.closed else "close"
        self.audit.record(actor, "continue-in-terminal-failed", job.remote_id, f"at={stage} machine={job.machine}")
        logger.warning("continuing %s failed at %s", job.remote_id, stage)
        return _view(job)

    def _save(self, job: Job) -> None:
        self.store.save(job)
        self.changed()


def _view(job: Job) -> Continuation:
    return Continuation(
        step=job.step, reason=job.reason, machine=job.machine, session_id=job.session_id,
        retry=job.step == ContinueStep.FAILED and job.closed,
    )  # fmt: skip
