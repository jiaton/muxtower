"""A dev daemon never takes the real daemon's port: a hub on the same machine holds 8731."""

import argparse
from pathlib import Path

import pytest

from muxtower.cli.serve import DEV_PORT, _settings, add_serve_parser


def parse(*argv: str) -> argparse.Namespace:
    root = argparse.ArgumentParser()
    add_serve_parser(root.add_subparsers())
    return root.parse_args(["serve", *argv])


@pytest.fixture(autouse=True)
def _no_env(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    monkeypatch.delenv("MUXTOWER_PORT", raising=False)
    monkeypatch.chdir(tmp_path)


def test_dev_takes_its_own_port() -> None:
    assert DEV_PORT != 8731
    assert _settings(parse("--dev")).port == DEV_PORT


def test_a_port_given_wins_and_without_dev_the_default_stays() -> None:
    assert _settings(parse("--dev", "--port", "9100")).port == 9100
    assert _settings(parse()).port == 8731
