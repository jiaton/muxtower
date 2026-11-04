"""The settings the app may change: features only. What the daemon needs to start or what is secret
(host, port, public_url, proxies, CORS, pairing, tokens, provider keys, the hub link) is the config
file's alone, and is not listed here.

`now`: the running daemon reads it each time, so a change applies at once; `restart`: the services
that use it are built when the daemon starts, so a change applies then."""

from dataclasses import dataclass
from typing import Literal

Kind = Literal["choice", "bool", "number", "text"]


@dataclass(frozen=True)
class Field:
    key: str  # dotted, as in the config file: `recovery.mode` is `[recovery] mode`
    section: str
    label: str
    kind: Kind
    applies: Literal["now", "restart"]
    help: str = ""
    choices: tuple[str, ...] = ()


FIELDS: tuple[Field, ...] = (
    Field("recovery.mode", "After a restart", "Interrupted sessions", "choice", "now",
          "ask: listed to start again; auto: started again at once; off: let go", ("ask", "auto", "off")),
    Field("concierge.enabled", "Concierge", "Concierge", "bool", "restart",
          "a session that watches the others for you"),
    Field("concierge.name", "Concierge", "Name", "text", "restart"),
    Field("concierge.model", "Concierge", "Model", "text", "restart", "e.g. sonnet or opus"),
    Field("summaries.provider", "Summaries", "Summarize replies with", "choice", "restart",
          "a long reply is shortened by this agent's CLI", ("off", "claude-code", "codex")),
    Field("summaries.model", "Summaries", "Model", "text", "restart", "empty: the CLI's default"),
    Field("summaries.min_chars", "Summaries", "Summarize replies longer than (characters)", "number", "restart"),
    Field("summaries.eager", "Summaries", "Also when a session starts needing you", "bool", "restart"),
    Field("asr.provider", "Voice input", "Speech recognition", "choice", "restart",
          "its API key is set in the config file", ("off", "groq", "openai")),
    Field("asr.model", "Voice input", "Model", "text", "restart", "empty: the provider's default"),
    Field("asr.language", "Voice input", "Language", "text", "restart", "e.g. zh; empty: detected per recording"),
    Field("remote_control.enabled", "Remote Control", "List Remote Control sessions", "bool", "restart"),
    Field("remote_control.poll_seconds", "Remote Control", "Look every (seconds)", "number", "restart"),
    Field("codex.headless", "Codex", "Headless Codex sessions", "bool", "restart"),
    Field("codex.sandbox", "Codex", "Sandbox", "choice", "restart", "",
          ("read-only", "workspace-write", "danger-full-access")),
    Field("codex.approval_policy", "Codex", "Ask before", "choice", "restart", "",
          ("untrusted", "on-request", "never")),
    Field("codex.model", "Codex", "Model", "text", "restart", "empty: Codex's default"),
    Field("usage.cpu_percent", "Usage alerts", "CPU above (% of one core, 1 min)", "number", "now"),
    Field("usage.tick_ms", "Usage alerts", "Screen capture slower than (ms)", "number", "now"),
    Field("usage.rss_mb", "Usage alerts", "Memory above (MB)", "number", "now"),
)  # fmt: skip

BY_KEY = {f.key: f for f in FIELDS}
