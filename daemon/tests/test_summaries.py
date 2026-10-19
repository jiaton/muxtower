import asyncio
import sys
from pathlib import Path

import pytest

from muxtower.errors import Unavailable
from muxtower.infra.bus import EventBus
from muxtower.summaries.cli import _run
from muxtower.summaries.models import SummaryState
from muxtower.summaries.service import SummaryService, reply_hash

LONG = "第一段很长的回复。" * 60


class MemoryRepo:
    def __init__(self, seed: dict[str, str] | None = None) -> None:
        self.rows = dict(seed or {})

    def recent(self, limit: int) -> dict[str, str]:
        return dict(self.rows)

    def save(self, reply_hash: str, summary: str) -> None:
        self.rows[reply_hash] = summary


class FakeSummarizer:
    def __init__(self, fail: bool = False) -> None:
        self.calls: list[str] = []
        self.fail = fail

    def summarize(self, instructions: str, text: str) -> str:
        self.calls.append(text)
        if self.fail:
            raise Unavailable("down")
        return "短版本"


async def _drive(service: SummaryService, bus: EventBus, steps: list[str], eager_for: str | None = None) -> None:
    runner = asyncio.create_task(service.run_loop(bus, lambda _id: LONG, eager=True))
    await asyncio.sleep(0.01)  # let the loops start and subscribe
    for text in steps:
        service.request(text)
    if eager_for:
        bus.publish(f"attention:{eager_for}", None)
    for _ in range(50):
        await asyncio.sleep(0.01)
    runner.cancel()


def test_long_replies_are_summarized_once_and_announced() -> None:
    fake, repo, bus = FakeSummarizer(), MemoryRepo(), EventBus()
    service = SummaryService(fake, repo, min_chars=400)
    assert service.request("short") == SummaryState.NOT_NEEDED
    assert service.request(LONG) == SummaryState.UNAVAILABLE  # loop not running yet
    sessions: asyncio.Queue[tuple[str, object]] = asyncio.Queue()

    async def scenario() -> None:
        bus.subscribe("sessions", sessions)
        await _drive(service, bus, [LONG, LONG])

    asyncio.run(scenario())
    assert fake.calls == [LONG]
    assert service.lookup(LONG) == "短版本" and repo.rows[reply_hash(LONG)] == "短版本"
    assert service.request(LONG) == SummaryState.READY
    assert sessions.qsize() == 1


def test_a_session_needing_the_owner_is_summarized_eagerly() -> None:
    fake = FakeSummarizer()
    service = SummaryService(fake, MemoryRepo(), min_chars=400)
    asyncio.run(_drive(service, EventBus(), [], eager_for="s1"))
    assert fake.calls == [LONG]


def test_failures_are_not_retried_at_once_and_cache_survives_restarts() -> None:
    fake = FakeSummarizer(fail=True)
    service = SummaryService(fake, MemoryRepo(), min_chars=400)

    async def scenario() -> None:
        await _drive(service, EventBus(), [LONG])
        assert service.request(LONG) == SummaryState.UNAVAILABLE

    asyncio.run(scenario())
    restarted = SummaryService(None, MemoryRepo({reply_hash(LONG): "saved"}), min_chars=400)
    assert restarted.lookup(LONG) == "saved"


def test_cli_summarizer_passes_the_reply_on_stdin_and_reports_failures(tmp_path: Path) -> None:
    tool = tmp_path / "fake-cli"
    tool.write_text(
        f"#!{sys.executable}\nimport sys\nif '--fail' in sys.argv: sys.exit(3)\nprint(sys.stdin.read().upper())\n"
    )
    tool.chmod(0o755)
    assert _run([str(tool), "arg; rm -rf /"], "reply", tmp_path, timeout=10) == "REPLY"
    with pytest.raises(Unavailable, match="exit 3"):
        _run([str(tool), "--fail"], "reply", tmp_path, timeout=10)
    with pytest.raises(Unavailable, match="not installed"):
        _run([str(tmp_path / "missing")], "reply", tmp_path, timeout=10)


def test_sessions_carry_the_summary_of_their_last_reply(tmp_path: Path) -> None:
    from fastapi.testclient import TestClient

    from muxtower.app import create_app
    from muxtower.config import load_settings
    from muxtower.sources.remote_control.service import RemoteControlSource
    from tests.fakes import FakeTmux
    from tests.rc_fakes import FakeRemoteControl, assistant, session

    port = FakeRemoteControl()
    port.sessions = [session("cse_1"), session("cse_2")]
    port.events = {
        "cse_1": [assistant(1, {"type": "text", "text": LONG})],
        "cse_2": [assistant(1, {"type": "text", "text": "ok"})],
    }
    source = RemoteControlSource(port, {})
    source.tick()
    settings = load_settings(
        config_file=tmp_path / "none.toml", env={},
        overrides={"state_dir": tmp_path / "s", "config_dir": tmp_path / "c", "serve_ui": False, "adopt_sockets": []},
    )  # fmt: skip
    app = create_app(settings, tmux=FakeTmux(), run_loops=False, remote_control=source)
    app.state.directory.summaries = app.state.summaries = SummaryService(
        None, MemoryRepo({reply_hash(LONG): "短"}), 400
    )
    client = TestClient(app)
    _, token = app.state.tokens.create("glasses")
    auth = {"Authorization": f"Bearer {token}"}
    by_id = {s["id"]: s for s in client.get("/v1/sessions", headers=auth).json()}
    assert by_id["cse_1"]["reply_summary"] == "短" and by_id["cse_2"]["reply_summary"] is None
    assert client.post("/v1/sessions/cse_1/summary", headers=auth).json() == {"state": "ready"}
    assert client.post("/v1/sessions/cse_2/summary", headers=auth).json() == {"state": "not_needed"}
