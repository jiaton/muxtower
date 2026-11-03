-- What muxtower told (or is yet to tell) the concierge about watched sessions: the hub's own record of it,
-- kept to the latest few hundred.
CREATE TABLE concierge_events (
    number INTEGER PRIMARY KEY,
    at TEXT NOT NULL,
    session_id TEXT NOT NULL,
    line TEXT NOT NULL,
    delivered INTEGER NOT NULL DEFAULT 0
)
