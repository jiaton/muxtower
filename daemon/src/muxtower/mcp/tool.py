"""One MCP tool: its name, what it does, its arguments (a pydantic model) and what runs it."""

from collections.abc import Callable
from dataclasses import dataclass
from typing import Any

from pydantic import BaseModel


@dataclass
class Tool:
    name: str
    description: str
    args: type[BaseModel]
    run: Callable[[Any], str]

    def schema(self) -> dict[str, Any]:
        return {"name": self.name, "description": self.description, "inputSchema": self.args.model_json_schema()}
