-- What a session needs to be started again after its machine restarted: the arguments it was started with
-- (options only: never its first prompt, never a token), the agent's own id for its conversation (to resume
-- it), the tmux server it ran in (a new one, or none, means the machine restarted rather than the session
-- ended), and when it was found interrupted.
ALTER TABLE sessions ADD COLUMN launch_args TEXT;
ALTER TABLE sessions ADD COLUMN agent_id TEXT;
ALTER TABLE sessions ADD COLUMN server_id TEXT;
ALTER TABLE sessions ADD COLUMN interrupted_at TEXT
