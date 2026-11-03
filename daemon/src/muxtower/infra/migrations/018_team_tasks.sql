-- Work one session sent another (`send_task`): who to whom, when, the start of what it said, and whether it
-- was delivered or held until the receiver stops waiting on the owner. A record only, the latest few hundred.
CREATE TABLE team_tasks (
    id INTEGER PRIMARY KEY,
    at TEXT NOT NULL,
    from_id TEXT,
    from_label TEXT NOT NULL,
    to_id TEXT NOT NULL,
    text TEXT NOT NULL,
    status TEXT NOT NULL,
    delivered_at TEXT
)
