"""Building the optional adapters and services from settings: what is on, and with which backend."""

import logging
import secrets
import shutil

from muxtower.asr.openai_compatible import OpenAICompatibleTranscriber
from muxtower.asr.service import AsrService
from muxtower.auth.repository import SqliteTokenRepository
from muxtower.auth.service import TokenService
from muxtower.config import Settings
from muxtower.infra.db import Database
from muxtower.sources.codex.adapter import CodexAppServer, SharedAppServer, default_socket, shared_socket
from muxtower.sources.codex.service import CodexSource
from muxtower.sources.codex.shared import SharedCodexSource
from muxtower.sources.codex.store import FileThreadStore
from muxtower.sources.remote_control.service import RemoteControlSource
from muxtower.summaries.cli import ClaudeCodeSummarizer, CodexSummarizer
from muxtower.summaries.ports import Summarizer
from muxtower.summaries.repository import SqliteSummaryRepository
from muxtower.summaries.service import SummaryService

logger = logging.getLogger("muxtower")

CLI_TOKEN_NAME = "local-cli"  # noqa: S105 - a device name, not a secret


def local_cli_token(settings: Settings) -> str:
    """Token the `muxtower` command uses to talk to a daemon on the same machine (file mode 0600)."""
    path = settings.state_dir / "cli-token"
    if not path.exists():
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(secrets.token_urlsafe(32))
        path.chmod(0o600)
    return path.read_text().strip()


def build_token_service(settings: Settings, db: Database | None = None) -> TokenService:
    db = db or Database(settings.db_path)
    db.migrate()
    extra = {CLI_TOKEN_NAME: local_cli_token(settings)}
    if settings.pairing.shared_token:
        extra["shared"] = settings.pairing.shared_token
    return TokenService(SqliteTokenRepository(db), extra)


def build_remote_control(settings: Settings) -> RemoteControlSource | None:
    rc = settings.remote_control
    if not rc.enabled:
        return None
    from muxtower.sources.remote_control.adapter import AnthropicRemoteControl  # only when enabled

    return RemoteControlSource(AnthropicRemoteControl(rc.credentials_path, rc.config_path), rc.environments)


def build_summaries(settings: Settings, db: Database) -> SummaryService:
    cfg = settings.summaries
    workdir = settings.state_dir / "summarizer"  # empty: no project instructions for the summarizer
    summarizer: Summarizer | None = None
    if cfg.provider == "claude-code":
        summarizer = ClaudeCodeSummarizer(workdir, cfg.binary or "claude", cfg.model or "haiku", cfg.timeout_seconds)
    elif cfg.provider == "codex":
        summarizer = CodexSummarizer(workdir, cfg.binary or "codex", cfg.model, cfg.timeout_seconds)
    return SummaryService(summarizer, SqliteSummaryRepository(db), cfg.min_chars)


def build_asr(settings: Settings) -> AsrService:
    cfg = settings.asr
    key = cfg.key()
    if cfg.provider == "off":
        return AsrService(None, cfg.language)
    if not key:
        logger.warning("asr.provider is %s but no API key is set; voice is off", cfg.provider)
        return AsrService(None, cfg.language)
    return AsrService(OpenAICompatibleTranscriber(cfg.provider, key, cfg.model), cfg.language, cfg.prompt)


def build_codex(settings: Settings) -> CodexSource | None:
    """Codex threads run headless in muxtower's own app-server, when on and Codex is installed."""
    cfg = settings.codex
    if not cfg.headless or shutil.which(cfg.binary) is None:
        return None
    home = settings.state_dir / "codex"
    server = CodexAppServer(cfg.binary, default_socket(settings.state_dir), home / "app-server.log")
    options = {
        "sandbox": cfg.sandbox,
        "approvalPolicy": cfg.approval_policy,
        **({"model": cfg.model} if cfg.model else {}),
    }
    return CodexSource(server, FileThreadStore(home / "threads.json"), options)


def build_codex_shared(settings: Settings) -> SharedCodexSource | None:
    """The Codex threads of this machine's own Codex clients, when asked for and Codex is installed."""
    cfg = settings.codex
    if not cfg.shared or shutil.which(cfg.binary) is None:
        return None
    return SharedCodexSource(SharedAppServer(shared_socket()))
