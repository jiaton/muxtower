import json
import os
import sqlite3
from contextlib import closing
from pathlib import Path
from typing import Any

import pytest

from muxtower.agents.codex import processes
from muxtower.agents.codex.processes import CodexProcesses
from muxtower.agents.codex.rollout import RolloutBuilder
from muxtower.agents.processes import AgentProcesses
from muxtower.sessions.claude_processes import ClaudeProcesses
from muxtower.sessions.transcripts import Transcripts

THREAD = "01a17a59-dab8-7653-8913-a86ab262d3c2"


def rec(kind: str, **payload: object) -> str:
    return json.dumps({"timestamp": "2026-10-26T22:34:40Z", "type": kind, "payload": payload}) + "\n"


FAILED_OUTPUT = {"type": "input_text", "text": "Script failed\nExit code: 1"}
SCRIPT = 'const r = await tools.exec_command({"cmd":"pytest -q","yield_time_ms":1000}); text(r.output)'
ROLLOUT = (
    rec("session_meta", id=THREAD, cwd="/srv/web", originator="codex_tui")
    + rec("event_msg", type="task_started", turn_id="t1")
    + rec("response_item", type="message", role="developer", content=[{"type": "input_text", "text": "<rules>"}])
    + rec("event_msg", type="user_message", message="run the tests")
    + rec("event_msg", type="agent_message", message="Running them now.", phase="commentary")
    + rec("response_item", type="custom_tool_call", name="exec", call_id="c1", status="completed", input=SCRIPT)
    + rec("response_item", type="function_call", name="apply_patch", call_id="c2", arguments='{"path": "a.py"}')
    + rec("response_item", type="custom_tool_call_output", call_id="c1", output=[FAILED_OUTPUT])
    + rec("response_item", type="function_call_output", call_id="c2", output="ok")
    + rec("event_msg", type="agent_message", message="One test fails.", phase="final_answer")
    + rec("event_msg", type="task_complete", turn_id="t1", last_agent_message="One test fails.")
)  # fmt: skip


def test_a_rollout_reads_as_prompts_replies_tool_runs_and_results() -> None:
    builder = RolloutBuilder()
    builder.feed_lines(ROLLOUT.encode().split(b"\n"))
    shown = [(i.kind.value, i.tool_name, i.status and i.status.value, i.text) for i in builder.after(0, 50)]
    assert shown == [
        ("prompt", None, None, "run the tests"),  # the developer instructions are not the conversation
        ("reply", None, None, "Running them now."),
        ("tool", "exec_command", "error", "pytest -q"),  # code mode: named by the tool its script calls
        ("tool", "apply_patch", "done", "a.py"),
        ("reply", None, None, "One test fails."),
        ("result", None, "done", None),
    ]
    assert builder.last_reply == "One test fails."


def item(kind: str, **fields: object) -> str:
    return rec("event_msg", type="item_completed", thread_id=THREAD, turn_id="t1", item={"type": kind, **fields})


NEW_SCRIPT = (
    'text(await tools.exec_command({cmd:"printf \'hi\\\\n\' > hello.txt",sandbox_permissions:"require_escalated"}));'
)
PATCH = "*** Begin Patch\\n*** Add File: /srv/web/two.txt\\n+2\\n*** End Patch"
PATCH_SCRIPT = 'text(await tools.apply_patch("' + PATCH + '"));'
NEW_OK = {"type": "input_text", "text": '{"chunk_id":"a","exit_code":0,"output":""}'}
NEW_FAILED = {"type": "input_text", "text": '{"chunk_id":"b","exit_code":2,"output":"nope"}'}
# Codex 0.164 and later: what was said arrives as `item_completed` events, the developer and context
# messages as `response_item`s that are not the conversation.
NEW_ROLLOUT = (
    rec("session_meta", id=THREAD, cwd="/srv/web", originator="codex_tui", cli_version="0.165.0")
    + rec("event_msg", type="task_started", turn_id="t1")
    + rec("response_item", type="message", role="developer", content=[{"type": "input_text", "text": "<rules>"}])
    + rec("response_item", type="message", role="user", content=[{"type": "input_text", "text": "hello.txt please"}])
    + item("UserMessage", content=[{"type": "text", "text": "hello.txt please", "text_elements": []}])
    + item("AgentMessage", phase="commentary", content=[{"type": "Text", "text": "Creating it."}])
    + item("Reasoning", summary_text=[], raw_content=[])
    + rec("response_item", type="custom_tool_call", name="exec", call_id="c1", status="completed", input=NEW_SCRIPT)
    + rec("response_item", type="custom_tool_call", name="exec", call_id="c2", input=PATCH_SCRIPT)
    + item("CommandExecution", command=["/bin/zsh", "-lc", "x"], exit_code=0)
    + rec("response_item", type="custom_tool_call_output", call_id="c1", output=[NEW_OK])
    + rec("response_item", type="custom_tool_call_output", call_id="c2", output=[NEW_FAILED])
    + item("Plan", text="# Plan\n- one step")
    + item("AgentMessage", phase="final_answer", content=[{"type": "Text", "text": "Done."}])
    + rec("event_msg", type="task_complete", turn_id="t1", last_agent_message="Done.")
)  # fmt: skip


