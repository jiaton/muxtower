-- Which notifications each device was shown, and which sessions were notified about (pushes, `notify/`):
-- kept over a restart, so notifications of sessions read since are still taken away afterwards.
CREATE TABLE IF NOT EXISTS push_shown (
    sub_id TEXT NOT NULL,
    session_id TEXT NOT NULL,
    at REAL NOT NULL,
    PRIMARY KEY (sub_id, session_id)
);
CREATE TABLE IF NOT EXISTS push_notified (
    session_id TEXT PRIMARY KEY,
    at REAL NOT NULL
)
