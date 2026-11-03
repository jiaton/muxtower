-- The agent's own id for the session (Claude Code's session id, Codex's thread id), so a session resumed
-- under a new muxtower id is known as the one it was, role and project included.
ALTER TABLE session_team ADD COLUMN agent_id TEXT
