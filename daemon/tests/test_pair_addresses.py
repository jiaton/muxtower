"""`muxtower pair` lists only addresses that work, and says what each is good for."""

from muxtower.cli.pair import candidates


def test_a_daemon_on_this_machine_only_marks_its_lan_address_unreachable() -> None:
    found = dict(candidates(8731, "127.0.0.1", None, "192.168.1.20"))
    assert "this machine only (set `host`)" in found["http://192.168.1.20:8731"]


def test_a_daemon_on_the_lan_says_a_hosted_app_cannot_use_plain_http() -> None:
    found = dict(candidates(8731, "0.0.0.0", None, "192.168.1.20"))  # noqa: S104 - what the config says
    assert "open it directly in a browser" in found["http://192.168.1.20:8731"]
    assert "cannot pair with plain HTTP" in found["http://192.168.1.20:8731"]


def test_a_tailscale_address_comes_first() -> None:
    found = candidates(8731, "0.0.0.0", "https://nas.tailnet.ts.net", "192.168.1.20")  # noqa: S104
    assert found[0] == ("https://nas.tailnet.ts.net", "Tailscale (https): works from any app, a hosted one too")
    assert [url for url, _ in candidates(8731, "127.0.0.1", None, None)] == ["http://127.0.0.1:8731"]
