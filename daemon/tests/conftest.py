from collections.abc import Callable
from pathlib import Path

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from muxtower.app import create_app
from muxtower.config import load_settings
from tests.fakes import FakeTmux


@pytest.fixture
def tmux() -> FakeTmux:
    return FakeTmux()


@pytest.fixture
def make_app(tmp_path: Path, tmux: FakeTmux) -> Callable[..., FastAPI]:
    def factory(**overrides: object) -> FastAPI:
        settings = load_settings(
            config_file=tmp_path / "none.toml",
            env={},
            overrides={
                "state_dir": tmp_path / "state",
                "config_dir": tmp_path / "config",
                "serve_ui": False,
                **overrides,
            },
        )
        return create_app(settings, tmux=tmux, run_loops=False)

    return factory


@pytest.fixture
def app(make_app: Callable[..., FastAPI]) -> FastAPI:
    return make_app()


@pytest.fixture
def client(app: FastAPI) -> TestClient:
    return TestClient(app)


@pytest.fixture
def auth(app: FastAPI) -> dict[str, str]:
    _, token = app.state.tokens.create("phone")
    return {"Authorization": f"Bearer {token}"}
