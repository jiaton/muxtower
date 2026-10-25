-- When each session last finished a turn and when the owner last looked at it (any device), so the
-- list can say which finished turns are still unread.
CREATE TABLE session_reads (
    session_id TEXT PRIMARY KEY,
    finished_at TEXT,
    seen_at TEXT,
    marked_unread INTEGER NOT NULL DEFAULT 0
)