def test_a_codex_0_164_rollout_reads_the_same_way() -> None:
    builder = RolloutBuilder()
    builder.feed_lines(NEW_ROLLOUT.encode().split(b"\n"))
    shown = [(i.kind.value, i.tool_name, i.status and i.status.value, i.text) for i in builder.after(0, 50)]
    assert shown == [
        ("prompt", None, None, "hello.txt please"),  # said once, not again as the context message
        ("reply", None, None, "Creating it."),
        ("tool", "exec_command", "done", "printf 'hi\\n' > hello.txt"),  # a script's bare keys are read too
        ("tool", "apply_patch", "error", "/srv/web/two.txt"),  # named by the file it patches; exit code 2
        ("reply", None, None, "# Plan\n- one step"),
        ("reply", None, None, "Done."),
        ("result", None, "done", None),
    ]
    assert builder.last_reply == "Done."


def test_transcripts_read_a_rollout_by_its_name(tmp_path: Path) -> None:
    path = tmp_path / f"rollout-2026-10-26T15-34-31-{THREAD}.jsonl"
    path.write_text(ROLLOUT)
    items = Transcripts().conversation("s1", str(path), 0, 100).items
    assert [i.kind.value for i in items][:2] == ["prompt", "reply"]


def test_a_pane_finds_its_codex_session_through_the_rollout_it_holds_open(tmp_path: Path) -> None:
    home = tmp_path / "codex"
    day = home / "sessions" / "2026" / "10" / "26"
    day.mkdir(parents=True)
    rollout = day / f"rollout-2026-10-26T15-34-31-{THREAD}.jsonl"
    rollout.write_text(ROLLOUT)
    with sqlite3.connect(home / "state_5.sqlite") as db:
        db.execute("CREATE TABLE threads (id TEXT PRIMARY KEY, name TEXT, title TEXT)")
        db.execute("INSERT INTO threads VALUES (?, NULL, ?)", (THREAD, "Fix the flaky test"))
    proc = tmp_path / "proc"
    for pid, parent, fds in [(100, 1, []), (200, 100, [str(rollout)]), (300, 1, [])]:  # a shell, then codex
        (proc / str(pid) / "task" / str(pid)).mkdir(parents=True)
        (proc / str(pid) / "stat").write_text(f"{pid} (x) S {parent} 0")
        (proc / str(pid) / "fd").mkdir()
        for n, target in enumerate(fds):
            os.symlink(target, proc / str(pid) / "fd" / str(n + 3))
    codex = CodexProcesses(home, proc=proc)
    assert codex.transcript(100) == str(rollout) and codex.name(100) == "Fix the flaky test"
    assert codex.transcript(300) is None and codex.remote_id(100) is None

    agents = AgentProcesses([ClaudeProcesses(tmp_path / "claude", proc=proc), codex])
    assert agents.transcript(100) == str(rollout) and agents.name(100) == "Fix the flaky test"


