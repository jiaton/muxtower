"""Plan usage (`subscriptions/`): the contract the app reads, and the hub-wide setting that turns it off."""

from collections.abc import Callable
from datetime import UTC, datetime, timedelta

from fastapi import FastAPI
from fastapi.testclient import TestClient

from muxtower.subscriptions.models import (
    PlanAccount,
    PlanMachine,
    PlanReport,
    PlanReports,
    PlanUsage,
    Provider,
    UsageWindow,
    WindowKind,
)
from muxtower.subscriptions.reader import PlanReader
from muxtower.subscriptions.service import PlanBook
from tests.plan_fakes import (
    FakeApi,
    FakeLogins,
    clock,
)


def _phone(app: FastAPI) -> TestClient:
    _, token = app.state.tokens.create("phone")
    return TestClient(app, headers={"Authorization": f"Bearer {token}"})


def test_the_app_reads_whether_it_is_on_and_the_accounts(make_app: Callable[..., FastAPI]) -> None:
    app = make_app()
    listed = _phone(app).get("/v1/plan-usage")
    assert listed.status_code == 200
    assert PlanUsage.model_validate(listed.json()) == PlanUsage(enabled=True, accounts=[])
    assert TestClient(app).get("/v1/plan-usage").status_code == 401


def test_an_account_lists_its_windows_and_machines(make_app: Callable[..., FastAPI]) -> None:
    app = make_app()
    at = datetime(2026, 1, 5, 9, 30, tzinfo=UTC)
    account = PlanAccount(
        provider=Provider.CLAUDE, account="3f2a9c0d1e4b5a67", plan="max", observed_at=at,
        windows=[
            UsageWindow(id="session", kind=WindowKind.SESSION, label="5-hour session", percent=42.0, resets_at=at),
            UsageWindow(id="weekly:opus", kind=WindowKind.WEEKLY_SCOPED, label="Week, Opus", model="Opus"),
        ],
        machines=[PlanMachine(machine="laptop", reported_at=at)],
    )  # fmt: skip
    app.state.plan_book.accounts = lambda: [account]
    (shown,) = _phone(app).get("/v1/plan-usage").json()["accounts"]
    assert PlanAccount.model_validate(shown) == account
    session, opus = shown["windows"]
    assert (session["percent"], opus["percent"], opus["resets_at"], opus["model"]) == (42.0, None, None, "Opus")
    assert shown["limited_until"] is None


def test_off_lists_nothing_and_is_the_hubs_alone(make_app: Callable[..., FastAPI]) -> None:
    app = make_app()
    phone = _phone(app)
    settings = phone.patch("/v1/settings", json={"values": {"plan_usage.enabled": False}}).json()["settings"]
    (field,) = (s for s in settings if s["key"] == "plan_usage.enabled")
    assert (field["value"], field["applies"], field["hub_only"]) == (False, "now", True)
    assert phone.get("/v1/plan-usage").json() == {"enabled": False, "accounts": []}
    name, _ = app.state.nodes.claim("mac")
    refused = phone.patch("/v1/settings", params={"node": name}, json={"values": {"plan_usage.enabled": True}})
    assert refused.status_code == 400  # a node follows its hub


def test_a_nodes_report_carries_no_more_than_the_contract() -> None:
    report = PlanReport(provider=Provider.CODEX, account="9b1e", observed_at=datetime.now(UTC))
    sent = PlanReports(reports=[report]).model_dump(mode="json")
    assert set(sent["reports"][0]) == {"provider", "account", "plan", "windows", "limited_until", "observed_at"}


def _report(provider: Provider, account: str, at: datetime, until: datetime | None = None) -> PlanReport:
    return PlanReport(provider=provider, account=account, plan="max", observed_at=at, limited_until=until)


def test_exactly_one_push_per_limit_however_many_machines_say_it() -> None:
    now = clock()
    pushed: list[tuple[str, str]] = []
    book = PlanBook(lambda title, body: pushed.append((title, body)), lambda: UTC, now)
    until = now.at + timedelta(hours=5)
    assert book.take("laptop", [_report(Provider.CLAUDE, "a1", now.at)]) == []
    book.announce(book.take("laptop", [_report(Provider.CLAUDE, "a1", now.at, until)]))
    book.announce(book.take("mac", [_report(Provider.CLAUDE, "a1", now.at, until)]))
    book.announce(book.take("laptop", [_report(Provider.CLAUDE, "a1", now.at, until + timedelta(minutes=1))]))
    assert pushed == [("Claude limited until 14:00", "Max plan, used on laptop: requests are refused until then.")]
    now.at = until + timedelta(minutes=2)  # that limit is over; a new one is news again
    book.announce(book.take("mac", [_report(Provider.CLAUDE, "a1", now.at, now.at + timedelta(days=2))]))
    assert len(pushed) == 2 and pushed[1][0] == "Claude limited until Wed 14:02"
    book.announce(book.take("mac", [_report(Provider.CODEX, "b2", now.at)]))  # near or at nothing: no push
    assert len(pushed) == 2


