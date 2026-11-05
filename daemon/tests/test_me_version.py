"""A client learns which muxtower a daemon runs from /v1/me, to say when it is newer than the client."""

from collections.abc import Callable

from fastapi import FastAPI
from fastapi.testclient import TestClient

from muxtower import __version__


def test_me_says_which_muxtower_runs(make_app: Callable[..., FastAPI]) -> None:
    app = make_app()
    _, token = app.state.tokens.create("phone")
    me = TestClient(app).get("/v1/me", headers={"Authorization": f"Bearer {token}"}).json()
    assert me["version"] == __version__
