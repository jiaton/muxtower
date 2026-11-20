"""A file attached to a message to a node's session: uploaded to the hub, saved on the node (by the node's own
limit), named in the message by its id and pasted into the node's pane. A hub served by uvicorn and a node on
its own event loop (`test_node_link.py`); made-up files."""

from pathlib import Path
from typing import Any

import httpx
import pytest
from fastapi import FastAPI

from muxtower.app import create_app
from muxtower.attachments.models import FILENAME_HEADER
from muxtower.nodes import attachments as node_attachments
from muxtower.terminal import service as terminal_service
from tests.fakes import FakeTmux
from tests.integration.test_node_link import Running, _free_port, _settings, _until, hub  # noqa: F401


def test_a_node_s_session_gets_its_files_saved_on_the_node(
    hub: tuple[FastAPI, str],  # noqa: F811
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(terminal_service, "PASTE_SECONDS", 0)
    monkeypatch.setattr(node_attachments, "CHUNK_BYTES", 64)  # several appends over the link
    hub_app, hub_url = hub
    _, token = hub_app.state.tokens.create("phone")
    phone = httpx.Client(base_url=hub_url, headers={"Authorization": f"Bearer {token}"}, timeout=10)
    node_tmux = FakeTmux()
    node = create_app(_settings(tmp_path, "mac", _free_port()), tmux=node_tmux, run_loops=False)
    pane = node_tmux.add_pane("default", "work", "claude")
    node.state.monitor.tick()
    link = Running(node.state.hub.run_loop())
    try:
        code = hub_app.state.pairing.create_code("phone").code
        node.state.hub.join(hub_url, code)

        def listed() -> dict[str, Any] | None:
            return next((s for s in phone.get("/v1/sessions").json() if s.get("node") == "mac"), None)

        sid = _until(listed)["id"]
        body = b"made-up notes, line after line\n" * 20

        def upload(content: Any) -> httpx.Response:
            headers = {FILENAME_HEADER: "..%2F..%2Fnotes.txt", "Content-Type": "text/plain"}
            return phone.post(f"/v1/sessions/{sid}/attachments", content=content, headers=headers)

        answer = upload(body)
        assert answer.status_code == 201, answer.text
        found = answer.json()
        saved = Path(found["path"])
        assert saved.is_relative_to(tmp_path / "mac" / "attachments")  # the node's state, not the hub's
        assert saved.read_bytes() == body and found["name"] == f"{found['id']}-notes.txt"
        assert not (tmp_path / "nas" / "attachments").exists()

        message = {"text": "summarise it", "enter": True, "attachments": [found["id"]]}
        assert phone.post(f"/v1/sessions/{sid}/input", json=message).status_code == 204
        assert ("paste", f"{saved} ") in pane.sent and ("text", "summarise it") in pane.sent

        # The node's own limit applies, and nothing is left there.
        node.state.terminal.attachments.max_bytes = lambda: 100
        assert upload(body).status_code == 413  # said up front (Content-Length)

        def streamed() -> Any:  # no length said: stopped as it passes the limit there
            yield from (body[i : i + 50] for i in range(0, len(body), 50))

        assert upload(streamed()).status_code == 413
        assert [p.name for p in saved.parent.iterdir()] == [saved.name]
        unknown = {"text": "x", "attachments": ["0123abcd"]}
        assert phone.post(f"/v1/sessions/{sid}/input", json=unknown).status_code == 409
    finally:
        link.stop()
