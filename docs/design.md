# muxtower design

muxtower lets coding agents running in tmux on a remote machine be approved and driven from a phone. It is server-side and headless: `muxtower serve` runs next to the agents, exposes a typed HTTP + WebSocket API behind a single Bearer token, and is meant to sit behind any reverse proxy. The web app is a client of that API, nothing more.

## Pieces

| piece | what | ships as |
|---|---|---|
| `muxtower` | the one command. `muxtower serve` runs the daemon (session registry, state detection, approvals, push, API); `muxtower` (status), `run`, `attach`, `pair` manage it locally through a 0600 CLI token; `run` starts the daemon in the background if it is not running. Five commands, nothing more | console script in the `muxtower` Python package |
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
2. **Screen rules (fallback / custom).** A capture loop classifies every pane with an ordered rule list loaded from TOML (`runtimes/defaults/<name>.toml`, replaced file-by-file by `$XDG_CONFIG_HOME/muxtower/runtimes/<name>.toml`). Rules are data, not code: a regex and the state it means. A `[menu]` section names the cursor glyph; the menu parser reads the block of choices around it (numbered or not, wrapped labels joined). Used for runtimes without hooks, adopted panes, and as the cross-check that clears a stale hook state. The session view exposes `matched_rule`.

Approval is always explicit. Approve re-reads the live screen, parses the menu, picks the requested option (or the runtime's `[approve.prefer]` choice, exposed as `pending.recommended`), and moves there with arrow keys before Enter. It never types digits, so a stray key cannot land in the next dialog. It refuses (409) when no dialog is on screen; a hook-only dialog is acted on only after it has had a second to render and its menu is readable. Auto-approve is a per-session switch, limited to the runtime's `auto_approve_states`, and acts only on dialogs the screen rules recognise.

## API

- Versioned under `/v1`. FastAPI's OpenAPI schema is exported to `openapi.json` at the repo root and is the contract for the app (`openapi-typescript` + `openapi-fetch`); CI fails if it is stale.
- One WebSocket, `/v1/stream`: the client sends `{"type":"subscribe","topic":"sessions"}` or `{"type":"subscribe","topic":"screen","session_id":…,"history":N}`; the server pushes `sessions` and `screen` frames (shapes in the OpenAPI schema via `/v1/stream/schema`).
- Health: `GET /v1/health` is public and returns only `{status, version}`.

## Auth

- **No accounts.** A daemon has one owner; the app keeps its daemon list (URL + token) only in the browser that added it. There is no server-side user store anywhere.
- **Device tokens.** Every paired device gets its own named token, stored hashed on the daemon, so a lost phone is revoked alone (from the app's daemon page, or `muxtower pair --revoke <name>`).
- **Transport.** HTTP: `Authorization: Bearer`. WebSocket (browsers cannot set headers): when the app is served by the daemon itself, an HttpOnly, SameSite=Strict cookie scoped to `/v1/stream` (minted by `POST /v1/stream/cookie`, accepted only with a same-origin `Origin`, never read by REST routes). Otherwise the app offers the token as a subprotocol, `Sec-WebSocket-Protocol: muxtower, bearer.<token>`, which keeps it out of URLs and logs; if that handshake is refused (some proxies and gates only accept a query token), it retries once with `?token=` and remembers that for the daemon. The daemon redacts `token=` from access logs.
- **Pairing = one-time codes.** A device never receives a token by being shown it. Instead a short-lived (5 min), single-use pairing code is shown as a QR for `<app-url>/pair#u=<daemon-url>&c=<code>` (the fragment never reaches a server), and the new device redeems it at `POST /v1/pair/claim` for its own fresh token. Two ways to get a code:
  - `muxtower pair` on the daemon's machine (first device). The daemon cannot know which address a device will use, so without `--url`/`public_url` it prints only the code (plus the addresses it can see, as hints) and the device enters it on whatever address it opened: the bundled UI pairs with its own origin (`/pair#c=<code>` or the inline code field). With a known address it also shows a QR code;
  - **from an already-paired device**: the app's "Add another device" shows one QR carrying a fresh code for every daemon it knows, so a phone that is paired once can pair a laptop in one scan. A photographed QR is useless once redeemed or expired.
- **Shared mode.** `pairing.mode = "shared"` makes claims hand out one existing named token instead, for setups where a front gate must already know every token it lets through.
- **Public URL.** `public_url` in config is what pairing and the bundled `/config.json` advertise; behind a proxy the daemon never guesses its own address from the request.

## CORS and origins

- Default `cors.allowed_origins = ["*"]`. This is safe because auth is bearer-only: no cookies are ever sent, so a foreign page can call nothing but `/v1/health` and `/v1/pair/claim` without a token. Listing origins only tightens it. `allow_credentials` is false; allowed headers are `Authorization`, `Content-Type`; preflights are cached 10 minutes.
- Browsers do not apply CORS to WebSockets; `/v1/stream` checks `Origin` against the same list (any origin by default) and always requires the token.
- A reverse proxy or gate in front must let `OPTIONS` preflights through untouched, since they carry no credentials.
- The app never goes through a proxy of its own: a hosted app talks to daemons directly from the browser, so the host never sees tokens or terminal contents.

## HTTPS

HTTPS is the expected setup, not an extra: service workers, installing the PWA and Web Push only work in a secure context (localhost excepted). `muxtower serve` binds `127.0.0.1` by default and warns when it binds anything else while `public_url` is not `https://`. Documented ways to put HTTPS in front:

1. **Tailscale** (personal use): `tailscale serve --bg 8731` → `https://<machine>.<tailnet>.ts.net`, certificate managed by Tailscale, no domain or open port.
2. **Cloudflare Tunnel**: a public hostname, no open port, TLS at Cloudflare.
3. **Caddy** (own domain): `reverse_proxy 127.0.0.1:8731`, certificates issued automatically.

A hosted HTTPS app cannot reach a plain-HTTP or private-IP daemon (mixed content, Local Network Access); such daemons use their bundled UI.

## Hosting the app

The app is a static SPA; the same build runs anywhere.

- **Bundled** (recommended): served by `muxtower serve` at `/`, same origin as its daemon.
- **Your own static host**: one-click "Deploy to Cloudflare" (Workers static assets, SPA fallback via `not_found_handling`) or fork + GitHub Pages (Actions workflow; base path from `MUXTOWER_BASE`). Add daemons by pairing.
- **A public instance** run by the project, for convenience only. It is built and deployed by public CI from tagged releases, so users can check what they run; the docs still recommend the bundled UI, because whoever serves the JS could read the tokens in that browser.

## Push

Web Push with a per-daemon VAPID key. A browser registration holds one subscription, so the app registers its service worker once per daemon (scope `<base>push/<daemonId>/`, same script). The subscription belongs to the app's origin; the notification payload carries `daemon_id` and `session_id`, and a click opens `/d/<daemon>/s/<session>`. Filters per subscription: which states notify, muted sessions.

## App

- Vite + React + TypeScript PWA; Tailwind v4 tokens; shadcn/ui primitives; TanStack Router, TanStack Query, Zustand; xterm.js for the terminal.
- Daemons are first class: a persisted list `{id, name, url, token}`; one typed client per daemon; every query key starts with the daemon id.
- Screens: **Inbox** (everything waiting on a human, across all daemons), **Session** (terminal, pending action card with approve/deny/options, input bar, keys), **Daemons** (add by pairing link/QR or by hand, per-daemon push settings).
- No configuration is baked into the bundle. An optional `/config.json` (`{"daemons": [{name, url, token?}], "acknowledge_public_tokens"?}`) next to `index.html` supplies default daemons, written at build time from `MUXTOWER_APP_CONFIG`; a preset token requires the acknowledgement and shows a warning. The bundled copy served by the daemon advertises its own daemon.
