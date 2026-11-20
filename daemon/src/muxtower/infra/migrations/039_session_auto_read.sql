-- A session whose finished turns never make it unread: marked read at each turn's end (`sessions/marks.py`).
ALTER TABLE session_marks ADD COLUMN auto_read INTEGER NOT NULL DEFAULT 0
