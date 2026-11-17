-- What starts an archived session again (`recovery/`): its launch options, the agent's own id, how it was named (JSON).
ALTER TABLE archived_sessions ADD COLUMN relaunch TEXT