def test_the_book_lists_an_account_once_with_its_newest_report_and_every_machine() -> None:
    now = clock()
    book = PlanBook(clock=now)
    early = now.at - timedelta(minutes=4)
    book.take("laptop", [_report(Provider.CLAUDE, "a1", early), _report(Provider.CODEX, "b2", early)])
    book.take("mac", [_report(Provider.CLAUDE, "a1", now.at, now.at - timedelta(minutes=1))])  # a limit gone by
    claude, codex = book.accounts()
    assert [m.machine for m in claude.machines] == ["mac", "laptop"] and claude.observed_at == now.at
    assert claude.limited_until is None and [m.machine for m in codex.machines] == ["laptop"]
    book.take("laptop", [])  # signed out of both there
    assert [a.provider for a in book.accounts()] == [Provider.CLAUDE]
    book.forget("mac")
    assert book.accounts() == []


# --- the setting, and a node's report at its hub ----------------------------------------------------------------


def test_off_on_the_hub_stops_its_polling_and_forgets_what_it_read(make_app: Callable[..., FastAPI]) -> None:
    app = make_app()
    reader: PlanReader = app.state.plan_reader
    logins, api = FakeLogins(datetime.now(UTC)), FakeApi()
    reader.logins, reader.api = logins, api
    reader.tick()
    phone = _phone(app)
    (shown, _) = phone.get("/v1/plan-usage").json()["accounts"]
    assert shown["machines"][0]["machine"] == app.state.daemon_name
    phone.patch("/v1/settings", json={"values": {"plan_usage.enabled": False}})
    api.calls.clear()
    reader.tick()
    assert api.calls == [] and reader.reports() == [] and app.state.plan_book.accounts() == []
    phone.patch("/v1/settings", json={"values": {"plan_usage.enabled": True}})
    reader.tick()
    assert api.calls and len(phone.get("/v1/plan-usage").json()["accounts"]) == 2


def test_a_node_reads_only_while_its_hub_says_so(make_app: Callable[..., FastAPI]) -> None:
    from muxtower.nodes.store import Joined

    app = make_app()
    reader: PlanReader = app.state.plan_reader
    api = FakeApi()
    reader.logins, reader.api = FakeLogins(datetime.now(UTC)), api
    client = app.state.hub
    client.store.save(Joined(url="https://hub.example.test", name="mac", token="node-made-up"))
    reader.tick()
    assert api.calls == []  # its hub has not said (an older hub never does)
    client._told("plan_usage", {"enabled": True})
    reader.tick()
    assert api.calls
    client._told("plan_usage", {"enabled": False})
    api.calls.clear()
    reader.tick()
    assert api.calls == [] and reader.reports() == []


def test_a_nodes_report_is_listed_by_its_hub_and_one_it_cannot_read_is_dropped(
    make_app: Callable[..., FastAPI],
) -> None:
    import asyncio

    app = make_app()
    pushed: list[str] = []
    app.state.plan_book.push = lambda title, body: pushed.append(title)
    name, _ = app.state.nodes.claim("mac")
    at = datetime.now(UTC)
    limited = _report(Provider.CODEX, "b2", at, at + timedelta(hours=1))

    async def told() -> None:
        app.state.nodes.on_event(name, "plan_usage", PlanReports(reports=[limited]).model_dump(mode="json"))
        app.state.nodes.on_event(name, "plan_usage", {"reports": [{"provider": "gemini"}]})
        await asyncio.sleep(0.2)  # the push goes out beside the loop

    asyncio.run(told())
    (account,) = _phone(app).get("/v1/plan-usage").json()["accounts"]
    assert account["machines"][0]["machine"] == "mac" and account["limited_until"] is not None
    assert len(pushed) == 1 and pushed[0].startswith("Codex limited until")
