import json
import os
import sqlite3
from pathlib import Path

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
