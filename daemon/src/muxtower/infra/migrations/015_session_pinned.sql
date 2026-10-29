-- The owner pinned the session: listed above the others, on every device.
ALTER TABLE session_marks ADD COLUMN pinned INTEGER NOT NULL DEFAULT 0
