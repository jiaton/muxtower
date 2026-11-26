"""This machine's plans, read every five minutes from the providers with the CLIs' own sign-ins.

Each poll reads the sign-ins again (`credentials.py`) and keeps them only for the poll. A token that has expired, or
expires within two minutes, is not used: the CLI signs in again itself (never this: a refresh here would sign
Claude Code out), and the last reading stays, with its time. Anything that fails keeps the last reading too, and is
logged without the token. A provider not signed in here is left out. While the setting is off nothing is read and
nothing is kept (a node follows its hub's setting: `nodes/client.py`)."""

import asyncio
import logging
import threading
from collections.abc import Callable
from datetime import UTC, datetime, timedelta

from muxtower.errors import Unavailable
from muxtower.subscriptions.credentials import Unreadable
from muxtower.subscriptions.models import PlanReport, Provider
from muxtower.subscriptions.parse import (
    account_key,
    claude_org,
    claude_windows,
    codex_plan,
    codex_windows,
    limited_by,
)
from muxtower.subscriptions.ports import ClaudeLogin, CodexLogin, LoginPort, PlanApiPort, Secret
from muxtower.subscriptions.provider_client import redact

logger = logging.getLogger("muxtower.plan_usage")

POLL_SECONDS = 300.0
MARGIN = timedelta(minutes=2)  # a token with less left than this is not used


class PlanReader:
    def __init__(
        self, logins: LoginPort, api: PlanApiPort, enabled: Callable[[], bool],
        clock: Callable[[], datetime] = lambda: datetime.now(UTC),
    ) -> None:  # fmt: skip
        self.logins = logins
        self.api = api
        self.enabled = enabled  # blocking (a node reads whether it is one): called off the event loop
        self.clock = clock
        self.changed: list[Callable[[], None]] = []  # after each change, on the polling thread
        self.version = 0  # one more on each change: a node's link sends the reports again (`nodes/session.py`)
        self._lock = threading.Lock()
        self._read: dict[Provider, PlanReport] = {}
        self._limit: datetime | None = None  # Claude's, from a session's rate_limit_event (`limited`)
        self._unsaid = False  # changed outside a poll (`limited`): the listeners are told by the loop's thread
        self._loop: asyncio.AbstractEventLoop | None = None
        self._wake: asyncio.Event | None = None

    def reports(self) -> list[PlanReport]:
        now = self.clock()
        with self._lock:
            read, event_limit = dict(self._read), self._limit
        reports = []
        for provider, report in sorted(read.items()):
            limits = [limited_by(report.windows), event_limit if provider == Provider.CLAUDE else None]
            until = max((u for u in limits if u is not None and u > now), default=None)
            reports.append(report.model_copy(update={"limited_until": until}))
        return reports

    # --- reading (blocking) --------------------------------------------------------------------

    def tick(self) -> None:
        """One poll when the setting is on; when off, forgets what it read."""
        with self._lock:
            unsaid, self._unsaid = self._unsaid, False
        if unsaid:
            self._changed()
        if not self.enabled():
            with self._lock:
                had = bool(self._read) or self._limit is not None
                self._read, self._limit = {}, None
            if had:
                self._changed()
            return
        self.poll()

    def poll(self) -> None:
        before = self.version
        for provider, read in ((Provider.CLAUDE, self._claude), (Provider.CODEX, self._codex)):
            try:
                report = read()
            except _Keep:
                continue
            with self._lock:
                if report is None:
                    if self._read.pop(provider, None) is None:
                        continue
                else:
                    self._read[provider] = report
                self.version += 1
        if self.version != before:
            self._changed()

    def limited(self, refused: bool, until: datetime | None) -> None:
        """A Claude session here was refused for the plan's limit (until then), or let through again. Called
        under its source's lock: only noted here; the loop reads again and tells the listeners."""
        now = self.clock()
        limit = until if refused and until is not None and until > now else None
        with self._lock:
            if limit == self._limit or (refused and limit is None):
                return
            self._limit = limit
            self.version += 1
            self._unsaid = True
        self.wake()

    def _changed(self) -> None:
        for listener in self.changed:
            try:
                listener()
            except Exception:
                logger.exception("plan usage: a listener failed")

    def _usable(self, provider: Provider, expires_at: datetime | None) -> bool:
        if expires_at is not None and expires_at - self.clock() < MARGIN:
            logger.debug("plan usage: %s's sign-in expires within %s; kept the last reading", provider, MARGIN)
            return False
        return True

    def _claude(self) -> PlanReport | None:
        login: ClaudeLogin | None = _login(self.logins.claude, Provider.CLAUDE)
        if login is None:
            return None
        if not self._usable(Provider.CLAUDE, login.expires_at):
            raise _Keep
        usage, profile = _ask(login.token, Provider.CLAUDE, self.api.claude_usage, self.api.claude_profile)
        org = claude_org(profile)
        if org is None:
            logger.info("plan usage: claude's profile names no organization; kept the last reading")
            raise _Keep
        return PlanReport(
            provider=Provider.CLAUDE, account=account_key(Provider.CLAUDE, org), plan=login.plan,
            windows=claude_windows(usage), observed_at=self.clock(),
        )  # fmt: skip

    def _codex(self) -> PlanReport | None:
        login: CodexLogin | None = _login(self.logins.codex, Provider.CODEX)
        if login is None:
            return None
        if not self._usable(Provider.CODEX, login.expires_at):
            raise _Keep
        (usage,) = _ask(login.token, Provider.CODEX, lambda token: self.api.codex_usage(token, login.account_id))
        return PlanReport(
            provider=Provider.CODEX, account=account_key(Provider.CODEX, login.account_id),
            plan=codex_plan(usage) or login.plan, windows=codex_windows(usage), observed_at=self.clock(),
        )  # fmt: skip

    # --- the loop --------------------------------------------------------------------------------

    async def run_loop(self) -> None:
        self._loop, self._wake = asyncio.get_running_loop(), asyncio.Event()
        while True:
            self._wake.clear()
            await asyncio.to_thread(self.tick)
            try:
                await asyncio.wait_for(self._wake.wait(), POLL_SECONDS)
            except TimeoutError:
                pass

    def wake(self) -> None:
        """From any thread: poll now (the setting changed)."""
        if self._loop is not None and self._wake is not None:
            self._loop.call_soon_threadsafe(self._wake.set)


class _Keep(Exception):
    """Keep the last reading of this provider."""


def _login[L](read: Callable[[], L | None], provider: Provider) -> L | None:
    try:
        return read()
    except Unreadable as exc:
        logger.info("plan usage: %s's sign-in is unreadable now (%s); kept the last reading", provider, exc)
        raise _Keep from None


def _ask(token: Secret, provider: Provider, *asks: Callable[[Secret], object]) -> list[object]:
    answers = []
    for ask in asks:
        try:
            answers.append(ask(token))
        except Unavailable as exc:
            logger.info("plan usage: %s: %s; kept the last reading", provider, redact(str(exc), token))
            raise _Keep from None
        except Exception as exc:  # noqa: BLE001 - never the traceback: its text may carry what was sent
            logger.warning("plan usage: %s failed: %s", provider, redact(f"{type(exc).__name__}: {exc}", token))
            raise _Keep from None
    return answers
