-- Daemons joined to this one (nodes): the token each links with (hashed), and what it last reported,
-- so its sessions are still listed, marked offline, while it is away or this daemon restarts.
CREATE TABLE nodes (
    name TEXT PRIMARY KEY,
    token_hash TEXT NOT NULL UNIQUE,
    joined_at TEXT NOT NULL,
    last_seen TEXT,
    version TEXT,
    runtimes TEXT NOT NULL DEFAULT '[]',
    sessions TEXT NOT NULL DEFAULT '[]'
)
