"""Claude Code's suggested next prompt, faint in its empty input line: read, and sent as it is (→, Enter)."""

import re

from fastapi import FastAPI
from fastapi.testclient import TestClient

from muxtower.runtimes.spec import Runtime, load_runtimes
from tests import screens
from tests.fakes import FakeTmux

PLAIN = re.compile(r"\x1b\[[0-9;]*m")


def test_the_suggestion_is_the_faint_text_of_the_empty_input_line() -> None:
    claude: Runtime = load_runtimes(None)["claude-code"]
    assert claude.suggestion_line_of(PLAIN.sub("", screens.SUGGESTION_ANSI)) == "yes, open it"
    assert claude.suggestion_of(screens.SUGGESTION_ANSI) == "yes, open it"
    assert claude.suggestion_of(screens.TYPED_ANSI) is None  # typed there: drawn plain, no suggestion
    assert claude.suggestion_of(screens.SUGGESTION_ANSI.replace("yes, open it", "")) is None


def test_it_is_listed_and_sent_as_it_is_once_read_again(
    app: FastAPI, client: TestClient, auth: dict[str, str], tmux: FakeTmux
) -> None:
    pane = tmux.add_pane("default", "work", "claude")
    pane.screen = PLAIN.sub("", screens.SUGGESTION_ANSI)
    pane.ansi = screens.SUGGESTION_ANSI
    app.state.monitor.tick()
    session = client.get("/v1/sessions", headers=auth).json()[0]
    assert session["suggestion"] == "yes, open it"
    url = f"/v1/sessions/{session['id']}/suggestion"
    assert client.post(url, headers=auth, json={"text": "something else"}).status_code == 409
    assert pane.sent == []
    assert client.post(url, headers=auth, json={"text": "yes, open it"}).status_code == 204
    assert pane.sent == [("key", "Right"), ("key", "Enter")]

    pane.sent.clear()  # the same words typed since (drawn plain): read again on sending, nothing sent
    pane.screen, pane.ansi = PLAIN.sub("", screens.TYPED_ANSI), screens.TYPED_ANSI
    assert client.post(url, headers=auth, json={"text": "yes, open it"}).status_code == 409
    assert pane.sent == []
    typed = screens.TYPED_ANSI.replace("yes, open it", "no, wait")  # other words typed: listed as none
    pane.screen, pane.ansi = PLAIN.sub("", typed), typed
    app.state.monitor.tick()
    assert client.get("/v1/sessions", headers=auth).json()[0]["suggestion"] is None

    pane.screen, pane.ansi = screens.PERMISSION, screens.PERMISSION  # a dialog: none
    app.state.monitor.tick()
    assert client.get("/v1/sessions", headers=auth).json()[0]["suggestion"] is None
