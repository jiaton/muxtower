-- Triggers (`triggers/`): outside events that reach an agent, kept on the hub.
CREATE TABLE IF NOT EXISTS triggers (
    id TEXT PRIMARY KEY,           -- trg_…
    name TEXT NOT NULL UNIQUE,     -- what the CLI and the owner call it
    enabled INTEGER NOT NULL,
    spec TEXT NOT NULL,            -- JSON: source, filter, dedupe, rate_per_hour, action
    secret_hash TEXT NOT NULL,     -- sha256 of the secret, which is shown once
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
-- Every firing, whatever became of it (the last few shown per trigger, all of them in the audit log).
CREATE TABLE IF NOT EXISTS trigger_firings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    trigger_id TEXT NOT NULL,
    at TEXT NOT NULL,
    via TEXT NOT NULL,             -- webhook | cli | test
    key TEXT,
    outcome TEXT NOT NULL,         -- delivered | started | notified | filtered | deduped | rate_limited | paused | failed
    target TEXT,
    detail TEXT,
    bytes INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS trigger_firings_by_trigger ON trigger_firings (trigger_id, id);
-- Dedupe keys seen, each kept for its trigger's `dedupe.days`.
CREATE TABLE IF NOT EXISTS trigger_keys (
    trigger_id TEXT NOT NULL,
    key TEXT NOT NULL,
    at TEXT NOT NULL,
    PRIMARY KEY (trigger_id, key)
);
