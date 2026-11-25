"""What Continue in terminal says of a session: whether it can be continued, and how far it got."""

from enum import StrEnum

from pydantic import BaseModel, Field


class ContinueStep(StrEnum):
    READY = "ready"  # it can be continued
    BLOCKED = "blocked"  # it cannot, now (`reason`): nothing was done
    CLOSING = "closing"  # being archived on the Claude account (the desktop app, claude.ai, the phone)
    STARTING = "starting"  # closed there; being resumed in a pane on its machine
    DONE = "done"  # it runs in that pane (`session_id`)
    FAILED = "failed"  # stopped (`reason`); `retry`: closed already, POST again starts it


class Continuation(BaseModel):
    step: ContinueStep
    reason: str | None = Field(default=None, description="blocked or failed: why, said to the owner")
    machine: str | None = Field(default=None, description="the machine it is continued on")
    session_id: str | None = Field(default=None, description="done: the pane session it is now")
    retry: bool = Field(
        default=False, description="failed after it was closed on the Claude account: POST again starts it"
    )
