from pydantic import BaseModel, Field


class Transcript(BaseModel):
    text: str
    language: str | None = Field(
        default=None, description="the language it was transcribed as (null: the provider detected it)"
    )
