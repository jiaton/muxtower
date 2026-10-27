-- Which push notifications a session sends, as the owner set it: all, needs (only when it needs them)
-- or off.
ALTER TABLE session_marks ADD COLUMN notify TEXT NOT NULL DEFAULT 'all'
