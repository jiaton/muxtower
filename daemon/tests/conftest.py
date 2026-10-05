from collections.abc import Callable
from pathlib import Path

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from muxtower.app import create_app
from muxtower.config import load_settings


@pytest.fixture
def make_app(tmp_path: Path) -> Callable[..., FastAPI]:
    def factory(**overrides: object) -> FastAPI:
        settings = load_settings(
            config_file=tmp_path / "none.toml",
            env={},
            overrides={"state_dir": tmp_path / "state", **overrides},
        )
        return create_app(settings)

    return factory


@pytest.fixture
def app(make_app: Callable[..., FastAPI]) -> FastAPI:
    return make_app()


@pytest.fixture
def client(app: FastAPI) -> TestClient:
    return TestClient(app)
