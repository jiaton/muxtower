-- Where a Remote Control session last ran (its machine and folder, while it had an environment): an ended
-- CLI session keeps its place in the list instead of "No environment".
CREATE TABLE IF NOT EXISTS rc_places (
    session_id TEXT PRIMARY KEY,
    machine TEXT NOT NULL,
    cwd TEXT NOT NULL
)
