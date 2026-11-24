"""Claude Code dialogs no rule knows by name (a tip, /config, /model, "Resume this conversation?"…): each is
a dialog all the same. It needs the owner, says its title, holds what would be typed into it (the owner's
messages and teammates' tasks), and an idle hook does not end it."""

import time
from collections.abc import Callable
from pathlib import Path
from typing import Any

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from muxtower.hooks.events import HookEvent, apply_event
from muxtower.notify.text import attention_text
from muxtower.runtimes.models import DIALOG, AgentState
from muxtower.runtimes.spec import load_runtimes
from muxtower.sessions.live import HookState, ScreenState, merge
from muxtower.sessions.models import CreateSession
from tests import screens
from tests.fakes import FakeTmux
from tests.test_teams import _tool


def claude():  # type: ignore[no-untyped-def]
    return load_runtimes(None)["claude-code"]


@pytest.mark.parametrize(
    ("screen", "title"),
    [
        (screens.DIALOG_TEACH_AUTO_MODE, "Teach auto mode about your environment?"),
        (screens.DIALOG_RESUME, "Resume this conversation?"),
        (screens.DIALOG_CONFIG, "Settings  Status   Config   Usage   Stats"),
        (screens.DIALOG_MODEL, "Select model"),
        (screens.DIALOG_TRUST_FILES, "Do you trust the files in this folder?"),
        (screens.DIALOG_PERMISSIONS, "Permissions  Recently blocked   Allow   Ask   Deny   Auto mode   Workspace"),
        (screens.DIALOG_MCP, "MCP servers"),
        (screens.DIALOG_RESUME_LIST, "Resume session"),
        (screens.DIALOG_MENU_ONLY, "Resume this conversation?"),
        (screens.DIALOG_CHECKBOXES, "Pick the folders to index"),
        (screens.AUTO_MODE_TIP, "Teach auto mode about your environment?"),  # a panel over the input box
    ],
)
def test_a_dialog_no_rule_knows_is_a_dialog_with_its_title(screen: str, title: str) -> None:
    found = claude().classify(screen)
    assert (found.state, found.kind, found.detail) == (AgentState.NEEDS_ANSWER, DIALOG, title)
    assert claude().choose_option(found.state, found.options) is None  # never answered for the owner


def test_its_choices_are_read_for_the_app() -> None:
    found = claude().classify(screens.DIALOG_RESUME)
    assert [o.label for o in found.options] == [
        "Resume",
        "Start a new conversation  Claude can look this one up if you refer to it later",
    ]
    assert found.menu is not None and found.menu.cursor == 0


@pytest.mark.parametrize(
    ("screen", "state"),
    [
        (screens.IDLE, AgentState.IDLE),
        (screens.IDLE_BOX, AgentState.IDLE),
        (screens.LONG_IDLE, AgentState.IDLE),
        (screens.IDLE_QUOTING_DIALOG, AgentState.IDLE),  # "Enter to confirm · Esc to cancel" above the box
        (screens.IDLE_QUOTING_FOOTERS, AgentState.IDLE),  # footers, numbered choices, checkboxes above it
        (screens.DONE_QUOTING, AgentState.IDLE),  # the status bar's "↓ to manage"
        (screens.SUGGESTION_ANSI, AgentState.IDLE),
        (screens.BUSY_BOX, AgentState.BUSY),  # "esc to interrupt"
        (screens.WORKING_NARROW, AgentState.BUSY),
        (screens.BUSY_QUOTING_DIALOG, AgentState.BUSY),
        (screens.STATUS_BAR_ONLY, AgentState.BUSY),  # the status bar at the bottom, no box above it
    ],
)
def test_what_is_no_dialog(screen: str, state: AgentState) -> None:
    found = claude().classify(screen)
    assert (found.state, found.kind) == (state, None)


def test_dialogs_known_by_name_keep_their_own_state_and_rule() -> None:
    rt = claude()
    known = {
        "PERMISSION": (AgentState.NEEDS_PERMISSION, "tool-permission-generic"),
        "QUESTION": (AgentState.NEEDS_ANSWER, "question"),
        "CLAUDE_QUESTION_PREVIEWS": (AgentState.NEEDS_ANSWER, "question"),
        "TRUST": (AgentState.NEEDS_TRUST, "workspace-trust"),
        "MCP_TRUST": (AgentState.NEEDS_TRUST, "mcp-server-trust"),
        "BYPASS_CONFIRM": (AgentState.NEEDS_TRUST, "bypass-mode-confirm"),
        "PLAN": (AgentState.PLAN_REVIEW, "plan-review"),
        "PEER_MESSAGE": (AgentState.NEEDS_PERMISSION, "peer-message"),
        "FIRST_THEME": (AgentState.NEEDS_ANSWER, "first-start-theme"),
        "FIRST_LOGIN": (AgentState.NEEDS_ANSWER, "first-start-login"),
    }
    for name, (state, rule) in known.items():
        found = rt.classify(getattr(screens, name))
        assert (name, found.state, found.rule) == (name, state, rule)
        assert found.kind != DIALOG


def _shown(screen: str, since: float) -> ScreenState:
    return ScreenState(claude().classify(screen), screen, since)


