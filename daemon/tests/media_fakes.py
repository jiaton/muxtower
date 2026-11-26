"""Made-up pictures and videos, and a session whose transcript shows them (`sessions/media_reading.py`)."""

import base64
import dataclasses
import json
from pathlib import Path
from typing import Any

from fastapi import FastAPI
from fastapi.testclient import TestClient

from muxtower.app import create_app
from muxtower.config import load_settings
from muxtower.sessions.monitor import Monitor
from tests.fakes import FakeTmux
from tests.test_linking import FakeProcesses

PNG = b"\x89PNG\r\n\x1a\n" + b"made-up picture" * 4
MP4 = b"\x00\x00\x00\x18ftypisom\x00\x00\x02\x00isomiso2" + bytes(range(256)) * 8192  # about 2 MB
WEBM = b"\x1a\x45\xdf\xa3\x9f\x42\x86\x81\x01\x42\x82\x84webm" + b"\x00" * 64


def said(kind: str, *content: dict[str, Any]) -> str:
    return json.dumps({"type": kind, "message": {"role": kind, "content": list(content)}}) + "\n"


def text(value: str) -> dict[str, Any]:
    return {"type": "text", "text": value}


def tool_use(tool_id: str, name: str, tool_input: dict[str, Any]) -> dict[str, Any]:
    return {"type": "tool_use", "id": tool_id, "name": name, "input": tool_input}


def tool_result(tool_id: str, *content: dict[str, Any]) -> dict[str, Any]:
    return {"type": "tool_result", "tool_use_id": tool_id, "content": list(content)}


def image_block(data: bytes, media_type: str = "image/png") -> dict[str, Any]:
    return {
        "type": "image",
        "source": {"type": "base64", "media_type": media_type, "data": base64.b64encode(data).decode()},
    }


def session_app(root: Path, transcript: str, folder: Path, name: str = "box", port: int | None = None) -> FastAPI:
    """An app with one Claude Code pane in `folder`, whose transcript is `transcript`."""
    path = root / f"{name}.jsonl"
    path.write_text(transcript)
    tmux = FakeTmux()
    pane = tmux.add_pane("default", "work", "claude", cwd=str(folder))
    pane.info = dataclasses.replace(pane.info, pid=4242)
    overrides: dict[str, Any] = {"state_dir": root / f"{name}-s", "config_dir": root / f"{name}-c", "serve_ui": False}
    if port is not None:
        overrides |= {"name": name, "port": port}
    settings = load_settings(config_file=root / "none.toml", env={}, overrides=overrides)
    app = create_app(settings, tmux=tmux, run_loops=False)
    Monitor(app.state.sessions, FakeProcesses({}, {4242: str(path)})).tick()
    return app


def phone(app: FastAPI) -> TestClient:
    _, token = app.state.tokens.create("phone")
    return TestClient(app, headers={"Authorization": f"Bearer {token}"})
