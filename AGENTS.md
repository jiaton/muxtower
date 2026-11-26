# AGENTS.md

muxtower: approve and drive coding agents running in tmux on a remote machine (and, optionally, Claude Code Remote Control sessions), from a phone. Server-side, headless, API-first; one Bearer token; works behind any reverse proxy. Architecture and the reasoning behind it: `docs/design.md` — read it before changing the API, auth, or state detection.

## Layout

- `daemon/` — Python package `muxtower` (one command, `muxtower`; `muxtower serve` runs the daemon). Rules: `daemon/AGENTS.md`.
- `app/` — `muxtower-app`, Vite + React PWA. Rules: `app/AGENTS.md`.
- `glasses/` — `muxtower-g2`, the Even Realities G2 glasses app (Even Hub). Rules: `glasses/AGENTS.md`.
- `site/` — `muxtower-site`, the project's website (one prerendered page with a self-playing demo; the app's demo build at `/demo/`). Rules: `site/AGENTS.md`.
- `openapi.json` — the API contract, generated from the daemon, consumed by the app. Never edit by hand.

## Commands (from the repo root)

- Regenerate the contract after any API change: `make contract` (exports `openapi.json`, regenerates `app/src/lib/api/schema.d.ts` and `glasses/src/hub/schema.d.ts`). CI runs `make contract-check` and fails on a diff.
- Everything CI runs: `make check`.
- Build the wheel with the UI inside: `make wheel` (builds `app/dist` and `glasses/dist`, copies them into `daemon/src/muxtower/web/` and `web/g2/`, runs `poetry build`).
- Release: raise `version` in `daemon/pyproject.toml` (`cd daemon && poetry version patch`), commit, tag `vX.Y.Z`, push the tag. `.github/workflows/release.yml` checks, builds and publishes it to PyPI, then deploys the public app (`make public-app`, `app/deploy/README.md`) and the website (`make site-deploy`, `site/AGENTS.md`) from the tag, each only where its repository variable (`DEPLOY_PUBLIC_APP`, `DEPLOY_SITE`) is `true`. Nodes compare versions with their hub and install the hub's from PyPI (`daemon/src/muxtower/nodes/update.py`), so raise `PROTOCOL` in `nodes/protocol.py` whenever an older peer could no longer read the link, keeping `OLDEST` (and the code speaking it) while older nodes should still link; raising `OLDEST` makes them update.

## Servers you start (dev, demo, e2e, a throwaway daemon)

The machine you work on may run the real hub (port 8731) and other projects' servers.
- Ports: never 8731. The dev daemon is `muxtower serve --dev` (port 8741), and the app's and glasses' dev servers proxy there. For anything else, take a free port (`node app/scripts/free-port-pair.mjs` prints a free pair, or bind port 0), and check that nothing answers on it before you use it. The e2e suite picks its own when `MUXTOWER_E2E_PORT` is unset, and never reuses a running server.
- Stopping: by the PID you started (save it: `cmd & echo $! > server.pid`), or the process group you started it in. Never `pkill`/`killall`, never `pkill -f '<pattern>'`, and never a `kill $(pgrep|ps|lsof …)` you did not just check: a pattern also matches the hub and other projects' processes (a `pkill -f "port 8731"` once stopped the hub for every session).
- Stop what you started before you report, and leave no dev server running.

## Tests on a shared machine

- Vitest runs at most 3 workers and 15 s per test (the configs say so: don't override them); run checks under
  `nice -n 10`, and only the tests you need until the final run.
- A failure that is only a timeout while the machine's load is high (vitest workers that can't start, a 30 s
  Playwright timeout) is load: rerun at a quieter moment. A failed assertion with a wrong value is real, even
  when it shows up only on CI: find the cause, don't widen a margin to hide it.
- Run Prettier from the package that owns the file (`app/`, `glasses/` and `site/` have their own configs).

## Rules for every change

- This repo is generic, public-facing software. No personal names, hostnames, domains, IPs, tokens, or references to any predecessor project in code, docs, tests, fixtures, or commit messages. Examples use `example.com`, `app.example`, `127.0.0.1`.
- English only, in UI strings and docs.
- An API change lands in the same commit as its regenerated `openapi.json` and the app and glasses code that uses it.
- No secret in logs, error messages, URLs written to logs, or git history.
- Archive = end + keep: archiving is the one way a session ends (its agent ends, its history is kept); nothing
  ends without its history. Delete exists only for an archived session (an interrupted one is archived too) and removes muxtower's copy, never the
  agent's own transcript.

## Private terms

`scripts/check-private.py` (first in `make check`, and a CI step) fails when a tracked file, or the message of
a commit about to be pushed, holds one of the owner's private terms (names, projects, hosts, session ids). The
list is never in this repository: it is the Actions secret `PRIVATE_TERMS` and, on the owner's machine,
`~/.config/muxtower/private-terms.txt`; without one the check skips. A finding names the term by number only.
Test data and examples use made-up names (acme/…, "Plan the launch", build-box).
