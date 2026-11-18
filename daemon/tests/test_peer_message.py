"""Claude Code's dialog for a message from another session, held for the owner: Deliver or Deny."""

from fastapi import FastAPI
from fastapi.testclient import TestClient

from tests import screens
from tests.fakes import FakeTmux


def test_a_held_message_from_another_session_is_its_own_prompt_with_no_default(
    app: FastAPI, client: TestClient, auth: dict[str, str], tmux: FakeTmux
) -> None:
    pane = tmux.add_pane("default", "work", "claude")
    pane.screen = screens.PEER_MESSAGE
    app.state.monitor.tick()
    session = client.get("/v1/sessions", headers=auth).json()[0]
    pending = session["pending"]
    assert session["state"] == "needs_permission"
    assert pending["kind"] == "peer_message" and pending["sender"] == "builder-7"
    assert pending["detail"] == "Please rerun the lint step\nand tell me what fails."
    labels = [o["label"] for o in pending["options"]]
    assert labels == ["Deny — drop it and tell the sender it was declined", "Deliver this message to Claude"]
    url = f"/v1/sessions/{session['id']}/approve"
    res = client.post(url, headers=auth, json={})  # no default: nothing is delivered by accident
    assert res.status_code == 409 and pane.sent == []
    deliver = next(o["key"] for o in pending["options"] if o["label"].startswith("Deliver"))
    assert client.post(url, headers=auth, json={"option": deliver}).status_code == 200
    assert pane.sent[-1] == ("key", "Enter") and ("key", "Down") in pane.sent  # moved to it, then chosen


def test_a_reply_quoting_that_dialog_is_no_dialog(
    app: FastAPI, client: TestClient, auth: dict[str, str], tmux: FakeTmux
) -> None:
    pane = tmux.add_pane("default", "work", "claude")
    pane.screen = screens.PEER_MESSAGE + "\n● That was the held-message dialog.\n\n" + screens.IDLE
    app.state.monitor.tick()
    assert client.get("/v1/sessions", headers=auth).json()[0]["state"] != "needs_permission"
