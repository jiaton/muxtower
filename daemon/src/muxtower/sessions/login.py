"""Logging the daemon's machine in to Claude again, from the app: Remote Control is read with that login,
and when it expires only a new one brings Claude Desktop's sessions back."""

import re
import time
from pathlib import Path

from pydantic import BaseModel, Field

from muxtower.sessions.models import Session
from muxtower.sessions.service import SessionService

LOGIN_ARGS = ["auth", "login"]
LOGIN_NAME = "Claude login"
SIGN_IN_URL = re.compile(r"https://\S+/oauth/authorize\?\S+")
URL_WAIT_SECONDS = 15.0


class LoginStart(BaseModel):
    session: Session
    url: str | None = Field(description="the page to sign in at, read off the session's screen; none if it "
                            "showed none in time (the session then says why)")  # fmt: skip


def start_claude_login(sessions: SessionService, wait: float = URL_WAIT_SECONDS) -> LoginStart:
    """Blocking. `claude auth login` in a session of its own, in the home folder: it shows a link to sign
    in at and waits for the code that page gives (typed into the session). Logged in, it exits, and the
    session ends with it. No hooks: it is not an agent. The link is read off its screen with wrapped lines
    joined, since a phone cannot follow one that a terminal broke in pieces."""
    runtime = sessions.resolve_runtime("claude")
    session = sessions.launch(runtime, str(Path.home()), LOGIN_ARGS, LOGIN_NAME, hooks=False)
    pane = sessions.record(session.id).pane
    deadline = time.monotonic() + wait
    while True:
        if found := SIGN_IN_URL.search(sessions.tmux.capture(pane) or ""):
            return LoginStart(session=session, url=found.group(0))
        if time.monotonic() >= deadline:
            return LoginStart(session=session, url=None)
        time.sleep(0.25)
