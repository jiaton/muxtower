"""Due dates, acted on by the hub alone: each exactly once (a second round or a restart finds it claimed), what
fell due while the daemon was down on its start, a date alone at the due hour of the owner's day across a
daylight-saving change, a reminder as a push, a hand-off as one task (or, when its target is gone, the owner
told and the item left open). And the weekly nudge to the concierge. Made-up data only."""

import asyncio
import json
from collections.abc import Callable
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any

from fastapi import FastAPI
from fastapi.testclient import TestClient

from muxtower.inbox.firing import InboxWork
from muxtower.sessions.models import CreateSession
from tests.test_push import SUB, FakeSender

NEW_YORK = {"inbox.timezone": "America/New_York"}


def _client(app: FastAPI, device: str = "phone") -> tuple[TestClient, dict[str, str]]:
    _, token = app.state.tokens.create(device)
    return TestClient(app), {"Authorization": f"Bearer {token}"}


def _add(client: TestClient, auth: dict[str, str], **body: Any) -> Any:
    made = client.post("/v1/inbox", json={"text": "Renew the certificate", **body}, headers=auth)
    assert made.status_code == 201, made.text
    return made.json()


def _pushes(app: FastAPI, client: TestClient, auth: dict[str, str]) -> FakeSender:
    sender = FakeSender()
    app.state.push.sender = sender
    assert client.post("/v1/push/subscriptions", json=SUB, headers=auth).status_code == 200
    return sender


def test_a_reminder_fires_once_as_a_push(make_app: Callable[..., FastAPI]) -> None:
    app = make_app()
    client, auth = _client(app)
    sender = _pushes(app, client, auth)
    work: InboxWork = app.state.inbox_work
    past = (datetime.now(UTC) - timedelta(minutes=5)).isoformat()
    item = _add(client, auth, due=past)
    assert item["due_has_time"] and item["due_state"] == "due" and item["due_fired_at"] is None
    assert work.fire_due() == 1
    assert work.fire_due() == 0  # a second round: claimed already
    [(endpoint, payload)] = sender.sent
    pushed = json.loads(payload)
    assert pushed["kind"] == "inbox" and pushed["inbox_item"] == item["id"]
    assert pushed["title"] == "Due: Renew the certificate"
    now = client.get("/v1/inbox", headers=auth).json()["items"][0]
    assert now["due_fired_at"] and now["status"] == "open" and now["due_state"] == "due"
    assert work.next_due() is None

    fresh = make_app()  # a restart: nothing fires again
    assert fresh.state.inbox_work.fire_due() == 0


def test_a_new_due_date_is_acted_on_anew(make_app: Callable[..., FastAPI]) -> None:
    app = make_app()
    client, auth = _client(app)
    work: InboxWork = app.state.inbox_work
    item = _add(client, auth, due=(datetime.now(UTC) - timedelta(minutes=1)).isoformat())
    assert work.fire_due() == 1
    v = client.get("/v1/inbox", headers=auth).json()["items"][0]["version"]
    again = (datetime.now(UTC) - timedelta(seconds=1)).isoformat()
    moved = client.patch(f"/v1/inbox/{item['id']}", json={"due": again, "if_version": v}, headers=auth).json()
    assert moved["due_fired_at"] is None
    assert work.fire_due() == 1
    cleared = client.patch(
        f"/v1/inbox/{item['id']}", json={"due": None, "if_version": moved["version"] + 1}, headers=auth
    )
    assert cleared.json()["due"] is None and cleared.json()["due_state"] == "none"


