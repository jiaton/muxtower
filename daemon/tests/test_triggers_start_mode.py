"""The permission mode a trigger's start action uses (`triggers.start_mode`): a default per runtime, checked
against that runtime's modes when changed, and held to the launch default unless agents may escalate (the
rule MCP start_session keeps), the firing saying so. Every payload here is made up."""

from collections.abc import Callable
from pathlib import Path
from typing import Any

from fastapi import FastAPI
from fastapi.testclient import TestClient

from tests.fakes import FakeTmux
from tests.test_triggers_pipeline import Rig

KEY = "triggers.start_mode"


def _modes(rig: Rig) -> dict[str, dict[str, Any]]:
    listed = rig.client.get("/v1/triggers/start-modes", headers=rig.auth)
    assert listed.status_code == 200, listed.text
    return {m["runtime"]: m for m in listed.json()}


def _setting(client: TestClient, auth: dict[str, str]) -> dict[str, Any]:
    listed = client.get("/v1/settings", headers=auth).json()["settings"]
    return next(s for s in listed if s["key"] == KEY)


def _fire_start(rig: Rig, tmp_path: Path, runtime: str = "claude-code") -> dict[str, Any]:
    action = {"kind": "start", "cwd": str(tmp_path), "runtime": runtime, "message": "Triage it."}
    tid, _ = rig.make(name=f"inbox-{runtime}", action=action)
    return rig.fire(tid, {"n": 1})


def test_the_default_per_runtime(make_app: Callable[..., FastAPI], tmux: FakeTmux) -> None:
    rig = Rig(make_app(launch={"claude_code_mode": "auto", "codex_mode": "on-request"}), tmux)
    setting = _setting(rig.client, rig.auth)
    assert setting["default"] == {"claude-code": "auto", "codex": "on-request"}
    assert (setting["kind"], setting["section"], setting["source"]) == ("per_runtime", "Triggers", "default")
    assert setting["runtime_choices"]["codex"] == ["untrusted", "on-request", "full-auto", "full-access"]
    modes = _modes(rig)
    assert (modes["claude-code"]["mode"], modes["claude-code"]["label"], modes["claude-code"]["held"]) == (
        "auto", "Auto", None
    )  # fmt: skip
    assert (modes["codex"]["mode"], modes["codex"]["label"]) == ("on-request", "Ask when it wants to")


def test_a_started_session_runs_in_the_configured_mode(
    make_app: Callable[..., FastAPI], tmux: FakeTmux, tmp_path: Path
) -> None:
    rig = Rig(make_app(launch={"claude_code_mode": "default", "agents_may_escalate": True}), tmux)
    fired = _fire_start(rig, tmp_path)
    assert fired["outcome"] == "started" and fired["detail"] == f"started {fired['target']}"
    assert rig.app.state.directory.get(fired["target"]).permission_mode == "auto"


def test_above_the_default_without_escalation_starts_in_the_default_and_says_so(
    make_app: Callable[..., FastAPI], tmux: FakeTmux, tmp_path: Path
) -> None:
    rig = Rig(make_app(launch={"claude_code_mode": "default"}), tmux)
    held = _modes(rig)["claude-code"]
    assert (held["mode"], held["label"], held["configured"], held["held"]) == (
        "default", "Ask before acting", "auto", "auto is above it"
    )  # fmt: skip
    fired = _fire_start(rig, tmp_path)
    assert fired["outcome"] == "started"
    assert fired["detail"] == f"started {fired['target']} in default: auto is above it"
    assert rig.app.state.directory.get(fired["target"]).permission_mode == "default"


def test_a_dangerous_mode_is_held_too(make_app: Callable[..., FastAPI], tmux: FakeTmux, tmp_path: Path) -> None:
    rig = Rig(make_app(launch={"claude_code_mode": "acceptEdits"}), tmux)
    changed = rig.client.patch(
        "/v1/settings", headers=rig.auth, json={"values": {KEY: {"claude-code": "bypassPermissions"}}}
    )
    assert changed.status_code == 200, changed.text
    fired = _fire_start(rig, tmp_path)
    assert fired["detail"].endswith(" in default: bypassPermissions is above it")
    assert rig.app.state.directory.get(fired["target"]).permission_mode == "acceptEdits"


def test_at_or_below_the_default_is_used_as_set(
    make_app: Callable[..., FastAPI], tmux: FakeTmux, tmp_path: Path
) -> None:
    rig = Rig(make_app(launch={"claude_code_mode": "auto"}), tmux)
    rig.client.patch("/v1/settings", headers=rig.auth, json={"values": {KEY: {"claude-code": "plan"}}})
    fired = _fire_start(rig, tmp_path)
    assert fired["detail"] == f"started {fired['target']}"
    assert rig.app.state.directory.get(fired["target"]).permission_mode == "plan"


def test_a_runtime_not_named_starts_in_the_launch_default(
    make_app: Callable[..., FastAPI], tmux: FakeTmux, tmp_path: Path
) -> None:
    rig = Rig(make_app(launch={"claude_code_mode": "acceptEdits"}), tmux)
    rig.client.patch("/v1/settings", headers=rig.auth, json={"values": {KEY: {"codex": "untrusted"}}})
    assert _modes(rig)["claude-code"]["configured"] is None
    fired = _fire_start(rig, tmp_path)
    assert rig.app.state.directory.get(fired["target"]).permission_mode == "acceptEdits"


def test_an_unknown_mode_or_runtime_is_refused_when_saved(make_app: Callable[..., FastAPI], tmux: FakeTmux) -> None:
    rig = Rig(make_app(), tmux)
    for wrong, said in (
        ({"claude-code": "on-request"}, "claude-code has no permission mode 'on-request'"),
        ({"codex": "auto"}, "codex has no permission mode 'auto'"),
        ({"aider": "auto"}, "no runtime 'aider'"),
        ("auto", "triggers.start_mode"),
    ):
        refused = rig.client.patch("/v1/settings", headers=rig.auth, json={"values": {KEY: wrong}})
        assert refused.status_code == 400, (wrong, refused.text)
        assert said in refused.json()["detail"], refused.text
    assert _setting(rig.client, rig.auth)["source"] == "default"  # nothing changed

    kept = rig.client.patch("/v1/settings", headers=rig.auth, json={"values": {KEY: {"codex": "full-auto"}}})
    assert kept.status_code == 200
    assert rig.app.state.settings.triggers.start_mode == {"codex": "full-auto"}  # applies at once
    reset = rig.client.patch("/v1/settings", headers=rig.auth, json={"values": {KEY: None}})
    assert next(s for s in reset.json()["settings"] if s["key"] == KEY)["value"] == {
        "claude-code": "auto", "codex": "on-request"
    }  # fmt: skip
