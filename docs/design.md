# muxtower design

muxtower lets coding agents running in tmux on a remote machine be approved and driven from a phone. It is server-side and headless: `muxtower serve` runs next to the agents, exposes a typed HTTP + WebSocket API behind a single Bearer token, and is meant to sit behind any reverse proxy. The web app is a client of that API, nothing more.

## Pieces

| piece | what | ships as |
|---|---|---|
| `muxtower` | the one command. `muxtower serve` runs the daemon (session registry, state detection, approvals, push, API); `muxtower run`, `token`, `pair` manage it locally. `muxtower run` starts the daemon in the background if it is not running | console script in the `muxtower` Python package |
| `muxtower-app` | PWA client (Vite + React); talks to one or many daemons | built into the wheel and served by `muxtower serve` at `/`; also a standalone static build / container |

`pipx install muxtower` gives a working daemon **and** UI. The bundled UI is the recommended way to use it (same origin as the API, no CORS, works on plain-HTTP LANs). A separately hosted app is supported for people who want one UI across several daemons.

## Sessions

- A session is one agent process in its own tmux session on a dedicated socket (`-L muxtower`), started by `muxtower run <agent> [args]` or `POST /v1/sessions`. Only binaries from the runtime registry may be launched; the API never takes a shell string.
- The launcher sets `MUXTOWER_SESSION_ID` and a per-session `MUXTOWER_HOOK_TOKEN` in the tmux environment, so hooks fired by the agent can be tied back to the session.
- Registry, device tokens, push subscriptions and the audit log live in one SQLite file under `$XDG_STATE_HOME/muxtower/` (default `~/.local/state/muxtower/`). Config lives in `$XDG_CONFIG_HOME/muxtower/config.toml`, every key overridable by a `MUXTOWER_*` env var.

## State detection: runtime adapters

Each agent runtime is an adapter implementing one port:

```
detect(session) -> State            # current coarse state
pending(session) -> PendingAction?  # what is being asked, if anything
approve(session, option) / deny(session)
```

Sources, in priority order:

1. **Structured events (primary).** For Claude Code, the launcher passes `--settings` with `type: "http"` hooks pointing at `POST /v1/hooks/claude-code` (header `Authorization: Bearer ${MUXTOWER_HOOK_TOKEN}`, `allowedEnvVars` set). Nothing is written into the user's own `settings.json`. Events used:
   - `PermissionRequest` → state `needs_permission`, with `tool_name` / `tool_input` / `permission_rule` shown on the phone. The daemon answers immediately with an empty body (v0.1: report only, the dialog still appears in the terminal and is answered by keystroke). Holding the request open and answering `allow`/`deny` from the phone is a later, opt-in mode.
   - `Notification` (`permission_prompt`, `idle_prompt`, `elicitation_dialog`, `agent_needs_input`) → needs-attention states.
   - `PreToolUse` / `PostToolUse` → `busy`; `Stop` → `idle` + `last_assistant_message` (replaces scraping the reply off the screen); `SessionStart` / `SessionEnd` → lifecycle.
2. **Screen rules (fallback / custom).** A capture-pane loop classifies the screen with an ordered rule list loaded from TOML (`runtimes/<name>.toml` shipped as defaults, overridden by `$XDG_CONFIG_HOME/muxtower/runtimes/<name>.toml`). Rules are data, not code: regex, resulting state, optional "option picker" regex for numbered choices, the keys to send for approve/deny. Used when a runtime has no hooks, a hook has not fired yet, or a user's theme/harness version differs. `muxtower rules test <session>` prints which rule matches the live screen.

Approval is always explicit: approve re-reads the live state right before sending keys and refuses (409) when nothing approvable is on screen. Auto-approve is a per-session policy (`off` by default), never inferred.

## API

- Versioned under `/v1`. FastAPI's OpenAPI schema is exported to `openapi.json` at the repo root and is the contract for the app (`openapi-typescript` + `openapi-fetch`); CI fails if it is stale.
- One WebSocket, `/v1/stream`: the client sends `subscribe` messages (`sessions`, `screen:<id>`), the server pushes typed frames. Replaces one socket per pane.
- Health: `GET /v1/health` is public and returns only `{status, version}`.

## Auth

- **Tokens.** Named, revocable device tokens (`muxtower token add phone`, `token list`, `token revoke`), stored hashed. One token is enough to run it; several are there so a lost phone can be revoked alone.
- **Transport.** HTTP: `Authorization: Bearer`. WebSocket (browsers cannot set headers): `Sec-WebSocket-Protocol: muxtower, bearer.<token>` preferred, `?token=` accepted for proxies that only pass query tokens. Logs never include either.
- **Pairing.** `muxtower pair` opens a 10-minute window and prints a QR code in the terminal for `<app-url>/pair#u=<daemon-url>&c=<one-time-code>`. The fragment never reaches a server. The app redeems the code at `POST /v1/pair/claim` for a device token. `pairing.mode = "shared"` hands out an existing named token instead, for setups where a front gate must already know every token.
- **Public URL.** `public_url` in config is what pairing and the bundled `/config.json` advertise; the daemon never guesses its own address from the request when running behind a proxy.

## CORS and origins

- The bundled UI is same-origin: no CORS needed.
- A separately hosted app must be allowed explicitly: `cors.allowed_origins = ["https://app.example"]` (or `muxtower serve --allow-origin`). Default is empty. Bearer tokens only, no cookies, so `allow_credentials` is false; allowed headers are `Authorization`, `Content-Type`; preflight cached 10 min.
- Browsers do not apply CORS to WebSockets, so `/v1/stream` checks the `Origin` header against the same list (plus same-origin) before accepting.
- A hosted HTTPS app cannot reach a plain-HTTP or private-IP daemon (mixed content, Local Network Access). Docs point those users to the bundled UI.
- A reverse proxy or gate in front must let `OPTIONS` preflights through untouched, since they carry no credentials.

## Push

Web Push with a per-daemon VAPID key. The subscription belongs to the app's origin; the notification payload carries `daemon_id` and `session_id`, and a click opens `/d/<daemon>/s/<session>`. Filters per subscription: which states notify, muted sessions.

## App

- Vite + React + TypeScript PWA; Tailwind v4 tokens; shadcn/ui primitives; TanStack Router, TanStack Query, Zustand; xterm.js for the terminal.
- Daemons are first class: a persisted list `{id, name, url, token}`; one typed client per daemon; every query key starts with the daemon id.
- Screens: **Inbox** (everything waiting on a human, across all daemons), **Session** (terminal, pending action card with approve/deny/options, input bar, keys), **Daemons** (add by pairing link/QR or by hand, per-daemon push settings).
- No configuration is baked into the bundle. An optional `/config.json` next to `index.html` supplies default daemons; the bundled copy served by the daemon advertises its own daemon.
