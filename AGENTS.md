# AGENTS.md

muxtower: approve and drive coding agents running in tmux on a remote machine (and, optionally, Claude Code Remote Control sessions), from a phone. Server-side, headless, API-first; one Bearer token; works behind any reverse proxy. Architecture and the reasoning behind it: `docs/design.md` — read it before changing the API, auth, or state detection.

## Layout

- `daemon/` — Python package `muxtower` (one command, `muxtower`; `muxtower serve` runs the daemon). Rules: `daemon/AGENTS.md`.
- `app/` — `muxtower-app`, Vite + React PWA. Rules: `app/AGENTS.md`.
- `glasses/` — `muxtower-g2`, the Even Realities G2 glasses app (Even Hub). Rules: `glasses/AGENTS.md`.
- `site/` — `muxtower-site`, the project's website (one prerendered page, the app's demo build in a phone frame). Rules: `site/AGENTS.md`.
- `openapi.json` — the API contract, generated from the daemon, consumed by the app. Never edit by hand.

## Commands (from the repo root)

- Regenerate the contract after any API change: `make contract` (exports `openapi.json`, regenerates `app/src/lib/api/schema.d.ts` and `glasses/src/hub/schema.d.ts`). CI runs `make contract-check` and fails on a diff.
- Everything CI runs: `make check`.
- Build the wheel with the UI inside: `make wheel` (builds `app/dist` and `glasses/dist`, copies them into `daemon/src/muxtower/web/` and `web/g2/`, runs `poetry build`).
- Release: raise `version` in `daemon/pyproject.toml` (`cd daemon && poetry version patch`), commit, tag `vX.Y.Z`, push the tag. `.github/workflows/release.yml` checks, builds and publishes it to PyPI. Nodes compare versions with their hub and install the hub's from PyPI (`daemon/src/muxtower/nodes/update.py`), so raise `PROTOCOL` in `nodes/protocol.py` whenever an older peer could no longer read the link, keeping `OLDEST` (and the code speaking it) while older nodes should still link; raising `OLDEST` makes them update.

## Rules for every change

- This repo is generic, public-facing software. No personal names, hostnames, domains, IPs, tokens, or references to any predecessor project in code, docs, tests, fixtures, or commit messages. Examples use `example.com`, `app.example`, `127.0.0.1`.
- English only, in UI strings and docs.
- An API change lands in the same commit as its regenerated `openapi.json` and the app and glasses code that uses it.
- No secret in logs, error messages, URLs written to logs, or git history.
