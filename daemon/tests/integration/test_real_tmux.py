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
        assert width() == "50"  # no terminal attached to fit: the last size stays (see below)
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


def test_release_gives_the_window_its_automatic_size_back() -> None:
    from muxtower.infra.tmux import TmuxCli
    from muxtower.terminal.ports import PaneRef

    socket = f"mxt-test-{uuid.uuid4().hex[:8]}"
    tmux = TmuxCli()
    try:
        pane = PaneRef(socket, tmux.new_session(socket, "fit", "/", ["sh"], {}, 120, 40).pane_id)
        tmux.resize(pane, 48, 30)
        tmux.release_size(pane)
        option = subprocess.run(
            ["tmux", "-L", socket, "show-options", "-w", "-t", pane.pane_id, "window-size"],
            capture_output=True, text=True, check=True,
        ).stdout.strip()  # fmt: skip
        assert option == ""  # not pinned to manual: an attaching terminal sizes it again
    finally:
        subprocess.run(["tmux", "-L", socket, "kill-server"], check=False)


def test_a_narrowed_pane_shows_no_line_wider_than_itself() -> None:
    from muxtower.infra.tmux import TmuxCli
    from muxtower.terminal.ports import PaneRef

    socket = f"mxt-test-{uuid.uuid4().hex[:8]}"
    tmux = TmuxCli()
    try:
        script = "printf '%080d\\n' 0 | tr 0 x; sleep 30"  # a line as wide as the pane, like a rule of ─
        pane = PaneRef(socket, tmux.new_session(socket, "fit", "/", ["sh", "-c", script], {}, 80, 10).pane_id)
        time.sleep(0.5)
        tmux.resize(pane, 50, 10)  # a phone fits it: tmux rewraps the line in two
        time.sleep(0.3)
        shown = tmux.capture(pane, ansi=True, history=20) or ""
        assert max(len(line) for line in shown.split("\n")) <= 50
        assert "x" * 80 in (tmux.capture(pane, history=20) or "")  # screen rules still see it whole
    finally:
        subprocess.run(["tmux", "-L", socket, "kill-server"], check=False)


def test_an_agent_is_not_launched_as_another_claude_session_s_child(tmp_path: Path) -> None:
    """A daemon started from inside a Claude Code session, on a tmux server started from one too."""
    from muxtower.infra.tmux import TmuxCli

    socket = f"mxt-test-{uuid.uuid4().hex[:8]}"
    marked = {**os.environ, "CLAUDE_CODE_CHILD_SESSION": "1", "CLAUDE_CODE_BRIDGE_SESSION_ID": "x"}
    subprocess.run(["tmux", "-L", socket, "new-session", "-d", "-s", "first"], env=marked, check=True)
    try:
        out = tmp_path / "env.txt"
        TmuxCli().new_session(
            socket, "agent", str(tmp_path), ["sh", "-c", f"env > {out}"], {"KEPT": "1"}, 80, 24
        )  # fmt: skip
        deadline = time.monotonic() + 5
        while not out.exists() or "KEPT" not in out.read_text():
            assert time.monotonic() < deadline, "the agent never ran"
            time.sleep(0.1)
        seen = out.read_text()
        assert "CLAUDE_CODE_CHILD_SESSION" not in seen and "CLAUDE_CODE_BRIDGE_SESSION_ID" not in seen
        assert "KEPT=1" in seen
    finally:
        subprocess.run(["tmux", "-L", socket, "kill-server"], check=False)


def test_a_pasted_message_arrives_whole(tmp_path: Path) -> None:
    from muxtower.infra.tmux import TmuxCli
    from muxtower.terminal.ports import PaneRef

    socket = f"mxt-test-{uuid.uuid4().hex[:8]}"
    out = tmp_path / "out.txt"
    tmux = TmuxCli()
    pane = tmux.new_session(socket, "cat", str(tmp_path), ["sh", "-c", f"stty raw -echo; cat > {out}"], {}, 80, 24)
    try:
        time.sleep(0.3)
        text = "\n".join(f"[11:{i:02d}] Them: line {i}, with some words to make it long enough" for i in range(57))
        tmux.paste(PaneRef(socket=socket, pane_id=pane.pane_id), text)
        deadline = time.monotonic() + 5
        while not out.exists() or len(out.read_bytes()) < len(text):
            assert time.monotonic() < deadline, "the paste never arrived"
            time.sleep(0.1)
        assert out.read_text().replace("\r", "\n") == text  # all ~4 KB, nothing dropped
    finally:
        subprocess.run(["tmux", "-L", socket, "kill-server"], check=False)


def test_giving_the_size_back_with_no_terminal_attached_keeps_it(tmp_path: Path) -> None:
    """Not tmux's default 80x24: the agent would redraw narrow for whoever opens it next."""
    from muxtower.infra.tmux import TmuxCli

    socket = f"mxt-test-{uuid.uuid4().hex[:8]}"
    tmux = TmuxCli()
    pane = tmux.new_session(socket, "agent", str(tmp_path), ["sleep", "30"], {}, 80, 24)
    try:
        tmux.resize(pane, 220, 50)
        tmux.release_size(pane)
        size = subprocess.run(
            ["tmux", "-L", socket, "display-message", "-p", "-t", pane.pane_id, "#{pane_width}x#{pane_height}"],
            capture_output=True, text=True, check=True,
        ).stdout.strip()  # fmt: skip
        window_size = subprocess.run(
            ["tmux", "-L", socket, "show-options", "-w", "-t", pane.pane_id, "window-size"],
            capture_output=True, text=True, check=False,
        ).stdout.strip()  # fmt: skip
        assert size == "220x50" and window_size == ""  # kept, and no longer pinned
    finally:
        subprocess.run(["tmux", "-L", socket, "kill-server"], check=False)
