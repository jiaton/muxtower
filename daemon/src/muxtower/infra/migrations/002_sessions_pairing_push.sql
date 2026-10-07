CREATE TABLE sessions (
    id              TEXT PRIMARY KEY,
    name            TEXT NOT NULL,
    runtime         TEXT NOT NULL,
    cwd             TEXT NOT NULL,
    source          TEXT NOT NULL,          -- 'launched' | 'adopted'
    socket          TEXT NOT NULL,
    tmux_session    TEXT NOT NULL,
    pane_id         TEXT NOT NULL,
    hook_token_hash TEXT,
    auto_approve    INTEGER NOT NULL DEFAULT 0,
    created_at      TEXT NOT NULL
);

CREATE TABLE pair_codes (
    code_hash  TEXT PRIMARY KEY,
    created_by TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    used_at    TEXT
);

CREATE TABLE push_subscriptions (
    id         TEXT PRIMARY KEY,
    endpoint   TEXT NOT NULL UNIQUE,
    p256dh     TEXT NOT NULL,
    auth       TEXT NOT NULL,
    client_ref TEXT NOT NULL,
    states     TEXT NOT NULL,               -- JSON list of AgentState values that notify
    muted      TEXT NOT NULL,               -- JSON list of muted session ids
    created_at TEXT NOT NULL
);
