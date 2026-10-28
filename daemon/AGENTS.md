# AGENTS.md — daemon

Python package `muxtower`: one command, `muxtower`: `muxtower serve` runs the daemon (FastAPI), the other subcommands manage it locally. It owns agent sessions in tmux on a dedicated socket (`-L muxtower`), detects what each agent is waiting for (the agent's hooks first — Claude Code, Codex — configurable screen rules as fallback), and exposes sessions, terminal I/O, approvals and Web Push over `/v1`. Optional session sources add sessions it reaches another way (Claude Code Remote Control). Talks to: tmux (subprocess, argv only), SQLite, Web Push endpoints, and when configured: Anthropic's Remote Control API, a speech-to-text provider (Groq/OpenAI), and the `claude`/`codex` CLI for reply summaries. Design: `../docs/design.md`.

## Setup / Test / Run

- Install: `poetry install`
- Run the daemon (dev): `poetry run muxtower serve --dev` (binds `127.0.0.1:8731`, state in `./.dev-state/`); the app's `npm run dev` proxies to it
- Tests: `poetry run pytest`
- Lint/typecheck: `poetry run ruff check . && poetry run ruff format --check . && poetry run mypy src`
- Export the contract: `make contract` at the repo root

## Stack

- FastAPI · Python 3.11+ · raw `sqlite3` behind repository ports · Pydantic v2
- Background work: asyncio tasks started in the app lifespan (screen capture loop, push dispatcher, one poll loop per session source); blocking tmux and HTTP calls run in `asyncio.to_thread` with a timeout.

## Layering — domain folders + explicit ports

```
src/muxtower/
  sessions/   registry, create/rename/terminate; directory.py: every session across sources, dispatch by capabilities;
              claude_processes.py: links a pane's Claude Code to its Remote Control session (one entry per agent)
              and to its transcript; transcripts.py: a tmux session's conversation, read from that transcript;
              marks.py: the owner's marks (unread, hidden, notify level); decorate.py: what the directory fills in; archive.py / archiving.py: archived sessions (ended, kept
              to read); placement.py: where the owner says a session runs; merged.py: a tmux pane and its Remote Control session as one entry; turns.py: finished turns
  agents/     agent plugins beyond the terminal: which session a pane runs, its transcript format
              (processes.py asks each in turn; codex/ here, Claude Code's in sessions/ for now; a plugin may
              use the pane's screen to tell agents of one folder apart);
              accounts.py: the account each agent here runs as
  sources/    other session sources, one folder each (remote_control: Anthropic's Remote Control API;
              codex: Codex threads run headless in muxtower's own Codex app-server, and, as shared.py,
              the threads of the app-server Codex's own clients share on this machine: Remote Control for Codex)
  nodes/      other daemons joined to this one (hub and nodes): as a hub, hub.py (who joined, their last
              report), source.py (their sessions as one more source), directory.py (what else goes to a
              node), processes.py (where the hub's Remote Control sessions run), link.py; as a node,
              client.py (join, reconnect), session.py (one open link), api.py (what the hub may do
              here), update.py (installing the hub's version from PyPI), store.py; protocol.py: the
              frames between them; routes.py
  summaries/  short versions of long replies: a Summarizer port (claude/codex CLI adapters), SQLite cache, background loop
  asr/        speech to text for voice replies: a Transcriber port (OpenAI-compatible adapter: Groq, OpenAI)
  concierge/  the owner's assistant: a Claude Code session kept running, its MCP config, watched sessions
  mcp/        MCP over HTTP at /v1/mcp (JSON-RPC, JSON responses): tools to list, read, message, approve sessions
              (describe.py: how a session is said: device, what reaches it, harness)
  terminal/   capture, input, resize, stream frames
  approval/   pending actions, approve/deny, auto-approve policy
  runtimes/   one adapter per agent (claude_code, codex, generic) + screen-rule engine + default rule TOMLs
  hooks/      agent hooks: one harness per agent (ports.py HookHarness; claude_code.py, codex.py, listed in
              harnesses.py), the shared event vocabulary and state (events.py), the stdlib-only relay
              for command hooks (relay.py), the ingest endpoint
  notify/     Web Push (VAPID, subscriptions, dispatcher)
  auth/       device tokens, pairing, request/WS auth dependencies
  infra/      tmux adapter (subprocess, argv only), SQLite (one shared connection) + migrations, event bus, audit log
  system/     health, /v1/me
  vendor/     third-party code copied in (with LICENSE + VENDORED.md); only adapters import it; not linted
  agent_text.py  one-line descriptions of tool inputs, shared by hooks and sources
  claude_conversation.py  Claude Code's event log → conversation items, shared by Remote Control and transcripts
  claude_next_step.py     Claude desktop's next-step box (its `wrap_up` tool call) → a `next_step` item with replies to pick
  errors.py   domain errors (NotFound/Invalid/Conflict/Forbidden) mapped to HTTP in app.py
  origins.py  CORS + WebSocket Origin policy
  config.py   settings (TOML + MUXTOWER_* env)
  app.py      FastAPI factory: routers, CORS, lifespan, static UI
  web.py      the bundled web app at /, and the glasses app at /g2/
  cli/        the `muxtower` entry point and its subcommands
```

Each domain folder keeps four roles in separate files: `routes.py` (parse, call service, shape response), `service.py` (logic; never imports FastAPI request/response or a concrete driver), `ports.py` (Protocols), and adapters (`repository.py` / `*_client.py`, the only code touching SQLite, tmux or the network). Services get their ports injected through FastAPI dependencies built in `app.py`; no module-level mutable state (no global `enabled` flags, no module-level caches), so tests can build an isolated app.

Split a file past 250 lines or once it mixes two domains.

## FE/BE type contract

- `/openapi.json` from FastAPI is the source of truth; `openapi.json` at the repo root is its committed export; the app generates types with `openapi-typescript` and calls through `openapi-fetch`.
- CI regenerates and fails on diff (`make contract-check`).
- Request/response bodies are Pydantic models, never raw dicts. No `dict[str, Any]` fields (they collapse to `Record<string, never>`); give them a model. Enums are `StrEnum` and must show up as string unions in the generated types — check the output when adding one.
- WebSocket frames are Pydantic models too, listed in the schema through a `GET /v1/stream/schema` route so they reach the generated types.

## Data access rules

- All SQL parameterized. Never interpolate anything into a query.
- Schema changes only through numbered migrations in `infra/migrations/`; the daemon applies them at startup.
- No per-user tables: one daemon = one owner. Device tokens are stored hashed (sha256), never in plaintext.

## Background work

- A loop's stop reason is distinguishable: crashed (logged with traceback by a done-callback), cancelled at shutdown, or finished.
- One capture loop serves every consumer (list, stream, push, auto-approve) through a shared in-memory cache owned by `terminal/`; consumers never call tmux on their own cadence. A session source works the same way: one poll loop fills its cache, everything else reads it. A cache shared by a loop thread and request threads is guarded by a lock that is never held across I/O.
- A source routes nothing itself: `sessions/directory.py` checks capabilities and dispatches; routes call the directory, never a source.
- Anything that sends keys or answers a prompt re-reads live state immediately before sending.
- Adapters translate their client's failures into domain errors (`Unavailable` → 502 for an upstream failure); vendor or httpx exceptions never reach a route.

## Auth & security

- No user accounts (see `../docs/design.md` → Auth). Every route except `GET /v1/health`, `POST /v1/pair/claim`, `POST /v1/nodes/claim` and the static UI requires a valid device token; hook routes require that session's hook token; `/v1/nodes/link` requires a node token, which opens nothing else.
- CORS: `cors.allowed_origins` defaults to `*` (safe: bearer tokens only, `allow_credentials=False`); allowed request headers are `Authorization`, `Content-Type` and the opt-in `cors.extra_headers` (a gate's credential header). WebSocket accepts same-origin or listed `Origin`s (any by default).
- Tokens accepted as `Authorization: Bearer`, WS subprotocol `bearer.<token>`, or `?access_token=` (never `?token=`, which gates count as a guess); the access log filter redacts it. Every 401 the daemon sends carries `X-Muxtower-Auth`, so clients can tell a revoked token from a gate in front.
- Pairing claim is rate-limited and single-use; failed token checks are rate-limited per client IP.
- Never launch anything but a registered runtime binary (or the configured summarizer CLI); no shell strings from the API.
- Text from agents is untrusted: a summarizer runs with no tools, settings or MCP servers, in an empty directory, and gets the text on stdin.
- MCP tools act with the calling device's token and every call is audited (`mcp:<tool>`). The concierge gets its own token, minted at each start and written only into its 0600 MCP config.
- Provider keys (speech to text) stay on the daemon; transcripts and recordings are never logged or stored.
- Every mutating action writes an audit row (who = token name, what, session).

## Testing

- pytest + httpx `AsyncClient` against an app built by the factory with a temp state dir.
- tmux is replaced at the `TmuxPort` boundary by `tests/fakes.py`, Remote Control at `RemoteControlPort` by `tests/rc_fakes.py`, in unit tests; tests never call Anthropic. `tests/integration/` runs against a real tmux server on a throwaway socket (skipped when tmux is missing). Never touch the user's real tmux servers in tests.
- Screen rules are tested against screen samples in `tests/screens.py`, shaped like real captures (no side borders, full-width separators); a new rule or a rule fix adds a sample. Never commit a real capture: it contains someone's conversation.
- A bug fixed gets a regression test.

## Forbidden

- String-interpolated SQL.
- Business logic in `routes.py`.
- A service importing libtmux, sqlite3, pywebpush or httpx directly instead of its port.
- Module-level mutable state shared across requests or tests.
- Raw dict request/response bodies.
- `except: pass` or a bare `except Exception` without logging.
- Secrets or tokens in logs, error messages, or git history.
- Hard-coded screen regexes in Python — screen rules live in the runtime TOMLs.
- Personal names, hosts or predecessor-project references anywhere (see root `AGENTS.md`).
