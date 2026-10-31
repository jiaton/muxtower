import argparse
import json
from pathlib import Path

import pytest

from muxtower.cli.client import LocalDaemon
from muxtower.cli.expose import cmd_expose, with_public_url
from muxtower.config import load_settings

NAME = "box.tail1234.ts.net"
TARGET = "http://127.0.0.1:1"  # the daemon's port: nothing answers there
FAKE = """#!/bin/sh
echo "$@" >> "$LOG"
case "$1 $2" in
  "status --json") echo '{"BackendState": "Running", "Self": {"DNSName": "box.tail1234.ts.net."}}' ;;
  "serve status") cat "$SERVED" 2>/dev/null || echo '{}' ;;
esac
"""


@pytest.fixture
def tailscale(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    bin_dir = tmp_path / "bin"
    bin_dir.mkdir()
    (bin_dir / "tailscale").write_text(FAKE)
    (bin_dir / "tailscale").chmod(0o755)
    monkeypatch.setenv("PATH", f"{bin_dir}:/usr/bin:/bin")
    monkeypatch.setenv("LOG", str(tmp_path / "calls"))
    monkeypatch.setenv("SERVED", str(tmp_path / "served.json"))
    monkeypatch.setenv("MUXTOWER_CONFIG", str(tmp_path / "config.toml"))
    monkeypatch.delenv("MUXTOWER_PUBLIC_URL", raising=False)
    return tmp_path


def expose(tmp: Path, off: bool = False) -> int:
    settings = load_settings(config_file=tmp / "config.toml", env={}, overrides={"port": 1, "state_dir": tmp / "s"})
    return cmd_expose(argparse.Namespace(via="tailscale", https_port=443, off=off), LocalDaemon(settings))


def serving(tmp: Path, proxy: str) -> None:
    web = {f"{NAME}:443": {"Handlers": {"/": {"Proxy": proxy}}}}
    (tmp / "served.json").write_text(json.dumps({"TCP": {"443": {"HTTPS": True}}, "Web": web}))


def test_serves_the_daemon_and_sets_public_url(tailscale: Path) -> None:
    (tailscale / "config.toml").write_text('# mine\n[hub]\nupdate = "always"\n')
    assert expose(tailscale) == 0
    assert f"serve --bg --https=443 {TARGET}" in (tailscale / "calls").read_text()
    config = (tailscale / "config.toml").read_text()
    assert config == f'public_url = "https://{NAME}"\n\n# mine\n[hub]\nupdate = "always"\n'


def test_leaves_what_tailscale_already_serves_alone(tailscale: Path) -> None:
    serving(tailscale, "http://127.0.0.1:3000")
    assert expose(tailscale) == 1
    assert "--bg" not in (tailscale / "calls").read_text() and not (tailscale / "config.toml").exists()


def test_off_stops_serving_and_forgets_the_address(tailscale: Path) -> None:
    serving(tailscale, TARGET)
    (tailscale / "config.toml").write_text(f'public_url = "https://{NAME}"\nport = 1\n')
    assert expose(tailscale, off=True) == 0
    assert "serve --https=443 off" in (tailscale / "calls").read_text()
    assert (tailscale / "config.toml").read_text() == "port = 1\n"


def test_public_url_is_set_at_the_top_level_only() -> None:
    assert with_public_url('public_url = "http://old"\n[hub]\n', "https://new") == 'public_url = "https://new"\n[hub]\n'
    above = with_public_url('[hub]\npublic_url = "x"\n', "https://new")
    assert above == 'public_url = "https://new"\n\n[hub]\npublic_url = "x"\n'
    assert with_public_url("", "https://new") == 'public_url = "https://new"\n'
    with pytest.raises(ValueError, match="by hand"):
        with_public_url('public_url = """\nhttps://a\n"""\n', "https://new")
