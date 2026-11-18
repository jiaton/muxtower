"""The settings the app may change: features only. What the daemon needs to start or what is secret
(host, port, public_url, proxies, CORS, pairing, tokens, provider keys, the hub link) is the config
file's alone, and is not listed here.

`now`: the running daemon reads it each time, so a change applies at once; `restart`: the services
that use it are built when the daemon starts, so a change applies then."""

from dataclasses import dataclass
from typing import Literal

Kind = Literal["choice", "bool", "number", "text", "args"]


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
    Field("archive.hide_after_days", "Archive", "List archived sessions for (days)", "number", "now",
          "older ones are kept, just not listed; 0: always listed"),
    Field("search.full_text", "Search", "Search inside conversations (Cmd+K)", "choice", "now",
          "prompts and replies are indexed on this machine, in its own file; auto: on, except on a node "
          "(a computer joined to a hub); off: the index is deleted", ("auto", "on", "off")),
    Field("listen.rounds", "Summaries", "Read aloud: earlier prompts given as context", "number", "now",
          "with what was said of each; 0: this turn only"),
    Field("listen.max_per_day", "Summaries", "Read aloud: summaries a day, at most", "number", "now"),
    Field("tts.provider", "Read aloud voice", "Voice made by", "choice", "now",
          "azure: Azure's neural voices, made on the hub (its key in the config file, tts.api_key_file); "
          "off: the phone's own voice", ("off", "azure")),
    Field("tts.region", "Read aloud voice", "Azure region", "text", "now", "the Speech resource's, e.g. eastus"),
    Field("tts.voice", "Read aloud voice", "Voice", "choice", "now", "", (
        "zh-CN-XiaoxiaoNeural", "zh-CN-XiaoyiNeural", "zh-CN-XiaochenNeural", "zh-CN-XiaohanNeural",
        "zh-CN-XiaomengNeural", "zh-CN-XiaomoNeural", "zh-CN-XiaoqiuNeural", "zh-CN-XiaoruiNeural",
        "zh-CN-XiaoshuangNeural", "zh-CN-XiaoxuanNeural", "zh-CN-XiaoyanNeural", "zh-CN-XiaozhenNeural",
        "zh-CN-YunxiNeural", "zh-CN-YunjianNeural", "zh-CN-YunyangNeural", "zh-CN-YunxiaNeural",
        "zh-CN-YunfengNeural", "zh-CN-YunhaoNeural", "zh-CN-YunyeNeural", "zh-CN-YunzeNeural")),
    Field("tts.style", "Read aloud voice", "Speaking style", "choice", "now",
          "empty: the voice's own; not every voice has every style",
          ("", "chat", "assistant", "customerservice", "cheerful", "calm", "gentle", "newscast")),
    Field("tts.monthly_soft_cap", "Read aloud voice", "Characters a month, at most", "number", "now",
          "then the phone's voice until the month turns (Azure's free tier: 500,000)"),
    Field("writes.window_minutes", "Teams", "Two sessions writing in one worktree: count writes of the last (minutes)",
          "number", "now", "file-editing tools only, not Bash"),
    Field("sessions.default_cwd", "New sessions", "Default folder", "text", "now",
          "where one starts when given no folder (~ is the home folder); empty, or no such folder: home"),
    Field("launch.claude_code_mode", "New sessions", "Claude Code permission mode", "choice", "now",
          "agent: its own settings (defaultMode)",
          ("agent", "plan", "default", "acceptEdits", "auto", "bypassPermissions")),
    Field("launch.claude_code_args", "New sessions", "Claude Code extra arguments", "args", "now"),
    Field("launch.codex_mode", "New sessions", "Codex permission mode", "choice", "now",
          "agent: its own config.toml", ("agent", "untrusted", "on-request", "full-auto", "full-access")),
    Field("launch.codex_args", "New sessions", "Codex extra arguments", "args", "now"),
    Field("launch.agents_may_escalate", "New sessions", "Agents may start sessions above the default mode", "bool",
          "now", "off: an agent's start_session never asks more than the default, nor bypass or full access"),
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
