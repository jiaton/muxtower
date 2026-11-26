"""Reading a machine's plans (`subscriptions/reader.py`): with the CLIs' own sign-ins, never refreshing them, never
saying a token, and hiding what a reply does not say."""

import json
import logging
from datetime import UTC, datetime, timedelta
from pathlib import Path

import httpx
import pytest

from muxtower.subscriptions.credentials import CliLogins
from muxtower.subscriptions.models import PlanReports, Provider
from muxtower.subscriptions.parse import account_key, claude_windows, codex_windows, rate_limit_event
from muxtower.subscriptions.provider_client import CLAUDE_PROFILE, CLAUDE_USAGE, CODEX_USAGE, ProviderClient
from muxtower.subscriptions.reader import PlanReader
from tests.plan_fakes import CLAUDE_TOKEN, CODEX_ACCOUNT, ORG, FakeApi, FakeLogins, clock, codex_jwt


def _reader(now: datetime, on: list[bool] | None = None) -> tuple[PlanReader, FakeLogins, FakeApi]:
    logins, api = FakeLogins(now), FakeApi()
    switch = on if on is not None else [True]
    return PlanReader(logins, api, lambda: switch[0], clock(now)), logins, api


def test_a_poll_reads_each_plan_with_hashed_accounts_and_nothing_personal() -> None:
    now = datetime(2026, 1, 5, 9, 0, tzinfo=UTC)
    reader, _, api = _reader(now)
    reader.tick()
    claude, codex = reader.reports()
    assert (claude.provider, claude.account, claude.plan) == (Provider.CLAUDE, account_key(Provider.CLAUDE, ORG), "max")
    assert [w.id for w in claude.windows] == ["session", "weekly", "weekly:opus"]  # the codename limit left out
    assert claude.windows[0].percent == 42.0 and claude.windows[2].label == "Week, Opus"
    assert (codex.account, codex.plan) == (account_key(Provider.CODEX, CODEX_ACCOUNT), "plus")
    assert [(w.id, w.percent) for w in codex.windows] == [("session", 61.0), ("weekly", 12.0)]
    sent = json.dumps(PlanReports(reports=reader.reports()).model_dump(mode="json"))
    for private in ("example.com", "Made Up", ORG, CODEX_ACCOUNT, CLAUDE_TOKEN):
        assert private not in sent
    assert len(account_key(Provider.CLAUDE, ORG)) == 16
    assert api.calls == ["claude_usage", "claude_profile", "codex_usage"]


def test_an_expired_or_nearly_expired_sign_in_is_not_used_and_the_last_reading_stays() -> None:
    now = datetime(2026, 1, 5, 9, 0, tzinfo=UTC)
    reader, logins, api = _reader(now)
    reader.tick()
    before = reader.reports()
    for left in (timedelta(seconds=90), timedelta(minutes=-5)):
        api.calls.clear()
        assert logins.claude_login and logins.codex_login
        logins.claude_login = type(logins.claude_login)(logins.claude_login.token, now + left, "max")
        logins.codex_login = type(logins.codex_login)(logins.codex_login.token, now + left, CODEX_ACCOUNT, "plus")
        reader.tick()
        assert api.calls == []  # not used, and never refreshed
        assert reader.reports() == before  # with the time it was read


def test_a_schema_miss_hides_the_figure_and_never_fails() -> None:
    now = datetime(2026, 1, 5, 9, 0, tzinfo=UTC)
    reader, _, api = _reader(now)
    api.claude = {"limits": [{"kind": "session", "percent": "lots", "resets_at": "soon"}, "junk", None]}
    api.codex = {"rate_limit": {"primary_window": {"limit_window_seconds": 18000, "used_percent": None}}}
    reader.tick()
    claude, codex = reader.reports()
    (session,) = claude.windows
    assert (session.percent, session.resets_at) == (None, None)
    assert (codex.windows[0].percent, codex.windows[0].resets_at) == (None, None)
    for nonsense in (None, [], "x", 3, {"limits": "no"}, {"five_hour": {"utilization": True}}):
        assert all(w.percent is None for w in claude_windows(nonsense))
        assert codex_windows(nonsense) == []
    old = claude_windows({"five_hour": {"utilization": 30, "resets_at": 1767621600}, "seven_day": {}})
    found = [(w.id, w.percent, w.resets_at is not None) for w in old]
    assert found == [("session", 30.0, True), ("weekly", None, False)]


def test_a_provider_signed_out_is_left_out_and_one_failing_keeps_its_last_reading() -> None:
    now = datetime(2026, 1, 5, 9, 0, tzinfo=UTC)
    reader, logins, api = _reader(now)
    reader.tick()
    api.profile = {"organization": {}}  # no account to key it by: kept as it was
    logins.codex_login = None
    reader.tick()
    (claude,) = reader.reports()
    assert claude.provider == Provider.CLAUDE and claude.observed_at == now


def _files(home: Path, now: datetime) -> None:
    (home / ".claude").mkdir()
    (home / ".claude" / ".credentials.json").write_text(json.dumps({"claudeAiOauth": {
        "accessToken": CLAUDE_TOKEN, "refreshToken": "sk-ant-ort01-MADEUPrefresh", "subscriptionType": "max",
        "expiresAt": int((now + timedelta(hours=3)).timestamp() * 1000), "rateLimitTier": "default_claude_max_20x",
    }}))  # fmt: skip
    (home / ".codex").mkdir()
    (home / ".codex" / "auth.json").write_text(json.dumps({"tokens": {
        "access_token": codex_jwt(now + timedelta(days=3)), "refresh_token": "rt-MADEUP-refresh",
        "id_token": "made.up.id", "account_id": CODEX_ACCOUNT,
    }, "last_refresh": "2026-01-01T00:00:00Z"}))  # fmt: skip


