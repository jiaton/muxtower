-- Every name a session went by (`sessions/names.py`), offered when renaming it.
CREATE TABLE IF NOT EXISTS session_names (
    session_id TEXT NOT NULL,
    name TEXT NOT NULL,
    source TEXT NOT NULL,  -- muxtower | claude | set in claude | remote control | codex
    first_seen TEXT NOT NULL,
    last_seen TEXT NOT NULL,
    PRIMARY KEY (session_id, name)
)
