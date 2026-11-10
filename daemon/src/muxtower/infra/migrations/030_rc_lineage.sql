-- Where each Remote Control session came from (`sources/remote_control/lineage.py`), worked out once and
-- kept: a session's start never changes, so a restart neither reads its first events nor searches other
-- logs again. Negative answers are kept too (not a copy, or a copy no log was found to hold).
CREATE TABLE IF NOT EXISTS rc_lineage (
    session_id TEXT PRIMARY KEY,
    first TEXT,  -- its first message's id (a copy's is its parent's)
    written TEXT,  -- a copy's: when that message was written, in the session it came from
    copied INTEGER NOT NULL DEFAULT 0,
    side_chat INTEGER NOT NULL DEFAULT 0,
    parent TEXT,  -- named by a Remote Control tag
    searched INTEGER NOT NULL DEFAULT 0,  -- other sessions' logs were searched for its first message
    found_in TEXT,  -- the one that held it
    how TEXT NOT NULL,  -- tag, not-a-copy, first-message, searched-found, searched-none, copy-unsearched
    at TEXT NOT NULL  -- when this was worked out
);
