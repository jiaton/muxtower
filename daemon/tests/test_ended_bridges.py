"""A muxtower session's Remote Control session follows it: once the session has ended (stopped, archived),
its bridge is archived too instead of staying listed on its own, "No environment" (made-up ids)."""

import json
import os
from pathlib import Path
from types import SimpleNamespace

from muxtower.infra.db import Database
from muxtower.sessions.claude_processes import ClaudeProcesses
from muxtower.sessions.ended_bridges import EndedBridges, ended
from muxtower.sessions.models import SessionSource
from muxtower.sessions.repository import SqliteSessionRepository
from tests.test_notify_text import session


def bridge(sid: str, machine: str | None = None, offline: bool = False):  # type: ignore[no-untyped-def]
    return session(id=sid, source=SessionSource.REMOTE_CONTROL, machine=machine, offline=offline)


def test_a_stopped_merged_sessions_bridge_is_archived_and_a_live_ones_is_not() -> None:
    listed = [session(id="abcd1234ef56"), bridge("cse_A"), bridge("cse_B"), bridge("cse_running", machine="nas")]
    owners = {"cse_A": "aaaa11112222", "cse_B": "abcd1234ef56", "cse_running": "bbbb11112222"}
    # cse_A's session is gone (stopped); cse_B's is live (a former bridge, folded in); cse_running runs.
    assert ended(listed, owners, {}, {}) == ["cse_A"]
    # Shown where it last ran (offline), it is still a bridge with no process.
    assert ended([bridge("cse_A", machine="nas", offline=True)], owners, {}, {}) == ["cse_A"]


def test_a_bridge_known_only_by_the_process_file_left_for_it_here_or_on_a_node() -> None:
    listed = [session(id="feed0000beef"), session(id="mac~0badc0de1234"), bridge("cse_here"), bridge("cse_mac"),
              bridge("cse_mac_live"), bridge("cse_live_here")]  # fmt: skip
    here = {"cse_here": "abcd1234", "cse_live_here": "feed0000"}  # mxt-<first 8> of the tmux session it ran in
    nodes = {"mac": {"cse_mac": "5ca1ab1e", "cse_mac_live": "0badc0de"}}
    assert sorted(ended(listed, {}, here, nodes)) == ["cse_here", "cse_mac"]


def test_a_nodes_session_is_judged_only_while_its_node_is_online() -> None:
    owners = {"cse_m": "mac~0badc0de1234"}
    assert ended([bridge("cse_m")], owners, {}, {}, online=set()) == []  # its list not in yet (a hub restart)
    assert ended([bridge("cse_m")], owners, {}, {}, online={"mac"}) == ["cse_m"]


def test_stopping_a_session_keeps_its_bridges_its_over_a_restart(tmp_path: Path) -> None:
    db = Database(tmp_path / "m.db")
    db.migrate()
    repo = SqliteSessionRepository(db)
    repo.note_remote_ids("abcd1234ef56", ["cse_now", "cse_before"])
    repo.delete("abcd1234ef56")  # stopped
    again = SqliteSessionRepository(Database(tmp_path / "m.db"))  # the daemon restarted
    assert again.remote_ids() == {"cse_now": "abcd1234ef56", "cse_before": "abcd1234ef56"}


def test_the_reconciler_archives_them_through_the_archiver() -> None:
    archived: list[str] = []
    listed = [bridge("cse_A")]
    directory = SimpleNamespace(
        list=lambda: listed, local=SimpleNamespace(repo=SimpleNamespace(remote_ids=lambda: {"cse_A": "gone"}))
    )
    archiver = SimpleNamespace(archive=archived.append)
    assert EndedBridges(directory, archiver, dict).tick() == ["cse_A"]  # type: ignore[arg-type]
    assert archived == ["cse_A"]


def test_process_files_name_the_bridges_of_muxtowers_ended_tmux_sessions(tmp_path: Path) -> None:
    sessions = tmp_path / "sessions"
    sessions.mkdir()
    files = {
        "99999991": {"bridgeSessionId": "session_GONE", "tmux": "mxt-abcd1234:@8.%8", "kind": "interactive"},
        "99999992": {"bridgeSessionId": "session_WORKER", "tmux": "mxt-abcd1234:@8.%8", "kind": "bg"},
        "99999993": {"bridgeSessionId": "session_ELSE", "tmux": "main:@1.%1", "kind": "interactive"},
        str(os.getpid()): {"bridgeSessionId": "session_LIVE", "tmux": "mxt-feed0000:@1.%1", "kind": "interactive"},
    }
    for pid, info in files.items():
        (sessions / f"{pid}.json").write_text(json.dumps({"pid": int(pid), **info}))
    assert ClaudeProcesses(tmp_path).ended_bridges() == {"cse_GONE": "abcd1234"}


def test_a_remote_control_session_with_no_environment_shows_where_it_last_ran() -> None:
    from muxtower.sources.remote_control.service import RemoteControlSource

    kept: dict[str, tuple[str, str]] = {}
    store = SimpleNamespace(load=lambda: dict(kept), save=lambda sid, m, c: kept.__setitem__(sid, (m, c)))
    source = RemoteControlSource(SimpleNamespace(), {})  # type: ignore[arg-type]
    source.places = store  # type: ignore[assignment]
    running = session(id="cse_x", source=SessionSource.REMOTE_CONTROL, machine="mac", cwd="/Users/me/site")
    assert source._placed(running) == running
    assert kept == {"cse_x": ("mac", "/Users/me/site")}
    gone = source._placed(session(id="cse_x", source=SessionSource.REMOTE_CONTROL, machine=None, cwd=""))
    assert (gone.machine, gone.cwd, gone.offline) == ("mac", "/Users/me/site", True)
    unknown = source._placed(session(id="cse_y", source=SessionSource.REMOTE_CONTROL, machine=None, cwd=""))
    assert unknown.machine is None  # never seen running: nothing to say
