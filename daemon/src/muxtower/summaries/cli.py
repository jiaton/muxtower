"""Summarizers that borrow a coding agent CLI already logged in on this machine (a Claude or ChatGPT
subscription), so no API key is needed. The reply goes in on stdin; nothing is run through a shell.

Both run in an empty working directory with every tool, setting source and MCP server they allow turned
off: a reply is untrusted text, and the summarizer must not be able to act on it."""

import os
import subprocess
import tempfile
from pathlib import Path

from muxtower.errors import Unavailable

MAX_OUTPUT = 1200


def _run(argv: list[str], text: str, cwd: Path, timeout: float) -> str:
    env = {k: v for k, v in os.environ.items() if not k.startswith(("TMUX", "MUXTOWER_"))}
    try:
        done = subprocess.run(  # noqa: S603 - argv from config, no shell
            argv, input=text, capture_output=True, text=True, cwd=cwd, env=env, timeout=timeout, check=False
        )
    except FileNotFoundError as exc:
        raise Unavailable(f"summarizer not installed: {argv[0]}") from exc
    except subprocess.TimeoutExpired as exc:
        raise Unavailable("summarizer timed out") from exc
    if done.returncode != 0:
        raise Unavailable(f"summarizer failed (exit {done.returncode})")
    return done.stdout.strip()[:MAX_OUTPUT]


class ClaudeCodeSummarizer:
    """`claude -p` with the machine's Claude login (no `--bare`: that one only takes an API key)."""

    def __init__(self, workdir: Path, binary: str = "claude", model: str = "haiku", timeout: float = 90) -> None:
        self.workdir, self.binary, self.model, self.timeout = workdir, binary, model, timeout

    def summarize(self, instructions: str, text: str) -> str:
        self.workdir.mkdir(parents=True, exist_ok=True)
        argv = [
            self.binary, "-p", "--model", self.model, "--no-session-persistence", "--setting-sources", "",
            "--strict-mcp-config", "--tools", "", "--system-prompt", instructions,
        ]  # fmt: skip
        return _run(argv, text, self.workdir, self.timeout)


class CodexSummarizer:
    """`codex exec` with the machine's ChatGPT login. Its read-only sandbox still lets the model read
    files, so the Claude Code summarizer is the default."""

    def __init__(self, workdir: Path, binary: str = "codex", model: str | None = None, timeout: float = 120) -> None:
        self.workdir, self.binary, self.model, self.timeout = workdir, binary, model, timeout

    def summarize(self, instructions: str, text: str) -> str:
        self.workdir.mkdir(parents=True, exist_ok=True)
        with tempfile.TemporaryDirectory(dir=self.workdir) as tmp:
            out = Path(tmp) / "summary.txt"
            argv = [
                self.binary, "exec", "--ephemeral", "--skip-git-repo-check", "--ignore-user-config", "--ignore-rules",
                "-s", "read-only", "-o", str(out), *(["-m", self.model] if self.model else []),
                f"{instructions}\n\nThe reply is in the <stdin> block.",
            ]  # fmt: skip
            _run(argv, text, Path(tmp), self.timeout)
            return out.read_text().strip()[:MAX_OUTPUT] if out.exists() else ""
