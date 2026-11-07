import json
import stat
from pathlib import Path

from fastapi import FastAPI
from fastapi.testclient import TestClient

from muxtower.diagnostics.service import MAX_BODY_BYTES, MAX_ENTRIES, DiagnosticsService


def _log(app: FastAPI, name: str = "g2.jsonl") -> Path:
    service: DiagnosticsService = app.state.diagnostics
    return service.directory / name


def test_appends_entries_with_device_and_time(app: FastAPI, client: TestClient, auth: dict[str, str]) -> None:
    res = client.post("/v1/diagnostics", json={"source": "g2", "entries": [{"up_s": 10}, {"up_s": 20}]}, headers=auth)
    assert res.status_code == 204
    path = _log(app)
    lines = [json.loads(line) for line in path.read_text().splitlines()]
    assert [line["entry"] for line in lines] == [{"up_s": 10}, {"up_s": 20}]
    assert {line["device"] for line in lines} == {"phone"} and all(line["received"] for line in lines)
    assert stat.S_IMODE(path.stat().st_mode) == 0o600
    with app.state.audit.db.connect() as conn:
        rows = [dict(r) for r in conn.execute("SELECT * FROM audit_log WHERE action = 'diagnostics'")]
    assert len(rows) == 1 and "up_s" not in str(rows[0])


def test_needs_a_device_token(client: TestClient) -> None:
    assert client.post("/v1/diagnostics", json={"source": "g2", "entries": []}).status_code == 401


def test_refuses_bad_batches_and_writes_nothing(app: FastAPI, client: TestClient, auth: dict[str, str]) -> None:
    bad = [
        {"source": "../etc", "entries": [{"a": 1}]},
        {"source": "G2", "entries": [{"a": 1}]},
        {"source": "g2", "entries": [{"a": 1}] * (MAX_ENTRIES + 1)},
        {"source": "g2", "entries": [{"pad": "x" * MAX_BODY_BYTES}]},
        {"source": "g2", "entries": "nope"},
    ]
    for body in bad:
        assert client.post("/v1/diagnostics", json=body, headers=auth).status_code == 400
    assert not app.state.diagnostics.directory.exists() or not any(app.state.diagnostics.directory.iterdir())


def test_rotates_one_generation(tmp_path: Path) -> None:
    service = DiagnosticsService(tmp_path / "diagnostics", rotate_bytes=200)
    for i in range(10):
        service.append("g2", "glasses", [{"n": i}])
    current = tmp_path / "diagnostics" / "g2.jsonl"
    rotated = tmp_path / "diagnostics" / "g2.jsonl.1"
    assert rotated.exists() and current.stat().st_size < 400
    assert not (tmp_path / "diagnostics" / "g2.jsonl.2").exists()
    numbers = [json.loads(line)["entry"]["n"] for p in (rotated, current) for line in p.read_text().splitlines()]
    assert numbers == sorted(numbers) and numbers[-1] == 9
