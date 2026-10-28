"""The MCP tools keep a session's device, what reaches it and its harness apart, and never take a
session nobody places for the hub's."""

from datetime import UTC, datetime

from muxtower.mcp.describe import line
from muxtower.sessions.ports import SessionSource
from tests.test_notify_text import session

RC = SessionSource.REMOTE_CONTROL


def test_each_line_says_device_reach_and_harness_apart() -> None:
    tmux = session(id="a1", machine="nas", origin="claude_code_cli", remote_id="cse_1")
    assert line(tmux, "nas").startswith(
        "a1 · web · @nas · Claude Code (CLI) · via muxtower on nas: found in tmux, also Remote Control · "
        "in /home/me/projects/web · idle · "
    )
    on_node = session(id="mac~b2", machine="mac", node="mac", source=SessionSource.LAUNCHED, runtime="codex")
    assert "· @mac · Codex · via muxtower on mac: started in tmux ·" in line(on_node, "nas")
    headless = session(id="c3", source=SessionSource.CODEX, runtime="codex", origin="codex_app_server")
    assert "· Codex (headless) · via muxtower on nas: headless ·" in line(headless, "nas")
    desktop = session(id="cse_4", machine="mac", source=RC, origin="claude_desktop", cwd="/Users/me/x")
    assert "· @mac · Claude Code (desktop app) · via the Claude account's Remote Control · in /Users/me/x ·" in line(
        desktop, "nas"
    )


def test_a_session_nobody_places_is_on_an_unknown_device() -> None:
    nowhere = session(id="cse_5", machine=None, source=RC, origin="claude_desktop", cwd="")
    said = line(nowhere, "nas")
    assert "@unknown device · " in said and "folder unknown" in said and "@nas" not in said
    by_folder = session(id="cse_6", machine=None, source=RC, cwd="/Users/me/y")
    assert "@unknown device (a Mac, by its folder) · " in line(by_folder, "nas")
    archived = session(id="cse_7", machine=None, source=RC, archived_at=datetime.now(UTC))
    assert "· idle archived ·" in line(archived, "nas")


def test_a_side_chat_and_a_fork_say_where_they_came_from() -> None:
    side = session(id="cse_8", machine="mac", source=RC, fork_of="cse_7", side_chat=True, cwd="/Users/me/x")
    assert "· in /Users/me/x · side chat of cse_7 ·" in line(side, "nas")
    assert "· fork of cse_7 ·" in line(session(id="cse_9", source=RC, fork_of="cse_7"), "nas")
