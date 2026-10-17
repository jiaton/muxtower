# AGENTS.md — daemon

Python package `muxtower`: one command, `muxtower`: `muxtower serve` runs the daemon (FastAPI), the other subcommands manage it locally. It owns agent sessions in tmux on a dedicated socket (`-L muxtower`), detects what each agent is waiting for (Claude Code HTTP hooks first, configurable screen rules as fallback), and exposes sessions, terminal I/O, approvals and Web Push over `/v1`. Talks to: tmux (libtmux), SQLite, Web Push endpoints. Design: `../docs/design.md`.

## Setup / Test / Run

- Install: `poetry install`
- Run the daemon (dev): `poetry run muxtower serve --dev` (binds `127.0.0.1:8731`, state in `./.dev-state/`); the app's `npm run dev` proxies to it
- Tests: `poetry run pytest`
- Lint/typecheck: `poetry run ruff check . && poetry run ruff format --check . && poetry run mypy src`
- Export the contract: `make contract` at the repo root

## Stack

- FastAPI · Python 3.11+ · raw `sqlite3` behind repository ports · Pydantic v2
- Background work: asyncio tasks started in the app lifespan (screen capture loop, push dispatcher); blocking tmux calls run in `asyncio.to_thread` with a timeout.

## Layering — domain folders + explicit ports

```
src/muxtower/
  sessions/   registry, create/rename/terminate
  terminal/   capture, input, resize, stream frames
  approval/   pending actions, approve/deny, auto-approve policy
  runtimes/   one adapter per agent (claude_code, codex, generic) + screen-rule engine + default rule TOMLs
  hooks/      ingest endpoints for agent hook events
  notify/     Web Push (VAPID, subscriptions, dispatcher)
  auth/       device tokens, pairing, request/WS auth dependencies
  infra/      tmux adapter (subprocess, argv only), SQLite (one shared connection) + migrations, event bus, audit log
  system/     health, /v1/me
  errors.py   domain errors (NotFound/Invalid/Conflict/Forbidden) mapped to HTTP in app.py
  origins.py  CORS + WebSocket Origin policy
  config.py   settings (TOML + MUXTOWER_* env)
  app.py      FastAPI factory: routers, CORS, lifespan, static UI
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
- One capture loop serves every consumer (list, stream, push, auto-approve) through a shared in-memory cache owned by `terminal/`; consumers never call tmux on their own cadence.
- Anything that sends keys re-reads live state immediately before sending.

## Auth & security

- No user accounts (see `../docs/design.md` → Auth). Every route except `GET /v1/health`, `POST /v1/pair/claim` and the static UI requires a valid device token; hook routes require that session's hook token.
- CORS: explicit `cors.allowed_origins` only, default empty, `allow_credentials=False`. WebSocket accepts only same-origin or listed `Origin`s.
- Tokens accepted as `Authorization: Bearer`, WS subprotocol `bearer.<token>`, or `?access_token=` (never `?token=`, which gates count as a guess); the access log filter redacts it. Every 401 the daemon sends carries `X-Muxtower-Auth`, so clients can tell a revoked token from a gate in front.
- Pairing claim is rate-limited and single-use; failed token checks are rate-limited per client IP.
- Never launch anything but a registered runtime binary; no shell strings from the API.
- Every mutating action writes an audit row (who = token name, what, session).

## Testing

- pytest + httpx `AsyncClient` against an app built by the factory with a temp state dir.
- tmux is replaced at the `TmuxPort` boundary by `tests/fakes.py` in unit tests; `tests/integration/` runs against a real tmux server on a throwaway socket (skipped when tmux is missing). Never touch the user's real tmux servers in tests.
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
