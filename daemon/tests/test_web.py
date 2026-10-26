from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from muxtower import web
from muxtower.app import create_app
from muxtower.config import load_settings
from tests.fakes import FakeTmux


@pytest.fixture
def client(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> TestClient:
    ui = tmp_path / "web"
    (ui / "g2" / "assets").mkdir(parents=True)
    (ui / "index.html").write_text("web app")
    (ui / "g2" / "index.html").write_text("glasses app")
    (ui / "g2" / "assets" / "main.js").write_text("js")
    (ui / "sw.js").write_text("sw")
    monkeypatch.setattr(web, "WEB_DIR", ui)
    settings = load_settings(
        config_file=tmp_path / "none.toml", env={},
        overrides={"state_dir": tmp_path / "s", "config_dir": tmp_path / "c", "adopt_sockets": []},
    )  # fmt: skip
    return TestClient(create_app(settings, tmux=FakeTmux(), run_loops=False))


def test_glasses_app_is_served_from_its_own_folder(client: TestClient) -> None:
    assert client.get("/g2/").text == "glasses app"
    assert client.get("/g2/anything").text == "glasses app"
    assert client.get("/g2/assets/main.js").text == "js"
    assert client.get("/g2", follow_redirects=False).headers["location"] == "/g2/"
    assert client.get("/sessions/x").text == "web app"
    assert client.get("/v1/nope").status_code == 404


def test_only_hashed_assets_are_cached(client: TestClient) -> None:
    assert "immutable" in client.get("/g2/assets/main.js").headers["cache-control"]
    assert client.get("/sw.js").headers["cache-control"] == "no-cache"
    assert client.get("/sessions/x").headers["cache-control"] == "no-cache"
