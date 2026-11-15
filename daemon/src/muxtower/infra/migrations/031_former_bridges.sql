-- Every Remote Control session a muxtower session's agent has run (a new bridge after a restart, a resume
-- or a move to the background): the old ones are that session's, folded into it, never listed apart.
CREATE TABLE IF NOT EXISTS session_remote_ids (
    remote_id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    seen_at TEXT NOT NULL
)
