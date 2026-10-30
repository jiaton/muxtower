"""Images sent with a message: pasted into a terminal as the paths of files saved here, sent inside the
message over Remote Control, refused where a session takes none."""

import base64
import stat
import threading
from pathlib import Path
from typing import Any

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from muxtower.sources.remote_control.adapter import AnthropicRemoteControl
from muxtower.terminal import service as terminal_service
from muxtower.terminal.models import ImageInput
from tests.fakes import FakeTmux

PNG = b"\x89PNG\r\n\x1a\n" + b"\0" * 32
IMAGE = {"media_type": "image/png", "data": base64.b64encode(PNG).decode()}


def test_a_terminal_gets_the_saved_images_pasted_ahead_of_the_words(
    app: FastAPI, client: TestClient, auth: dict[str, str], tmux: FakeTmux, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(terminal_service, "PASTE_SECONDS", 0)
    pane = tmux.add_pane("default", "work", "claude")
    app.state.monitor.tick()
    session = client.get("/v1/sessions", headers=auth).json()[0]
    assert session["capabilities"]["images"]
    body = {"text": "what is this?", "enter": True, "images": [IMAGE, IMAGE]}
    assert client.post(f"/v1/sessions/{session['id']}/input", json=body, headers=auth).status_code == 204
    (kind, path), (kind2, _), *rest = pane.sent
    assert (kind, kind2) == ("paste", "paste") and rest == [("text", "what is this?"), ("key", "Enter")]
    saved = Path(path)
    assert saved.read_bytes() == PNG and saved.suffix == ".png" and stat.S_IMODE(saved.stat().st_mode) == 0o600

    pane.sent.clear()  # just a picture
    assert client.post(f"/v1/sessions/{session['id']}/input", json={"text": "", "enter": True, "images": [IMAGE]},
                       headers=auth).status_code == 204  # fmt: skip
    assert [k for k, _ in pane.sent] == ["paste", "key"]
    bad = {"text": "x", "images": [{"media_type": "image/svg+xml", "data": "PHN2Zz4="}]}
    assert client.post(f"/v1/sessions/{session['id']}/input", json=bad, headers=auth).status_code == 422
    alone = {"key": "Enter", "images": [IMAGE]}
    assert client.post(f"/v1/sessions/{session['id']}/input", json=alone, headers=auth).status_code == 422


def test_remote_control_gets_the_images_inside_the_message() -> None:
    sent: list[Any] = []

    class Client:
        def send_events(self, session_id: str, events: list[dict[str, Any]]) -> None:
            sent.append((session_id, events))

    adapter = AnthropicRemoteControl.__new__(AnthropicRemoteControl)
    adapter._client, adapter._lock = Client(), threading.Lock()  # type: ignore[assignment]
    adapter.send_message("cse_1", "what is this?", [ImageInput.model_validate(IMAGE)])
    ((sid, (event,)),) = sent
    content = event["message"]["content"]
    assert sid == "cse_1" and [b["type"] for b in content] == ["image", "text"]
    assert content[0]["source"] == {"type": "base64", **IMAGE} and content[1]["text"] == "what is this?"