def test_a_plain_codex_is_found_in_the_state_database_when_the_shared_app_server_holds_its_rollout(
    tmp_path: Path,
) -> None:
    home = tmp_path / "codex"
    day = home / "sessions" / "2026" / "10" / "28"
    day.mkdir(parents=True)
    rollout = day / f"rollout-2026-10-28T01-00-00-{THREAD}.jsonl"
    rollout.write_text(ROLLOUT)
    with sqlite3.connect(home / "state_5.sqlite") as db:
        db.execute(
            "CREATE TABLE threads (id TEXT PRIMARY KEY, rollout_path TEXT, created_at INTEGER, updated_at INTEGER,"
            " originator TEXT, cwd TEXT, archived INTEGER, name TEXT, title TEXT, first_user_message TEXT)"
        )
        own = day / "rollout-2026-10-28T01-00-00-01a17a60-0000-7000-8000-00000000000b.jsonl"
        own.write_text(ROLLOUT)
        web = "/srv/web"
        rows = [
            (THREAD, str(rollout), 1_000_020, 1_000_090, "codex-tui", web, 0, "Fix the flaky test", "t", "run the tests"),  # noqa: E501
            ("a-older-one", str(rollout), 900_000, 900_100, "codex-tui", web, 0, "old", "t", "old"),
            ("a-headless-one", str(rollout), 1_000_030, 1_000_095, "muxtower", web, 0, "headless", "t", "x"),
            ("a-launched-one", str(own), 1_000_040, 1_000_098, "codex-tui", web, 0, "launched", "t", "fix the login"),
        ]  # fmt: skip
        db.executemany("INSERT INTO threads VALUES (?,?,?,?,?,?,?,?,?,?)", rows)
    proc = tmp_path / "proc"
    proc.mkdir()
    (proc / "stat").write_text("cpu 1 2 3\nbtime 1000000\n")
    ticks = os.sysconf("SC_CLK_TCK") * 10  # every process started 10 s after boot
    for pid, parent, argv, cwd in [  # pane shells, and what runs in them
        (100, 1, ["zsh"], "/srv/web"),
        (200, 100, ["codex", "-s", "read-only"], "/srv/web"),  # plain: the thread active in its folder since
        (300, 1, ["zsh"], "/srv/else"),
        (400, 300, ["codex", "resume", THREAD], "/srv/else"),  # named: the thread it says
        (500, 1, ["zsh"], "/srv/web"),
        (600, 500, ["codex", "app-server", "--listen", "unix://"], "/srv/web"),  # nobody types into this
        (700, 1, ["zsh"], "/srv/none"),
        (800, 700, ["codex"], "/srv/none"),  # nothing said yet
        (900, 1, ["codex", "-c", "hooks={}"], "/srv/web"),  # muxtower's own: holds its rollout open itself
    ]:  # fmt: skip
        (proc / str(pid) / "task" / str(pid)).mkdir(parents=True)
        (proc / str(pid) / "stat").write_text(f"{pid} (x) " + " ".join(["S", str(parent), *["0"] * 17, str(ticks)]))
        (proc / str(pid) / "cmdline").write_bytes(b"\0".join(a.encode() for a in argv) + b"\0")
        (proc / str(pid) / "fd").mkdir()
        os.symlink(cwd, proc / str(pid) / "cwd")
    os.symlink(own, proc / "900" / "fd" / "3")
    codex = CodexProcesses(home, proc=proc)
    assert codex.transcript(100) == str(rollout) and codex.name(100) == "Fix the flaky test"
    assert codex.transcript(300) == str(rollout) and codex.name(300) == "Fix the flaky test"
    assert codex.transcript(500) is None and codex.transcript(700) is None
    assert codex.transcript(900) == str(own)  # the rollout it holds, as before
    # a Codex started with -c runs in its own process: it is never a thread of the shared app-server, even
    # while it has no rollout yet and another Codex of its folder has been busy since it started
    (proc / "900" / "fd" / "3").unlink()
    assert CodexProcesses(home, proc=proc).transcript(900) is None
    assert CodexProcesses(home, proc=proc).remote_id(900) is None
    os.symlink(own, proc / "900" / "fd" / "3")
    assert CodexProcesses(home, shared=False, proc=proc).remote_id(100) is None  # nothing there drives it
    assert CodexProcesses(home, shared=False, proc=proc).transcript(100) == str(rollout)  # but it can be read
    # two in one folder: the pane shows what it was first asked
    assert CodexProcesses(home, proc=proc).transcript(100, "› run  the tests\n  • Working") == str(rollout)
    assert CodexProcesses(home, proc=proc).name(100, "› something else entirely") == "Fix the flaky test"


