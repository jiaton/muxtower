"""Which pushes a session sends, as the owner set it (`NotifyLevel`)."""

import asyncio

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from muxtower.notify import service as push_service
from muxtower.notify.models import Subscribe
from muxtower.notify.ports import StoredSubscription
from muxtower.notify.service import PushService
from muxtower.runtimes.models import AgentState
from muxtower.sessions.models import NotifyLevel, PendingAction, Session, TurnSummary
from tests import screens
from tests.fakes import FakeTmux
from tests.test_notify_text import session
from tests.test_push import SUB, FakeSender

WAITING = TurnSummary(status="need_input", detail="4 drafts ready", needs="Fill in the contacts")
QUIET = TurnSummary(status="review_ready", detail="No new messages; checking again at 23:41")


class Subscriptions:
    def __init__(self, *subs: Subscribe) -> None:
        self.subs = [
            StoredSubscription(
                id=str(i),
                client_ref=s.client_ref,
                states=s.states,
                done=s.done,
                muted=s.muted,
                endpoint=s.endpoint,
                p256dh=s.keys.p256dh,
                auth=s.keys.auth,
                device="phone",
            )  # fmt: skip
            for i, s in enumerate(subs)
        ]

    def list(self) -> list[StoredSubscription]:
        return self.subs

    def delete(self, sub_id: str) -> bool:
        return False


class Directory:
    """The one session, as it is now."""

    marks = None

    def __init__(self, now: Session) -> None:
        self.now = now

    def find(self, session_id: str) -> Session | None:
        return self.now


def push(now: Session, *subs: Subscribe) -> tuple[PushService, FakeSender, Directory]:
    sender, directory = FakeSender(), Directory(now)
    service = PushService(Subscriptions(*(subs or (Subscribe(**SUB),))), sender, directory, "hub", lambda _: True)  # type: ignore[arg-type]
    return service, sender, directory


def test_off_sends_nothing() -> None:
    asking = session(
        notify=NotifyLevel.OFF, state=AgentState.NEEDS_PERMISSION, needs_attention=True,
        pending=PendingAction(state=AgentState.NEEDS_PERMISSION, tool_name="Bash"),
    )  # fmt: skip
    service, sender, directory = push(asking)
    assert service.notify("s1") == 0
    directory.now = session(notify=NotifyLevel.OFF, summary=WAITING)
    assert service.notify_done("s1") == 0
    assert sender.sent == []


def test_needs_sends_prompts_and_only_the_turns_that_ask_for_the_owner() -> None:
    asking = session(
        notify=NotifyLevel.NEEDS, state=AgentState.NEEDS_ANSWER, needs_attention=True,
        pending=PendingAction(state=AgentState.NEEDS_ANSWER, detail="Which branch?"),
    )  # fmt: skip
    quiet_devices = Subscribe(**{**SUB, "done": False})  # take no other finished turns
    service, sender, directory = push(asking, quiet_devices)
    assert service.notify("s1") == 1
    directory.now = session(notify=NotifyLevel.NEEDS, summary=QUIET)
    assert service.notify_done("s1") == 0
    directory.now = session(notify=NotifyLevel.NEEDS)  # no summary: nothing says it needs anyone
    assert service.notify_done("s1") == 0
    directory.now = session(notify=NotifyLevel.NEEDS, summary=WAITING)
    assert service.notify_done("s1") == 1
    assert "Done, waiting for you: Fill in the contacts" in sender.sent[-1][1]


def test_a_finished_turn_waits_for_its_summary_when_only_needs_notify(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(push_service, "SUMMARY_POLL_SECONDS", 0.01)
    service, sender, directory = push(session(notify=NotifyLevel.NEEDS, summary=TurnSummary(status="working")))

    async def run() -> None:
        finished = asyncio.create_task(service._finished("s1"))
        await asyncio.sleep(0.05)
        assert sender.sent == []  # still waiting for what the turn left
        directory.now = session(notify=NotifyLevel.NEEDS, summary=WAITING)
        await asyncio.wait_for(finished, 1)

    asyncio.run(run())
    assert len(sender.sent) == 1


def test_all_does_not_wait_for_a_summary(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(push_service, "SUMMARY_WAIT_SECONDS", 3600.0)
    service, sender, _ = push(session(summary=TurnSummary(status="working")))
    asyncio.run(asyncio.wait_for(service._finished("s1"), 1))
    assert len(sender.sent) == 1


def test_the_level_is_set_per_session_and_kept(app: FastAPI, client: TestClient, auth: dict[str, str],
                                                tmux: FakeTmux) -> None:  # fmt: skip
    tmux.add_pane("default", "work", "claude").screen = screens.IDLE
    app.state.monitor.tick()
    (listed,) = client.get("/v1/sessions", headers=auth).json()
    assert listed["notify"] == "all"
    put = client.put(f"/v1/sessions/{listed['id']}/notify", json={"level": "needs"}, headers=auth)
    assert put.status_code == 200 and put.json()["notify"] == "needs"
    assert client.get("/v1/sessions", headers=auth).json()[0]["notify"] == "needs"
    assert app.state.directory.marks.repo.load()[listed["id"]].notify == "needs"  # in SQLite
    assert client.put(f"/v1/sessions/{listed['id']}/notify", json={"level": "loud"}, headers=auth).status_code == 422
