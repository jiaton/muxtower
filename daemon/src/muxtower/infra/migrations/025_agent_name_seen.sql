-- The name a session's agent was last seen to go by, as set by a person there (Claude Code's
-- nameSource "user"), and when muxtower first saw that name: an agent stamps its own `nameSince` anew
-- each time it starts and restores an old name, so only a change of the name itself is a new naming.
-- NULL time: first seen already set, nobody knows when (only an explicit rename beats it).
ALTER TABLE sessions ADD COLUMN agent_name TEXT;
ALTER TABLE sessions ADD COLUMN agent_name_at TEXT