async def test_a_due_date_survives_a_restart_and_what_was_missed_fires_on_start(
    make_app: Callable[..., FastAPI],
) -> None:
    app = make_app()
    client, auth = _client(app)
    soon = datetime.now(UTC) + timedelta(hours=2)
    later = _add(client, auth, text="Later", due=soon.isoformat())
    missed = _add(client, auth, text="Missed", due=(datetime.now(UTC) - timedelta(days=2)).isoformat())
    assert later["due_state"] == "upcoming" and missed["due_state"] == "overdue"

    restarted = make_app()  # the daemon was down when "Missed" fell due
    work: InboxWork = restarted.state.inbox_work
    assert work.next_due() is not None and work.next_due() < datetime.now(UTC)

    loop = asyncio.create_task(restarted.state.inbox_schedule.run_loop())  # as the daemon starts it
    for _ in range(100):
        await asyncio.sleep(0.02)
        if (following := work.next_due()) is not None and following > datetime.now(UTC):
            break
    loop.cancel()
    assert work.next_due() == soon  # only "Later" is left: "Missed" went out on start
    assert work.fire_due(soon - timedelta(seconds=1)) == 0
    assert work.fire_due(soon) == 1


def test_a_date_alone_falls_due_at_the_due_hour_across_daylight_saving(make_app: Callable[..., FastAPI]) -> None:
    """New York moves its clocks on 2026-03-08: 09:00 there is 14:00 UTC before, 13:00 UTC after."""
    app = make_app(**NEW_YORK)
    client, auth = _client(app)
    work: InboxWork = app.state.inbox_work
    before = _add(client, auth, text="Before", due="2026-03-07", due_has_time=False)
    after = _add(client, auth, text="After", due="2026-03-09", due_has_time=False)
    assert before["due"].startswith("2026-03-07T14:00:00") and not before["due_has_time"]
    assert after["due"].startswith("2026-03-09T13:00:00")
    assert work.fire_due(datetime(2026, 3, 7, 13, 59, tzinfo=UTC)) == 0
    assert work.fire_due(datetime(2026, 3, 7, 14, 0, tzinfo=UTC)) == 1
    assert work.fire_due(datetime(2026, 3, 9, 12, 59, tzinfo=UTC)) == 0
    assert work.fire_due(datetime(2026, 3, 9, 13, 0, tzinfo=UTC)) == 1

    later = make_app(**NEW_YORK, **{"inbox.due_hour": 18})  # the due hour is read each time
    item = _add(
        TestClient(later), _client(later, "tablet")[1], text="Evening", due="2026-11-02T08:00:00", due_has_time=False
    )
    assert item["due"].startswith("2026-11-02T23:00:00")  # 18:00 EST (after the clocks went back)


def test_a_time_without_an_offset_is_the_owners(make_app: Callable[..., FastAPI]) -> None:
    app = make_app(**{"inbox.timezone": "Asia/Tokyo"})
    client, auth = _client(app)
    local = _add(client, auth, due="2031-07-01T18:30")
    assert local["due"].startswith("2031-07-01T09:30:00") and local["due_has_time"]
    exact = _add(client, auth, due="2031-07-01T18:30:00+02:00")
    assert exact["due"].startswith("2031-07-01T16:30:00")


def _session(app: FastAPI, tmp_path: Path, name: str, project: str, role: str) -> str:
    made = app.state.sessions.create(CreateSession(runtime="claude", cwd=str(tmp_path), name=name))
    app.state.teams.set_project(made.id, project)
    app.state.teams.set_role(made.id, role, None)
    return str(made.id)


def test_a_due_hand_off_goes_to_the_roles_holder(make_app: Callable[..., FastAPI], tmp_path: Path) -> None:
    app = make_app()
    client, auth = _client(app)
    sender = _pushes(app, client, auth)
    trader = _session(app, tmp_path, "desk", "acme/fund", "Trader")
    target = {"project": "acme/fund", "role": "trader"}
    due = (datetime.now(UTC) - timedelta(seconds=1)).isoformat()
    item = _add(client, auth, text="Window ends for XYZ: sell", due=due, on_due="hand_off", due_target=target)
    assert app.state.team_tasks.repo.held() == []  # nobody's context is touched before the day
    assert app.state.inbox_work.fire_due() == 1
    assert app.state.inbox_work.fire_due() == 0
    [task] = app.state.team_tasks.repo.held()
    assert task.to_id == trader and task.text == "Window ends for XYZ: sell" and task.from_label == "the owner's Inbox"
    now = client.get("/v1/inbox", headers=auth).json()["items"][0]
    assert now["status"] == "handed" and now["handed"]["task_id"] == task.id and now["id"] == item["id"]
    assert json.loads(sender.sent[0][1])["title"].startswith("Handed: ")
    assert client.post("/v1/inbox", json={"text": "x", "on_due": "hand_off"}, headers=auth).status_code == 400