def test_only_the_three_usage_urls_are_asked_never_a_refresh(tmp_path: Path) -> None:
    now = datetime.now(UTC)
    _files(tmp_path, now)
    asked: list[httpx.Request] = []

    def answer(request: httpx.Request) -> httpx.Response:
        asked.append(request)
        replies = {CLAUDE_USAGE: {"limits": []}, CLAUDE_PROFILE: {"organization": {"uuid": ORG}}, CODEX_USAGE: {}}
        return httpx.Response(200, json=replies[str(request.url)])

    reader = PlanReader(CliLogins(tmp_path, env={}), ProviderClient(httpx.MockTransport(answer)), lambda: True)
    reader.tick()
    assert sorted(str(r.url) for r in asked) == sorted([CLAUDE_USAGE, CLAUDE_PROFILE, CODEX_USAGE])
    assert all(r.method == "GET" and not r.content for r in asked)
    for request in asked:
        assert "refresh" not in str(request.url) and "MADEUP-refresh" not in str(request.headers)
        assert "MADEUPrefresh" not in str(request.headers)
    assert asked[0].headers["authorization"] == f"Bearer {CLAUDE_TOKEN}"
    assert {r.headers.get("chatgpt-account-id") for r in asked} == {None, CODEX_ACCOUNT}
    assert len(reader.reports()) == 2


def test_a_token_never_appears_in_a_log_line_or_an_error(tmp_path: Path, caplog: pytest.LogCaptureFixture) -> None:
    now = datetime.now(UTC)
    _files(tmp_path, now)

    def leaky(request: httpx.Request) -> httpx.Response:
        token = request.headers["authorization"].removeprefix("Bearer ")
        if "anthropic" in str(request.url):
            raise httpx.ConnectError(f"refused, the request said {token}")
        return httpx.Response(500, text=f"echo {token}")

    caplog.set_level(logging.DEBUG)
    reader = PlanReader(CliLogins(tmp_path, env={}), ProviderClient(httpx.MockTransport(leaky)), lambda: True)
    reader.tick()

    def broken(request: httpx.Request) -> httpx.Response:
        raise RuntimeError(f"bug holding {request.headers['authorization']}")

    PlanReader(CliLogins(tmp_path, env={}), ProviderClient(httpx.MockTransport(broken)), lambda: True).tick()
    (tmp_path / ".codex" / "auth.json").write_text('{"tokens": {"access_token": "' + CLAUDE_TOKEN)  # half written
    PlanReader(CliLogins(tmp_path, env={}), ProviderClient(httpx.MockTransport(broken)), lambda: True).tick()
    assert "plan usage" in caplog.text  # it did say what failed
    codex_token = codex_jwt(now + timedelta(days=3))
    for token in (CLAUDE_TOKEN, codex_token, codex_token.split(".")[1], "MADEUP"):
        assert token not in caplog.text
        assert all(token not in str(r.exc_info) for r in caplog.records if r.exc_info)
    assert reader.reports() == []
    assert repr(FakeLogins(now).claude()).count(CLAUDE_TOKEN) == 0


def test_the_cli_files_say_nothing_else_and_an_api_key_sign_in_has_no_plan(tmp_path: Path) -> None:
    now = datetime.now(UTC)
    _files(tmp_path, now)
    logins = CliLogins(tmp_path, env={})
    claude, codex = logins.claude(), logins.codex()
    assert claude and claude.plan == "max" and claude.expires_at and claude.expires_at > now
    assert codex and codex.account_id == CODEX_ACCOUNT and codex.plan == "plus" and codex.expires_at
    (tmp_path / ".codex" / "auth.json").write_text(json.dumps({"OPENAI_API_KEY": "sk-made-up", "tokens": None}))
    assert logins.codex() is None
    assert CliLogins(tmp_path / "nowhere", env={}).claude() is None
    moved = CliLogins(tmp_path / "nowhere", env={"CLAUDE_CONFIG_DIR": str(tmp_path / ".claude")}).claude()
    assert moved is not None


# --- limits and the one push each -----------------------------------------------------------------------------


def test_a_session_refused_for_the_limit_marks_the_claude_plan_limited() -> None:
    now = datetime(2026, 1, 5, 9, 0, tzinfo=UTC)
    reader, _, _ = _reader(now)
    reader.tick()
    seen: list[int] = []
    reader.changed.append(lambda: seen.append(reader.version))
    event = {"type": "rate_limit_event", "rate_limit_info": {"status": "rejected", "resetsAt": 1767621600}}
    reader.limited(*rate_limit_event(event))  # type: ignore[misc]
    assert seen == []  # told by the loop's thread, never under the caller's lock
    reader.tick()
    claude, codex = reader.reports()
    assert claude.limited_until == datetime(2026, 1, 5, 14, 0, tzinfo=UTC) and codex.limited_until is None
    reader.limited(*rate_limit_event({"type": "rate_limit_event", "rate_limit_info": {"status": "allowed"}}))  # type: ignore[misc]
    assert reader.reports()[0].limited_until is None
    assert rate_limit_event({"type": "assistant"}) is None


def test_a_window_used_up_is_a_limit_too() -> None:
    now = datetime(2026, 1, 5, 9, 0, tzinfo=UTC)
    reader, _, api = _reader(now)
    api.codex = {"rate_limit": {"primary_window": {"used_percent": 100, "limit_window_seconds": 18000,
                                                   "reset_at": 1767621600}}}  # fmt: skip
    reader.tick()
    assert reader.reports()[1].limited_until == datetime(2026, 1, 5, 14, 0, tzinfo=UTC)
