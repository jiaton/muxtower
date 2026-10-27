"""A push also says which earlier notifications can go: the sessions seen or answered since."""

import json

from muxtower.notify.models import Subscribe
from muxtower.notify.service import PushService
from muxtower.runtimes.models import AgentState
from muxtower.sessions.models import PendingAction, Session
from tests.test_notify_text import session
from tests.test_push import SUB, FakeSender
from tests.test_push_levels import Subscriptions


class Directory:
    marks = None

    def __init__(self, *sessions: Session) -> None:
        self.now = {s.id: s for s in sessions}

    def find(self, session_id: str) -> Session | None:
        return self.now.get(session_id)


def asking(sid: str) -> Session:
    pending = PendingAction(state=AgentState.NEEDS_PERMISSION, tool_name="Bash")
    return session(id=sid, state=AgentState.NEEDS_PERMISSION, needs_attention=True, pending=pending)


def test_the_next_push_names_the_sessions_seen_or_answered_since() -> None:
    sender = FakeSender()
    directory = Directory(asking("a"), session(id="b", unread=True), asking("c"))
    service = PushService(Subscriptions(Subscribe(**SUB)), sender, directory, "hub", lambda _: True)  # type: ignore[arg-type]
    assert service.notify("a") == 1 and service.notify_done("b") == 1
    assert json.loads(sender.sent[-1][1])["settled"] == []  # "a" still waits for the owner

    directory.now["a"] = session(id="a")  # answered
    directory.now["b"] = session(id="b", unread=False)  # read
    assert service.notify("c") == 1
    assert sorted(json.loads(sender.sent[-1][1])["settled"]) == ["a", "b"]

    directory.now["c"] = session(id="c")
    directory.now["a"] = asking("a")
    assert service.notify("a") == 1
    assert json.loads(sender.sent[-1][1])["settled"] == ["c"]  # "a" and "b" were said already