def test_a_due_hand_off_whose_target_is_gone_tells_the_owner(make_app: Callable[..., FastAPI]) -> None:
    app = make_app()
    client, auth = _client(app)
    sender = _pushes(app, client, auth)
    due = (datetime.now(UTC) - timedelta(seconds=1)).isoformat()
    target = {"project": "acme/fund", "role": "trader"}
    _add(client, auth, due=due, on_due="hand_off", due_target=target)
    gone = {"project": "acme/fund", "session_id": "gone1"}
    _add(client, auth, text="To a session", due=due, on_due="hand_off", due_target=gone)
    assert app.state.inbox_work.fire_due() == 2
    assert app.state.inbox_work.fire_due() == 0
    assert app.state.team_tasks.repo.held() == []
    items = client.get("/v1/inbox", headers=auth).json()["items"]
    assert [i["status"] for i in items] == ["open", "open"] and all(i["due_fired_at"] for i in items)
    bodies = sorted(json.loads(p)["body"] for _, p in sender.sent)
    assert bodies[0].startswith("no one in acme/fund holds trader") and "stays open" in bodies[0]
    assert bodies[1].startswith("no session gone1")


def _stale(app: FastAPI, days: int) -> None:
    then = (datetime.now(UTC) - timedelta(days=days)).isoformat()
    with app.state.inbox.db.connect() as conn:
        conn.execute("UPDATE inbox_items SET updated_at = ?", (then,))


def test_the_weekly_nudge_to_the_concierge(make_app: Callable[..., FastAPI], tmp_path: Path) -> None:
    app = make_app()
    client, auth = _client(app)
    work: InboxWork = app.state.inbox_work
    assistant = _session(app, tmp_path, "assistant", "home", "assistant")
    work.concierge = lambda: assistant
    item = _add(client, auth, text="Look at the old idea", project="acme/shop")
    assert work.nudge() is False  # nothing stale
    _stale(app, 15)
    assert work.nudge() is True
    [task] = app.state.team_tasks.repo.held()
    assert task.to_id == assistant and f"#{item['id']} v1 · open · acme/shop" in task.text
    assert "not touched for 14 days" in task.text
    assert work.nudge() is False  # once a week
    assert work.nudge(datetime.now(UTC) + timedelta(days=8)) is True

    off = make_app(**{"inbox.cleanup": False})
    off.state.inbox_work.concierge = lambda: assistant
    _stale(off, 30)
    assert off.state.inbox_work.nudge() is False
    held = len(app.state.team_tasks.repo.held())
    app.state.settings.inbox.cleanup = False  # changed in the app: read each time
    assert work.nudge(datetime.now(UTC) + timedelta(days=30)) is False
    assert len(app.state.team_tasks.repo.held()) == held


async def test_the_loop_sleeps_until_a_change_wakes_it(make_app: Callable[..., FastAPI]) -> None:
    """Nothing due: it sleeps (an hour at most); an item added wakes it, and what is due goes out."""
    from muxtower.inbox.models import NewInboxItem

    app = make_app()
    work: InboxWork = app.state.inbox_work
    rounds: list[int] = []
    fire = work.fire_due
    work.fire_due = lambda now=None: rounds.append(1) or fire(now)  # type: ignore[method-assign,func-returns-value]
    loop = asyncio.create_task(app.state.inbox_schedule.run_loop())
    await asyncio.sleep(0.1)
    assert len(rounds) == 1  # the first round, then asleep
    due = datetime.now(UTC) - timedelta(seconds=1)
    await asyncio.to_thread(app.state.inbox.add, NewInboxItem(text="Now", due=due), "phone")
    for _ in range(100):
        await asyncio.sleep(0.02)
        if work.next_due() is None:
            break
    loop.cancel()
    assert work.next_due() is None and len(rounds) >= 2
