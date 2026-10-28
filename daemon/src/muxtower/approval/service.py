"""Approve/deny. Keys are sent only after re-reading the live screen, never on cached state alone."""

import logging
import time

from muxtower.approval.answers import TerminalAnswers, check_answers
from muxtower.approval.models import ApprovalResult
from muxtower.errors import Conflict, Invalid
from muxtower.runtimes.models import APPROVABLE_STATES, AgentState
from muxtower.runtimes.spec import Runtime, Step
from muxtower.sessions.live import ScreenState, merge
from muxtower.sessions.models import StateSource
from muxtower.sessions.ports import SessionRecord
from muxtower.sessions.service import SessionService

logger = logging.getLogger("muxtower.approval")

# Hooks fire before the dialog is drawn. When no screen rule recognises the dialog (custom theme, new
# agent version), a hook-reported dialog is trusted only after it has had time to render.
HOOK_ONLY_SETTLE_SECONDS = 1.0


class ApprovalService:
    def __init__(self, sessions: SessionService) -> None:
        self.sessions = sessions

    def _fresh(self, record: SessionRecord, runtime: Runtime) -> tuple[AgentState, ScreenState, StateSource]:
        text = self.sessions.tmux.capture(record.pane)
        if text is None:
            raise Conflict("pane is gone")
        now = time.monotonic()
        screen = ScreenState(runtime.classify(text), text, since=now)
        live = self.sessions.live_of(record.id)
        effective = merge(live.hook, screen, now)
        return effective.state, screen, effective.source

    def _check(self, record: SessionRecord, strict: bool) -> tuple[Runtime, AgentState, ScreenState]:
        runtime = self.sessions.runtime_of(record)
        if runtime is None:
            raise Invalid(f"no runtime definition for {record.runtime!r}")
        state, screen, source = self._fresh(record, runtime)
        on_screen = screen.classification.state in APPROVABLE_STATES
        if state not in APPROVABLE_STATES:
            raise Conflict(f"nothing to approve (state={state})")
        if not on_screen:
            hook = self.sessions.live[record.id].hook
            settled = hook is not None and time.monotonic() - hook.at >= HOOK_ONLY_SETTLE_SECONDS
            unrecognised = screen.classification.rule is None
            readable = runtime.parse_menu(screen.text) is not None
            if strict or source != StateSource.HOOK or not (settled and unrecognised and readable):
                raise Conflict("the dialog is not on screen yet")
        return runtime, state, screen

    def _send(self, record: SessionRecord, steps: list[Step]) -> None:
        for step in steps:
            if step.text is not None:
                self.sessions.tmux.send_text(record.pane, step.text)
            elif step.key is not None:
                self.sessions.tmux.send_key(record.pane, step.key)

    def approve(
        self, session_id: str, option: str | None, strict: bool = False, answers: list[list[str]] | None = None
    ) -> ApprovalResult:
        record = self.sessions.record(session_id)
        runtime, state, screen = self._check(record, strict)
        if answers is not None:
            hook = self.sessions.live_of(record.id).hook
            questions = hook.questions if hook else []
            picked = check_answers(questions, answers)

            def read() -> str:
                return self.sessions.tmux.capture(record.pane) or ""

            TerminalAnswers(runtime, read, lambda steps: self._send(record, steps)).run(questions, picked)
            return ApprovalResult(session_id=session_id, state=state, option="answers")
        menu = screen.classification.menu or runtime.parse_menu(screen.text)
        if menu is None or not menu.options:
            raise Conflict("cannot read the choices on screen; answer from the terminal view")
        if option is not None and option not in {o.key for o in menu.options}:
            raise Invalid(f"no option {option!r} on screen")
        chosen = option or runtime.choose_option(state, menu.options)
        if chosen is None:
            raise Conflict("no approving choice on screen; pick an option")
        self._send(record, runtime.select_steps(menu, chosen))
        return ApprovalResult(session_id=session_id, state=state, option=chosen)

    def deny(self, session_id: str) -> ApprovalResult:
        record = self.sessions.record(session_id)
        runtime, state, _ = self._check(record, strict=False)
        self._send(record, runtime.config.deny.send)
        return ApprovalResult(session_id=session_id, state=state, option=None)
