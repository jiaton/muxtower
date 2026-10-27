"""The hub's view of its nodes, without a network: joining, what they report, ids, offline."""

import asyncio
from pathlib import Path
from typing import Any

from muxtower.infra.bus import EventBus
from muxtower.infra.db import Database
from muxtower.nodes.hub import Nodes
from muxtower.nodes.link import NodeLink
from muxtower.nodes.protocol import PROTOCOL, Hello
from muxtower.nodes.repository import SqliteNodeRepository
from muxtower.nodes.source import NodeSource
from muxtower.runtimes.models import AgentState
from muxtower.sessions.ports import SessionSource
from tests.test_notify_text import session


def nodes(tmp_path: Path) -> tuple[Nodes, NodeSource, EventBus]:
    db = Database(tmp_path / "db.sqlite")
    db.migrate()
    bus = EventBus()
    hub = Nodes(SqliteNodeRepository(db), bus)
    return hub, NodeSource(hub), bus


def report(**over: Any) -> dict[str, Any]:
    return session(**over).model_dump(mode="json")


def test_a_node_joins_with_its_own_token_and_can_be_removed(tmp_path: Path) -> None:
    hub, _, _ = nodes(tmp_path)
    name, token = hub.claim("Ada's MacBook")
    again, _ = hub.claim("Ada's MacBook")
    assert (name, again) == ("ada-s-macbook", "ada-s-macbook-2")
    assert hub.authenticate(token) == name and hub.authenticate("mxn_nope") is None
    hub.revoke(name)
    assert hub.authenticate(token) is None
    assert [n.name for n in nodes(tmp_path)[0].infos()] == ["ada-s-macbook-2"]  # kept in SQLite


def test_its_sessions_are_listed_under_hub_ids_and_offline_from_its_last_report(tmp_path: Path) -> None:
    hub, source, _ = nodes(tmp_path)
    name, _ = hub.claim("mac")
    hub.on_event(name, "sessions", [
        report(id="a1", machine="mac", on_host=True),
        report(id="cse_1", source=SessionSource.REMOTE_CONTROL, on_host=True),
    ])  # fmt: skip
    views = {v.id: v for v in source.views()}
    assert set(views) == {"mac~a1", "cse_1"}
    assert views["mac~a1"].node == "mac" and views["mac~a1"].machine == "mac"
    assert views["mac~a1"].offline and not views["mac~a1"].capabilities.screen  # never linked yet

    _, restarted = nodes(tmp_path)[:2]  # the hub restarts: still listed, offline
    assert {v.id for v in restarted.views()} == {"mac~a1", "cse_1"}
    assert restarted.owns("mac~a1") and not restarted.owns("a1")  # a plain id is this daemon's own


def test_a_remote_control_session_is_listed_from_where_its_agent_runs(tmp_path: Path) -> None:
    hub, source, _ = nodes(tmp_path)
    name, _ = hub.claim("mac")
    source.elsewhere = lambda sid: sid == "cse_1"  # this daemon's own Remote Control lists it too
    hub.on_event(name, "sessions", [report(id="cse_1", source=SessionSource.REMOTE_CONTROL, on_host=False)])
    assert not source.owns("cse_1") and source.views() == []  # it runs elsewhere: the source here keeps it
    hub.on_event(name, "sessions", [report(id="cse_1", source=SessionSource.REMOTE_CONTROL, on_host=True)])
    assert source.owns("cse_1") and [v.id for v in source.views()] == ["cse_1"]  # it runs on the node


def test_attention_is_announced_when_a_session_starts_needing_the_owner(tmp_path: Path) -> None:
    hub, _, bus = nodes(tmp_path)
    name, _ = hub.claim("mac")
    queue: asyncio.Queue[tuple[str, Any]] = asyncio.Queue()
    bus.subscribe("attention:*", queue)
    hub.on_event(name, "sessions", [report(id="a1", state=AgentState.NEEDS_PERMISSION, needs_attention=True)])
    assert queue.empty()  # first sight: not announced
    hub.on_event(name, "sessions", [report(id="a1", state=AgentState.IDLE)])
    hub.on_event(name, "sessions", [report(id="a1", state=AgentState.NEEDS_PERMISSION, needs_attention=True)])
    assert queue.get_nowait()[0] == "attention:mac~a1" and queue.empty()


def test_a_link_answers_requests_and_fails_them_when_it_drops(tmp_path: Path) -> None:
    hub, _, _ = nodes(tmp_path)
    name, _ = hub.claim("mac")
    sent: list[str] = []

    async def run() -> None:
        async def send(frame: str) -> None:
            sent.append(frame)

        async def hangup(code: int) -> None:
            pass

        link = NodeLink(name, send, hangup)
        await hub.attach(name, link, Hello(protocol=PROTOCOL, name="mac", version="1"))
        assert hub.infos()[0].online
        call = asyncio.create_task(link.call("deny", {"session_id": "a1"}, timeout=5))
        await asyncio.sleep(0)
        link.answered({"id": 1, "error": {"status": 409, "message": "nothing is waiting"}})
        try:
            await call
            raise AssertionError("expected the node's 409")
        except Exception as exc:  # noqa: BLE001
            assert type(exc).__name__ == "Conflict" and str(exc) == "nothing is waiting"
        pending = asyncio.create_task(link.call("deny", {"session_id": "a1"}, timeout=5))
        await asyncio.sleep(0)
        hub.detach(name, link)
        try:
            await pending
            raise AssertionError("expected a dropped link to fail the call")
        except Exception as exc:  # noqa: BLE001
            assert type(exc).__name__ == "Unavailable"
        assert not hub.infos()[0].online and hub.infos()[0].last_seen is not None

    asyncio.run(run())
    assert '"method": "deny"' in sent[0]
