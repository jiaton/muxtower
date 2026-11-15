"""start_session never reports failure for a session that exists, and the same start asked again (a caller
that took the first for failed) returns the session it made instead of a second one."""

import threading
import time
from types import SimpleNamespace
from typing import Any

import pytest

from muxtower.errors import Unavailable
from muxtower.mcp import reach
from muxtower.mcp.caller import CALLER, Caller
from muxtower.mcp.session_tools import SessionTools, StartArgs
from muxtower.sessions.models import CreateSession


class Hub:
    """A launcher whose agents take `slow` seconds to come up, and the sessions it made."""

    def __init__(self, slow: float = 0.0) -> None:
        self.slow = slow
        self.made: dict[str, SimpleNamespace] = {}
        self.audit: list[tuple[str, str, str | None, str | None]] = []

    def create(self, request: CreateSession) -> SimpleNamespace:
        time.sleep(self.slow)
        session = SimpleNamespace(id=f"s{len(self.made) + 1}", name=request.name or "web", cwd=request.cwd, node=None)
        self.made[session.id] = session
        return session

    def get(self, session_id: str) -> SimpleNamespace:
        return self.made[session_id]

    def update(self, session_id: str, patch: Any) -> SimpleNamespace:
        self.made[session_id].name = patch.name
        return self.made[session_id]

    def tools(self, teams: Any = None) -> SessionTools:
        tools = SessionTools(self, self, "nas", lambda: [], teams)  # type: ignore[arg-type]
        tools.audit = SimpleNamespace(record=lambda *a: self.audit.append(a))  # type: ignore[assignment]
        return tools


ASKED = StartArgs(cwd="/srv/crawler", name="crawler 迁移", prompt="先回答我交接方式。" * 40, machine="nas")


def test_the_same_start_asked_again_returns_the_session_it_made() -> None:
    hub = Hub()
    tools = hub.tools()
    first = tools.start_session(ASKED)
    again = tools.start_session(ASKED)
    assert first.startswith("Started crawler 迁移 (s1) on nas")
    assert again.startswith("Already started crawler 迁移 (s1)") and len(hub.made) == 1
    assert [a[3].split(" outcome=")[1].split(" ")[0] for a in hub.audit if a[3]] == ["started", "already"]
    assert hub.audit[0][1:3] == ("mcp:start_session", "s1")
    assert "machine=nas cwd=/srv/crawler" in (hub.audit[0][3] or "")
    other = tools.start_session(ASKED.model_copy(update={"prompt": "something else"}))
    assert other.startswith("Started") and len(hub.made) == 2  # other arguments: another start


def test_a_key_given_makes_the_start_the_same_and_it_lapses() -> None:
    hub = Hub()
    tools = hub.tools()
    now = [100.0]
    tools.clock = lambda: now[0]
    tools.start_session(StartArgs(cwd="/srv", idempotency_key="k1", prompt="one"))
    assert tools.start_session(StartArgs(cwd="/srv", idempotency_key="k1", prompt="two")).startswith("Already")
    now[0] += 121  # past two minutes: a new start
    assert tools.start_session(StartArgs(cwd="/srv", idempotency_key="k1", prompt="two")).startswith("Started")
    assert len(hub.made) == 2


def test_another_caller_with_the_same_arguments_starts_its_own() -> None:
    hub = Hub()
    tools = hub.tools()
    CALLER.set(Caller("session a", "a"))
    tools.start_session(ASKED)
    CALLER.set(Caller("session b", "b"))
    assert tools.start_session(ASKED).startswith("Started") and len(hub.made) == 2


def test_a_slow_agent_still_gets_one_session_and_no_error_when_asked_twice_at_once() -> None:
    hub = Hub(slow=0.3)
    tools = hub.tools()
    answers: list[str] = []
    callers = [threading.Thread(target=lambda: answers.append(tools.start_session(ASKED))) for _ in range(2)]
    for t in callers:
        t.start()
    for t in callers:
        t.join()
    assert len(hub.made) == 1 and sorted(a.split(" ")[0] for a in answers) == ["Already", "Started"]


def test_what_fails_after_it_runs_is_said_not_raised() -> None:
    def broken(*_: Any) -> None:
        raise RuntimeError("team store busy")

    teams = SimpleNamespace(set_role=broken, set_project=broken, member=broken, resumed=broken)
    hub = Hub()
    text = hub.tools(teams).start_session(ASKED.model_copy(update={"role": "dev", "project": "x/y"}))
    assert text.startswith("Started crawler 迁移 (s1)") and "NOTE: its role or project was not set" in text


def test_a_node_asks_again_when_the_hubs_answer_is_lost_and_gets_the_same_session(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(reach, "RETRY_SECONDS", 0.0)
    hub = Hub(slow=0.1)
    hub_tools = hub.tools()
    lost = [True]

    def forward(name: str, arguments: dict[str, Any], session_id: str | None) -> str:
        token = CALLER.set(Caller("node silly", f"silly~{session_id}"))  # as the hub sees a node's session
        try:
            text = hub_tools.start_session(StartArgs.model_validate(arguments))
        finally:
            CALLER.reset(token)
        if lost[0]:  # started, but its answer never came back in time
            lost[0] = False
            raise Unavailable("nas did not answer in time")
        return text

    def here(_: StartArgs) -> str:
        raise AssertionError("started on the node instead")

    CALLER.set(Caller("session c1", "c1"))
    start = reach.starting_anywhere(here, forward, "silly")
    assert start(ASKED).startswith("Already started crawler 迁移 (s1)") and len(hub.made) == 1
    # The agent, told nothing, asks again itself: still the one session.
    assert start(ASKED).startswith("Already started") and len(hub.made) == 1


def test_a_node_that_cannot_reach_the_hub_says_it_may_have_started(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(reach, "RETRY_SECONDS", 0.0)

    def forward(*_: Any) -> str:
        raise Unavailable("nas did not answer in time")

    start = reach.starting_anywhere(lambda _: "", forward, "silly")
    with pytest.raises(Unavailable, match="check list_sessions before trying again"):
        start(ASKED)