def test_an_idle_hook_does_not_end_a_dialog_only_work_does() -> None:
    stop = apply_event(None, HookEvent(hook_event_name="Stop"))
    assert stop is not None
    shown = _shown(screens.DIALOG_RESUME, stop.at + 1)  # the dialog came up after the turn ended
    effective = merge(stop, shown, shown.since + 1)
    assert effective.state == AgentState.NEEDS_ANSWER and effective.pending is not None
    assert (effective.pending.kind, effective.pending.detail) == (DIALOG, "Resume this conversation?")

    # A minute on, Claude Code says it has waited for input: no news, and the dialog is still the state.
    later = apply_event(stop, HookEvent(hook_event_name="Notification", notification_type="idle_prompt"))
    assert later is stop
    assert merge(later, shown, shown.since + 90).state == AgentState.NEEDS_ANSWER
    # Even an idle hook newer than the dialog (it started with it) does not end it.
    started = HookState(AgentState.IDLE, at=shown.since + 2)
    assert merge(started, shown, shown.since + 90).state == AgentState.NEEDS_ANSWER
    # Work since it showed does: it is answered.
    working = HookState(AgentState.BUSY, at=shown.since + 3)
    assert merge(working, shown, shown.since + 4).state == AgentState.BUSY


def test_a_question_its_hook_reported_stays_the_question() -> None:
    asked = HookState(AgentState.NEEDS_ANSWER, at=time.monotonic(), tool_name="AskUserQuestion", detail="Which?")
    shown = _shown(screens.DIALOG_MENU_ONLY, asked.at + 0.5)  # read on screen by the generic rules
    pending = merge(asked, shown, shown.since + 1).pending
    assert pending is not None and (pending.kind, pending.detail) == (None, "Which?")


def test_the_owner_is_told_it_waits_on_a_dialog(app: FastAPI, client: TestClient, auth: dict[str, str],
                                                 tmux: FakeTmux) -> None:  # fmt: skip
    pane = tmux.add_pane("default", "work", "claude")
    pane.screen = screens.IDLE_BOX
    app.state.monitor.tick()
    pane.screen = screens.DIALOG_RESUME
    result = app.state.monitor.tick()
    session = client.get("/v1/sessions", headers=auth).json()[0]
    assert result.attention == [session["id"]]  # pushed as any prompt is
    assert session["state"] == "needs_answer" and session["needs_attention"]
    assert (session["pending"]["kind"], session["pending"]["detail"]) == ("dialog", "Resume this conversation?")
    assert session["pending"]["recommended"] is None
    view = app.state.directory.get(session["id"])
    assert attention_text(view)[1].startswith("Waiting on a Claude Code dialog: Resume this conversation?")


def test_words_for_a_pane_in_a_dialog_are_held_even_before_a_look_has_seen_it(
    app: FastAPI, client: TestClient, auth: dict[str, str], tmux: FakeTmux
) -> None:
    pane = tmux.add_pane("default", "work", "claude")
    pane.screen = screens.IDLE_BOX
    app.state.monitor.tick()
    sid = client.get("/v1/sessions", headers=auth).json()[0]["id"]
    url = f"/v1/sessions/{sid}/input"
    pane.screen = screens.DIALOG_TEACH_AUTO_MODE  # up right after the turn: no look has seen it yet
    assert client.post(url, json={"text": "also do X", "enter": True}, headers=auth).status_code == 202
    app.state.monitor.tick()
    assert pane.sent == []  # its spaces would have ticked a choice, its Enter picked one
    assert client.post(url, json={"key": "Escape"}, headers=auth).status_code == 204  # the owner answers it
    pane.sent.clear()
    pane.screen = screens.IDLE_BOX
    app.state.monitor.tick()
    assert pane.sent == [("text", "also do X"), ("key", "Enter")]


def test_a_task_waits_while_its_receiver_shows_a_dialog(
    make_app: Callable[..., FastAPI], tmux: FakeTmux, tmp_path: Path
) -> None:
    app = make_app()
    client = TestClient(app)
    lead = app.state.sessions.create(CreateSession(runtime="claude", cwd=str(tmp_path), name="lead"))
    worker = app.state.sessions.create(CreateSession(runtime="claude", cwd=str(tmp_path), name="worker"))

    def pane_of(session: Any) -> Any:
        return next(p for p in tmux.panes.values() if p.info.session_name == session.tmux_session)

    def sent() -> list[str]:
        return [text for kind, text in pane_of(lead).sent if kind in ("text", "paste")]

    pane_of(lead).screen = screens.IDLE_BOX
    pane_of(worker).screen = screens.IDLE_BOX
    app.state.monitor.tick()
    pane_of(lead).screen = screens.DIALOG_TEACH_AUTO_MODE  # came up since the last look
    token = str(pane_of(worker).env["MUXTOWER_MCP_TOKEN"])
    _tool(client, token, "send_task", to=lead.id, text="Report the test results.")
    app.state.team_tasks.deliver()
    assert sent() == []
    app.state.monitor.tick()
    assert app.state.directory.get(lead.id).state == AgentState.NEEDS_ANSWER
    app.state.team_tasks.deliver()
    assert sent() == []  # still showing: still waiting
    pane_of(lead).screen = screens.IDLE_BOX
    app.state.monitor.tick()
    app.state.team_tasks.deliver()
    assert [t.split("] ", 1)[1] for t in sent()] == ["Report the test results."]
