"""Benchmark: the session list (`SessionDirectory.list`) and the indexer's look at it, over a made-up
hub: 50 live sessions, 80 archived, 37 transcript folders with 155 transcripts, 228 process files left.

    poetry run python -m tests.bench_list [calls]

Prints wall and CPU time per list() and per indexer targets() round. Not collected by pytest."""

import json
import os
import sys
import tempfile
import time
import uuid
from datetime import UTC, datetime
from pathlib import Path


def _fixture(root: Path) -> tuple[Path, list[str]]:
    claude = root / "claude"
    (claude / "sessions").mkdir(parents=True)
    agents: list[str] = []
    for f in range(37):
        folder = claude / "projects" / f"-work-acme-project-{f}"
        folder.mkdir(parents=True)
        for t in range(155 // 37 + (1 if f < 155 % 37 else 0)):
            agent = str(uuid.UUID(int=f * 1000 + t + 1))
            said = {"role": "assistant", "content": [{"type": "text", "text": "ok " * 40}]}
            asked = {"role": "user", "content": "Plan the launch"}
            lines = [{"type": "user", "uuid": str(uuid.uuid4()), "message": asked}]
            lines += [{"type": "assistant", "message": said}] * 30
            (folder / f"{agent}.jsonl").write_text("".join(json.dumps(x) + "\n" for x in lines))
            agents.append(agent)
    for p in range(228):  # left by processes that are gone
        info = {
            "pid": 4_000_000 + p,
            "sessionId": agents[p % len(agents)],
            "cwd": "/work/acme",
            "bridgeSessionId": f"session_bench{p:04d}",
            "procStart": "1",
        }
        (claude / "sessions" / f"{4_000_000 + p}.json").write_text(json.dumps(info))
    old = time.time_ns() - 3600 * 10**9  # written an hour ago, as on a machine that has run a while
    for path in [claude, *claude.rglob("*")]:
        os.utime(path, ns=(old, old))
    return claude, agents


def main() -> None:
    calls = int(sys.argv[1]) if len(sys.argv) > 1 else 50
    root = Path(tempfile.mkdtemp(prefix="mxt-bench-"))
    claude, agents = _fixture(root)
    os.environ["CLAUDE_CONFIG_DIR"] = str(claude)

    from muxtower.app import create_app
    from muxtower.config import load_settings
    from muxtower.sessions.models import CreateSession, Session
    from muxtower.sessions.ports import ArchiveRecord
    from tests.fakes import FakeTmux

    work = root / "work"
    work.mkdir()
    settings = load_settings(
        config_file=root / "none.toml", env={},
        overrides={"state_dir": root / "state", "config_dir": root / "config", "serve_ui": False},
    )  # fmt: skip
    app = create_app(settings, tmux=FakeTmux(), run_loops=False)
    sessions, directory = app.state.sessions, app.state.directory
    made = [sessions.create(CreateSession(runtime="claude", cwd=str(work), name=f"s{i}")) for i in range(120)]
    for i, s in enumerate(made[:70]):  # archived as the owner does, with their conversation's id
        record = sessions.repo.get(s.id)
        record.agent_id = agents[i]
        sessions.repo.upsert(record)
        app.state.archiver.archive(s.id)
    store = app.state.archiver.archive_store
    for i in range(10):  # older records: found by their Remote Control session's process file
        view = Session.model_validate_json(store.record(made[0].id).session).model_copy(
            update={"id": f"old{i:09d}", "name": f"old {i}"}
        )
        store.repo.add(ArchiveRecord(f"old{i:09d}", f"cse_bench{i * 20:04d}", view.model_dump_json(), None, "[]",
                                     datetime.now(UTC)))  # fmt: skip
    store._records = {r.session_id: r for r in store.repo.list()}
    listed = directory.list()
    print(f"listed {len(listed)}: {sum(1 for s in listed if s.archived_at)} archived", file=sys.stderr)

    def measure(name: str, fn) -> None:  # type: ignore[no-untyped-def]
        fn()
        wall, cpu = time.perf_counter(), time.process_time()
        for _ in range(calls):
            fn()
        wall, cpu = time.perf_counter() - wall, time.process_time() - cpu
        print(f"{name:28s} {wall / calls * 1000:8.2f} ms wall {cpu / calls * 1000:8.2f} ms CPU per call ({calls})")

    measure("directory.list()", directory.list)
    measure("indexer.targets()", app.state.indexer.targets)
    measure("archive views()", store.views)
    if hasattr(app.state.recovery, "resumability"):  # after a change: everything looked at again

        def anew() -> None:
            app.state.recovery.resumability._found.clear()
            store._kept.clear()
            store.views()

        measure("archive views(), nothing kept", anew)


if __name__ == "__main__":
    main()
