"""Plan usage, put together: this machine's reader, the book of every machine's plans, and who tells whom.

On the hub (or a daemon on its own) the reader follows the setting and fills the book with this machine's
plans, and the nodes' come in over their links. On a node it follows the hub's word (`nodes/client.py`)
and its link sends what it read (`nodes/session.py`)."""

from pathlib import Path
from typing import Any
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from muxtower.config import Settings
from muxtower.nodes.api import NodeApi
from muxtower.nodes.client import HubClient
from muxtower.nodes.hub import Nodes
from muxtower.notify.service import PushService
from muxtower.settings.service import SettingsService
from muxtower.sources.remote_control.service import RemoteControlSource
from muxtower.subscriptions.credentials import CliLogins
from muxtower.subscriptions.provider_client import ProviderClient
from muxtower.subscriptions.reader import PlanReader
from muxtower.subscriptions.service import PlanBook

SETTING = "plan_usage.enabled"


def _zone(name: str) -> ZoneInfo | None:
    try:
        return ZoneInfo(name) if name else None
    except (ZoneInfoNotFoundError, ValueError):
        return None


def wire_plan_usage(
    settings: Settings, daemon_name: str, hub: HubClient, nodes: Nodes, node_api: NodeApi,
    feature_settings: SettingsService, push: PushService, remote_control: RemoteControlSource | None,
) -> tuple[PlanReader, PlanBook]:  # fmt: skip
    def enabled() -> bool:  # blocking: whether this daemon is a node is read from its file
        if hub.store.load() is not None:
            return hub.plan_usage is True
        return settings.plan_usage.enabled

    reader = PlanReader(CliLogins(Path.home()), ProviderClient(), enabled)
    book = PlanBook(push.notify_plan, lambda: _zone(settings.inbox.timezone))
    reader.changed.append(lambda: book.announce(book.take(daemon_name, reader.reports())))
    nodes.plans = lambda name, data: book.heard(name, data) if settings.plan_usage.enabled else None  # a late one
    nodes.removed.append(book.forget)
    node_api.plans = reader
    hub.plan_usage_told.append(reader.wake)
    if remote_control is not None:
        remote_control.on_limit = reader.limited

    def changed(key: str, value: Any) -> None:
        if key != SETTING:
            return
        if not value:
            book.clear()
        nodes.tell_all("plan_usage", {"enabled": bool(value)})
        reader.wake()

    feature_settings.listeners.append(changed)
    return reader, book
