-- Each session's place in a team: a role (free text, with a note) and the project it belongs to. A project
-- muxtower worked out itself (from git) is marked so, and one an agent or the owner set is kept as set.
CREATE TABLE session_team (
    session_id TEXT PRIMARY KEY,
    role TEXT,
    note TEXT,
    project TEXT,
    project_auto INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL
)
