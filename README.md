# muxtower

**Approve and drive the coding agents running on your remote machine — from your phone.**

muxtower is server-side and headless. `muxtower serve` runs next to your agents (Claude Code, Codex, …) in tmux, knows which one is waiting on you and for what, and exposes it all through a typed HTTP + WebSocket API behind a single Bearer token. Put it behind any reverse proxy; open the bundled web app on your phone; approve, answer, or type into any session.

> Status: early development. Not ready for use yet.

## Install

```sh
pipx install muxtower
muxtower token add phone      # prints a token once
muxtower serve --public-url https://daemon.example
```

Open the daemon's URL in a browser: the web app is served from the daemon itself (recommended — same origin, no CORS, works on a plain-HTTP LAN). A separately hosted app can connect too once its origin is allowed with `--allow-origin`.

## How it compares

- [claude-squad](https://github.com/smtg-ai/claude-squad) — a terminal UI for running many agents locally. muxtower has no TUI; it is a daemon + API for reaching agents remotely.
- [TmuxDeck](https://github.com/ctliz/TmuxDeck) — the closest idea: find the tmux pane that needs a human. TmuxDeck is a desktop app with a LAN-only mobile page; muxtower is headless, API-first, and built to sit behind a proxy on the open internet.
- ttyd / gotty — browser terminals. muxtower shows terminals too, but its point is knowing what each agent is waiting for.

## Repository

- `daemon/` — the `muxtower` Python package (the `muxtower` command)
- `app/` — the web app (Vite + React PWA)
- `docs/design.md` — architecture
