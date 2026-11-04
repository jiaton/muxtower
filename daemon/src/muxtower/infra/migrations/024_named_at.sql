-- When muxtower named a session (`sessions/naming.py`): the latest deliberate name wins, so a name the owner
-- set on the agent's side later beats it. `named` now means an explicit rename only: rows renamed in the
-- app (audited as `update` with a name) keep it, from when that was, and a name given only at launch counts
-- as given then, and no longer beats a name the agent was given since.
ALTER TABLE sessions ADD COLUMN named_at TEXT;
UPDATE sessions SET named_at = (
    SELECT MAX(a.at) FROM audit_log a
    WHERE a.session_id = sessions.id AND a.action IN ('update', 'mcp:rename_session') AND a.detail LIKE '%"name"%'
) WHERE named = 1;
UPDATE sessions SET named_at = (
    SELECT MAX(a.at) FROM audit_log a WHERE a.session_id = sessions.id AND a.action = 'mcp:rename_session'
) WHERE named = 1 AND named_at IS NULL;
UPDATE sessions SET named = 0, named_at = created_at WHERE named = 1 AND named_at IS NULL;
