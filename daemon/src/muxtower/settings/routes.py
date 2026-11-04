from typing import Any

from fastapi import APIRouter, Query, Request
from pydantic import BaseModel, Field

from muxtower.auth.deps import CurrentDevice
from muxtower.errors import Conflict, Invalid
from muxtower.settings.service import SettingsService, SettingView

router = APIRouter(prefix="/v1", tags=["settings"])

NodeName = Query(default=None, description="a node of this hub: its settings, over the link, instead of this daemon's")


class MachineSettings(BaseModel):
    machine: str
    settings: list[SettingView]


class ChangeSettings(BaseModel):
    values: dict[str, Any] = Field(description="dotted key → value; null puts it back to its default", min_length=1)


def _on_node(request: Request, node: str, method: str, params: dict[str, Any]) -> list[SettingView]:
    try:
        result = request.app.state.node_sessions.call(node, method, params)
    except Invalid as exc:
        if "unknown method" in str(exc):
            raise Conflict(f"{node} runs a muxtower without settings in the app; update it first") from exc
        raise
    return [SettingView.model_validate(s) for s in result]


@router.get("/settings")
def get_settings(request: Request, _: CurrentDevice, node: str | None = NodeName) -> MachineSettings:
    """The features the app may change, with where each value comes from and when a change applies."""
    if node:
        return MachineSettings(machine=node, settings=_on_node(request, node, "settings", {}))
    service: SettingsService = request.app.state.feature_settings
    return MachineSettings(machine=request.app.state.daemon_name, settings=service.views())


@router.patch("/settings")
def change_settings(
    body: ChangeSettings, request: Request, device: CurrentDevice, node: str | None = NodeName
) -> MachineSettings:
    """Changes some (all or none); a key the config file sets is refused. Each change is audited."""
    if node:
        listed = _on_node(request, node, "set_settings", {"values": body.values, "actor": device.name})
        request.app.state.audit.record(device.name, "settings", None, f"on {node}: {', '.join(body.values)}")
        return MachineSettings(machine=node, settings=listed)
    service: SettingsService = request.app.state.feature_settings
    return MachineSettings(machine=request.app.state.daemon_name, settings=service.change(body.values, device.name))
