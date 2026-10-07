from pydantic import BaseModel, Field

from muxtower.runtimes.models import AgentState


class Approve(BaseModel):
    option: str | None = Field(default=None, description="option key to pick; default per runtime rules")


class ApprovalResult(BaseModel):
    session_id: str
    state: AgentState
    option: str | None
