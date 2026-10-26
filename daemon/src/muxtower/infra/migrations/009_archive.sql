-- Sessions the owner archived: the agent was ended, and what it was stays readable. `session` is its
-- last view (JSON). Its conversation is read from `transcript` (a Claude Code transcript file) when
-- there is one, else from `items` (JSON, copied when it was archived).
CREATE TABLE archived_sessions (
    session_id TEXT PRIMARY KEY,
    remote_id TEXT,
    session TEXT NOT NULL,
    transcript TEXT,
    items TEXT,
    archived_at TEXT NOT NULL
);
