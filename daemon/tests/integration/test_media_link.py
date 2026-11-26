"""A node's session's images and videos reach the app through its hub, pulled over the link in pieces of at most
700 KB, so no frame is large and the link's pings keep getting through."""

import base64
from pathlib import Path
from typing import Any

import httpx
import pytest
from fastapi import FastAPI

from muxtower.nodes.shared import READ_BYTES
from tests.integration.test_node_link import Running, _free_port, _until, hub  # noqa: F401 - fixture
from tests.media_fakes import MP4, PNG, image_block, said, session_app, text, tool_result, tool_use


def test_a_nodes_image_and_video_arrive_through_the_hub_in_pieces(
    hub: tuple[FastAPI, str],  # noqa: F811 - the fixture
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch,
) -> None:  # fmt: skip
    hub_app, hub_url = hub
    _, token = hub_app.state.tokens.create("phone")
    phone = httpx.Client(base_url=hub_url, headers={"Authorization": f"Bearer {token}"}, timeout=20)
    work = tmp_path / "work"
    work.mkdir()
    (work / "clip.mp4").write_bytes(MP4)
    transcript = (
        said("user", text("record it"))
        + said("assistant", text("Recorded ./clip.mp4"), tool_use("t1", "mcp__browser__screenshot", {}))
        + said("user", tool_result("t1", image_block(PNG)))
    )  # fmt: skip
    node = session_app(tmp_path, transcript, work, name="mac", port=_free_port())
    asked: list[dict[str, Any]] = []
    answered: list[int] = []
    source = type(hub_app.state.node_sessions)
    original = source.media_step

    def counted(self: Any, session_id: str, params: dict[str, Any]) -> Any:
        asked.append(params)
        found = original(self, session_id, params)
        if "data" in found:
            answered.append(len(base64.b64decode(found["data"])))
        return found

    monkeypatch.setattr(source, "media_step", counted)
    link = Running(node.state.hub.run_loop())
    try:
        code = hub_app.state.pairing.create_code("phone").code
        assert node.state.hub.join(hub_url, code).name == "mac"

        def listed() -> dict[str, Any] | None:
            return next((s for s in phone.get("/v1/sessions").json() if s.get("node") == "mac"), None)

        sid = _until(listed)["id"]
        items = phone.get(f"/v1/sessions/{sid}/conversation").json()["items"]
        reply, tool = items[-2], items[-1]
        assert reply["media"][0]["path"] == "./clip.mp4" and reply["media"][0]["kind"] == "video"

        got = phone.get(f"/v1/sessions/{sid}/media", params={"path": "./clip.mp4"})
        assert got.status_code == 200 and got.content == MP4 and got.headers["content-type"] == "video/mp4"
        assert answered and max(answered) <= READ_BYTES and len(answered) >= len(MP4) // READ_BYTES
        part = phone.get(f"/v1/sessions/{sid}/media", params={"path": "./clip.mp4"}, headers={"Range": "bytes=10-19"})
        assert part.status_code == 206 and part.content == MP4[10:20]

        inline = phone.get(f"/v1/sessions/{sid}/items/{tool['seq']}/media/0")
        assert inline.status_code == 200 and inline.content == PNG
        assert phone.get(f"/v1/sessions/{sid}/media", params={"path": "/etc/hostname"}).status_code == 404
        assert all(p.get("length", 0) <= READ_BYTES for p in asked)
    finally:
        link.stop()
        phone.close()
