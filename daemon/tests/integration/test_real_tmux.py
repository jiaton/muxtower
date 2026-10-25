"""Runs against a real tmux server on a throwaway socket. Skipped where tmux is not installed."""

import os
import shutil
import subprocess
import time
import uuid
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from muxtower.app import create_app
from muxtower.config import load_settings

# ruff: noqa: S603, S607 - tests call the tmux on PATH with fixed argv
pytestmark = pytest.mark.skipif(shutil.which("tmux") is None, reason="tmux not installed")


def test_launch_type_capture_terminate(tmp_path: Path) -> None:
    socket = f"mxt-test-{uuid.uuid4().hex[:8]}"
    runtimes = tmp_path / "config" / "runtimes"
    runtimes.mkdir(parents=True)
    (runtimes / "shell.toml").write_text('name = "shell"\nbinary = "sh"\n')
    settings = load_settings(
        config_file=tmp_path / "none.toml",
        env={},
        overrides={
            "state_dir": tmp_path / "state",
            "config_dir": tmp_path / "config",
            "tmux_socket": socket,
            "adopt_sockets": [],
            "serve_ui": False,
        },
    )
    app = create_app(settings, run_loops=False)
    client = TestClient(app)
    _, token = app.state.tokens.create("test")
    auth = {"Authorization": f"Bearer {token}"}
    try:
        session = client.post("/v1/sessions", json={"runtime": "shell", "cwd": str(tmp_path)}, headers=auth).json()
        sid = session["id"]
        client.post(f"/v1/sessions/{sid}/input", json={"text": "echo mux-$((40+2))", "enter": True}, headers=auth)
        deadline = time.monotonic() + 5
        while "mux-42" not in client.get(f"/v1/sessions/{sid}/screen", headers=auth).json()["text"]:
            assert time.monotonic() < deadline, "typed command never showed up"
            time.sleep(0.1)
        app.state.monitor.tick()
        assert client.get(f"/v1/sessions/{sid}", headers=auth).json()["state"] == "unknown"

        def width() -> str:
            argv = ["tmux", "-L", socket, "display", "-p", "-t", session["tmux_pane"], "#{window_width}"]
            out = subprocess.run(argv, capture_output=True, text=True)  # noqa: S603
            return out.stdout.strip()

        client.post(f"/v1/sessions/{sid}/resize", json={"cols": 50, "rows": 10}, headers=auth)
        assert width() == "50"
        client.post(f"/v1/sessions/{sid}/resize/release", headers=auth)
        assert width() == "120"  # back to the session's own size
        assert client.delete(f"/v1/sessions/{sid}", headers=auth).status_code == 204
        app.state.monitor.tick()
        assert client.get("/v1/sessions", headers=auth).json() == []
    finally:
        subprocess.run(["tmux", "-L", socket, "kill-server"], capture_output=True)  # noqa: S603, S607
        # kill-server can leave the socket file behind; remove it so test runs don't pile them up.
        tmpdir = Path(os.environ.get("TMUX_TMPDIR", "/tmp")) / f"tmux-{os.getuid()}"  # noqa: S108
        (tmpdir / socket).unlink(missing_ok=True)


def test_resize_fits_the_pane_even_in_a_split_window() -> None:
    from muxtower.infra.tmux import TmuxCli
    from muxtower.terminal.ports import PaneRef

    socket = f"mxt-test-{uuid.uuid4().hex[:8]}"
    tmux = TmuxCli()
    try:
        pane = tmux.new_session(socket, "split", "/", ["sh"], {}, 120, 40)
        subprocess.run(["tmux", "-L", socket, "split-window", "-h", "-t", pane.pane_id, "sh"], check=True)
        tmux.resize(PaneRef(socket, pane.pane_id), 48, 30)
        size = subprocess.run(
            ["tmux", "-L", socket, "display-message", "-p", "-t", pane.pane_id, "#{pane_width}x#{pane_height}"],
            capture_output=True, text=True, check=True,
        ).stdout.strip()  # fmt: skip
        assert size == "48x30"
    finally:
        subprocess.run(["tmux", "-L", socket, "kill-server"], check=False)
