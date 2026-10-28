from pydantic import BaseModel, Field

from muxtower.runtimes.models import AgentState

Answers = list[list[str]]  # the labels picked for each question of a prompt, in order


class Approve(BaseModel):
    option: str | None = Field(default=None, description="option key to pick; default per runtime rules")
    answers: Answers | None = Field(
        default=None, description="for a prompt with `questions`: the labels picked for each question, in order"
    )


class ApprovalResult(BaseModel):
    session_id: str
    state: AgentState
    option: str | None
