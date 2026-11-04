-- Where a session's project came from when muxtower worked it out (git remote | git root | folder):
-- the lists place it by a git one, and by its folder otherwise. NULL: set by an agent or the owner, or
-- worked out before this was kept.
ALTER TABLE session_team ADD COLUMN project_source TEXT;
