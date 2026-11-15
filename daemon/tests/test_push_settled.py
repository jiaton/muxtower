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


def test_settled_notifications_are_taken_away_only_while_another_stays_on_screen() -> None:
    sender = FakeSender()
    directory = Directory(asking("a"), session(id="b", unread=True))
    service = PushService(Subscriptions(Subscribe(**SUB)), sender, directory, "hub", lambda _: True)  # type: ignore[arg-type]
    service.notify("a")
    service.notify_done("b")
    assert service.clear_settled() == 0  # nothing settled: no push

    directory.now["b"] = session(id="b", unread=False)  # read on another device
    before = len(sender.sent)
    assert service.clear_settled() == 1
    clear = json.loads(sender.sent[-1][1])
    assert clear["kind"] == "clear" and clear["settled"] == ["b"] and len(sender.sent) == before + 1
    assert service.clear_settled() == 0  # said once

    directory.now["a"] = session(id="a")  # answered: the last one this device shows
    assert service.clear_settled() == 0  # a push must leave something on screen: it waits for the next one
    directory.now.pop("a")  # gone
    assert service.clear_settled() == 0


def test_a_gone_session_is_settled_and_apple_devices_get_no_clearing_push() -> None:
    sender = FakeSender()
    directory = Directory(asking("a"), asking("b"))
    apple = Subscribe(**{**SUB, "endpoint": "https://web.push.apple.com/abc"})
    service = PushService(Subscriptions(apple), sender, directory, "hub", lambda _: True)  # type: ignore[arg-type]
    service.notify("a")
    service.notify("b")
    directory.now.pop("a")
    assert service.clear_settled() == 0  # iOS: never a push that shows nothing
    assert json.loads(sender.sent[-1][1])["kind"] == "attention"


def test_notifications_shown_before_a_restart_are_still_taken_away_after_it(tmp_path, caplog) -> None:  # type: ignore[no-untyped-def]
    """The case seen: six "Done" notifications; three of them read since (a node's session among them),
    the daemon updated (restarted) in between, and none was taken away. Made-up ids, the real shapes."""
    import logging

    from muxtower.infra.db import Database
    from muxtower.notify.repository import SqliteShownStore

    db = Database(tmp_path / "m.db")
    db.migrate()
    node, merged, plain = "laptop~0123abcd4567", "5a6b7c8d9e0f", "aa11bb22cc33"
    unread = ["u1", "u2", "laptop~u3"]
    directory = Directory(*(session(id=sid, unread=True) for sid in [node, merged, plain, *unread]))
    subs = Subscriptions(Subscribe(**SUB))
    sender = FakeSender()
    before = PushService(subs, sender, directory, "hub", lambda _: True, SqliteShownStore(db))  # type: ignore[arg-type]
    for sid in [node, merged, plain, *unread]:
        assert before.notify_done(sid) == 1

    # The daemon restarts; then three are read (on another device, or here).
    after = PushService(subs, sender, directory, "hub", lambda _: True, SqliteShownStore(Database(tmp_path / "m.db")))  # type: ignore[arg-type]
    for sid in (node, merged, plain):
        directory.now[sid] = session(id=sid, unread=False)
    caplog.set_level(logging.INFO, "muxtower.push")
    assert after.clear_settled() == 1
    clear = json.loads(sender.sent[-1][1])
    assert clear["kind"] == "clear" and sorted(clear["settled"]) == sorted([node, merged, plain])
    assert "sent: 3 of 6 shown settled" in caplog.text
    caplog.clear()
    assert after.clear_settled() == 0  # said once, and so logged once
    assert "3 shown, none settled" in caplog.text
    after.clear_settled()
    assert caplog.text.count("3 shown, none settled") == 1  # the same decision again: not logged again