def test_two_codex_in_one_folder_are_told_apart_by_what_their_panes_show(tmp_path: Path) -> None:
    home = tmp_path / "codex"
    day = home / "sessions" / "2026" / "10" / "28"
    day.mkdir(parents=True)
    other = "01a17a60-0000-7000-8000-000000000001"
    rollouts = {t: day / f"rollout-2026-10-28T01-00-00-{t}.jsonl" for t in (THREAD, other)}
    for path in rollouts.values():
        path.write_text(ROLLOUT)
    web = "/srv/web"
    with sqlite3.connect(home / "state_5.sqlite") as db:
        db.execute(
            "CREATE TABLE threads (id TEXT PRIMARY KEY, rollout_path TEXT, created_at INTEGER, updated_at INTEGER,"
            " originator TEXT, cwd TEXT, archived INTEGER, name TEXT, title TEXT, first_user_message TEXT)"
        )
        db.executemany(
            "INSERT INTO threads VALUES (?,?,?,?,'codex-tui',?,?,?,?,?)",
            [
                (THREAD, str(rollouts[THREAD]), 1_000_020, 1_000_090, web, 0, "A", "t", "run the tests"),
                (other, str(rollouts[other]), 1_000_030, 1_000_095, web, 0, "B", "t", "fix the login"),
            ],
        )
    proc = tmp_path / "proc"
    proc.mkdir()
    (proc / "stat").write_text("cpu 1 2 3\nbtime 1000000\n")
    ticks = os.sysconf("SC_CLK_TCK") * 10
    for pid, parent, argv in [(100, 1, ["zsh"]), (200, 100, ["codex"]), (300, 1, ["zsh"]), (400, 300, ["codex"])]:
        (proc / str(pid) / "task" / str(pid)).mkdir(parents=True)
        (proc / str(pid) / "stat").write_text(f"{pid} (x) " + " ".join(["S", str(parent), *["0"] * 17, str(ticks)]))
        (proc / str(pid) / "cmdline").write_bytes(b"\0".join(a.encode() for a in argv) + b"\0")
        (proc / str(pid) / "fd").mkdir()
        os.symlink("/srv/web", proc / str(pid) / "cwd")
    assert CodexProcesses(home, proc=proc).transcript(100) is None  # either could be it, and nothing says which
    assert CodexProcesses(home, proc=proc).transcript(100, "› fix the login\n• Working") == str(rollouts[other])
    assert CodexProcesses(home, proc=proc).transcript(300, "› run the tests") == str(rollouts[THREAD])


def test_a_code_mode_argument_is_read_whatever_its_quotes_and_size() -> None:
    from muxtower.agents.codex.rollout import _script_object

    assert _script_object("{cmd:'echo \"hi\"', path:'it\\'s', n: 1}") == {"cmd": 'echo "hi"', "path": "it's", "n": 1}
    assert _script_object('{ cmd : "a,b" , nested: {x: 1, y: [1,2]} }') == {
        "cmd": "a,b",
        "nested": {"x": 1, "y": [1, 2]},
    }
    big = "{" + ",".join(f"key{n}:'value {n}'" for n in range(20000)) + "}"
    assert len(_script_object(big)) == 20000  # in one pass: this ran quadratically once


def test_the_state_database_is_closed_after_each_look(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    # `with` on a connection does not close it: left open, every look kept the database and its WAL open
    home = tmp_path / "codex"
    home.mkdir()
    with closing(sqlite3.connect(home / "state_5.sqlite")) as db:
        db.execute("CREATE TABLE threads (id TEXT PRIMARY KEY)")
    opened: list[sqlite3.Connection] = []
    real = sqlite3.connect

    def spy(*args: Any, **kwargs: Any) -> sqlite3.Connection:
        opened.append(real(*args, **kwargs))
        return opened[-1]

    monkeypatch.setattr(processes.sqlite3, "connect", spy)
    codex = CodexProcesses(home, proc=tmp_path / "proc")
    for _ in range(3):
        assert codex._query("SELECT id FROM threads", ()) == []
    assert len(opened) == 3
    for db in opened:
        with pytest.raises(sqlite3.ProgrammingError):  # closed
            db.execute("SELECT 1")
