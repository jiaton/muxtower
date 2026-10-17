-- Last hook-reported state per session (JSON), so a daemon restart keeps what the agent is asking.
ALTER TABLE sessions ADD COLUMN hook_state TEXT
