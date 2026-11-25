-- Remote Control sessions continued in a terminal (`continuing/`): closed on the Claude account, then their
-- conversation resumed in a pane on the machine it ran on. One row each: what a second click, a Retry or the
-- app's progress reads. No content: a title, ids, a folder, a step and why it stopped.
CREATE TABLE IF NOT EXISTS continued_sessions (
    remote_id TEXT PRIMARY KEY,  -- the Remote Control session, as the hub lists it
    machine TEXT NOT NULL,  -- where it is continued, as the hub names it
    node TEXT,  -- that machine's node, or NULL for the hub's own machine
    cwd TEXT NOT NULL,
    agent_id TEXT NOT NULL,  -- Claude Code's id for the conversation (`claude --resume <it>`)
    name TEXT NOT NULL,
    unread INTEGER NOT NULL DEFAULT 0,  -- as it was: the pane session starts so
    step TEXT NOT NULL,  -- closing | starting | done | failed
    closed INTEGER NOT NULL DEFAULT 0,  -- archived on the Claude account, and read back so
    reason TEXT,  -- why it failed
    session_id TEXT,  -- the pane session, once started
    updated_at TEXT NOT NULL
);
