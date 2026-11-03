from collections.abc import Callable
from datetime import UTC, datetime
from pathlib import Path

from fastapi import FastAPI
from fastapi.testclient import TestClient

from muxtower.config import UsageSettings
from muxtower.sessions.models import CreateSession
from muxtower.usage.models import MachineUsage, SlowRule, TickUsage
from muxtower.usage.sampler import UsageSampler, alerts, average
from tests import screens
from tests.fakes import FakeTmux


def test_cpu_is_averaged_over_its_window_not_since_the_start() -> None:
    samples = [(float(t), t * 0.1) for t in range(0, 61, 5)]  # 10% of a core for a minute
    assert average(samples, 60, 60) == 10.0
    burst = [*samples, (65.0, 6.0 + 4.5)]  # then 90% for 5 s
    assert round(average(burst, 65, 60) or 0) == 17
    assert average(samples[:3], 10, 60) is None  # just started: unknown, not 0


def test_over_a_threshold_is_an_alert_and_unknown_is_none() -> None:
    limits = UsageSettings()
    quiet = MachineUsage(machine="nas", sampled_at=datetime.now(UTC), cpu_1m=3.0, rss_mb=120, tick=TickUsage(avg_ms=12))
    assert alerts(quiet, limits) == []
    assert alerts(MachineUsage(machine="nas", sampled_at=datetime.now(UTC)), limits) == []  # nothing known
    slow = SlowRule(session_id="a1", session_name="shop-api", rule="workspace-trust", ms=138)
    busy = quiet.model_copy(
        update={"cpu_1m": 82.0, "rss_mb": 900, "tick": TickUsage(avg_ms=420, max_ms=600, slowest=slow)}
    )
    found = {a.metric: a for a in alerts(busy, limits)}
    assert set(found) == {"cpu", "tick", "memory"}
    assert (found["cpu"].value, found["cpu"].threshold) == (82.0, 20.0)
    assert found["tick"].detail == "slowest: rule workspace-trust on shop-api, 138 ms"


def test_the_sampler_reads_this_process_and_the_capture_loop(
    make_app: Callable[..., FastAPI], tmux: FakeTmux, tmp_path: Path
) -> None:
    app = make_app()
    made = app.state.sessions.create(CreateSession(runtime="claude", cwd=str(tmp_path), name="shop-api"))
    pane = next(p for p in tmux.panes.values() if p.info.session_name == made.tmux_session)
    pane.screen = screens.LONG_IDLE
    app.state.monitor.tick()
    clock = iter([100.0, 140.0])
    sampler = UsageSampler("nas", UsageSettings(), lambda: list(app.state.monitor.timings), lambda _: "shop-api")
    sampler.clock = lambda: next(clock)
    for timing in app.state.monitor.timings:  # as if sampled within the minute after
        object.__setattr__(timing, "at", 120.0)
    first = sampler.sample()
    assert first.cpu_1m is None  # one sample: unknown yet
    second = sampler.sample()
    assert second.cpu_1m is not None and second.rss_mb and second.open_files and second.threads
    assert second.tick.avg_ms is not None and second.tick.slowest and second.tick.slowest.session_name == "shop-api"
    assert isinstance(second.children, list)  # /proc here


def test_a_node_s_usage_is_shown_by_the_hub_and_goes_stale(make_app: Callable[..., FastAPI]) -> None:
    app = make_app()
    _, token = app.state.tokens.create("phone")
    phone = TestClient(app, headers={"Authorization": f"Bearer {token}"})
    name, _ = app.state.nodes.claim("mac")
    told = MachineUsage(machine="Work-MacBook", sampled_at=datetime.now(UTC), cpu_1m=31.0, alerts=[])
    app.state.nodes.on_event(name, "usage", told.model_dump(mode="json"))
    app.state.nodes.on_event(name, "usage", {"cpu_1m": "lots"})  # a bad report is dropped
    listed = phone.get("/v1/usage").json()
    assert listed[0]["machine"] == app.state.usage.machine
    (mac,) = listed[1:]
    assert (mac["machine"], mac["cpu_1m"], mac["stale"]) == ("mac", 31.0, True)  # not linked: may be gone
