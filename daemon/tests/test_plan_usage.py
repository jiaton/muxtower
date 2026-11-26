"""Plan usage (`subscriptions/`): the contract the app reads, and the hub-wide setting that turns it off."""

from collections.abc import Callable
from datetime import UTC, datetime

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
