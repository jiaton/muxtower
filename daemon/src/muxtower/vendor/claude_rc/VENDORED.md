# Vendored: claude-rc-api

- Upstream: https://github.com/ThatCrispyToast/claude-rc-api (MIT, `LICENSE` here)
- Commit: 0c4f38420526d8a7fd4088c1dcae54f494b2c990 (version 0.3.0), copied 2026-10-18
- Files: `client.py`, `credentials.py`, `events.py`, `sse.py`, `_version.py`; `__init__.py` is ours (no CLI / web UI).

It talks to Anthropic's **private, undocumented** Remote Control endpoints. When they change, update
this copy (or patch it here) and record the new commit above. Only `muxtower.sources.remote_control`
imports it.
