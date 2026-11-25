-- The owner's Inbox (`inbox/`): ideas across projects, kept on the hub. A done item stays 30 days as history.
CREATE TABLE IF NOT EXISTS inbox_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    text TEXT NOT NULL,
    project TEXT,
    status TEXT NOT NULL,  -- open | handed | done
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    done_at TEXT,
    position INTEGER NOT NULL,  -- the owner's order: lower first
    version INTEGER NOT NULL DEFAULT 1,  -- bumped on every change
    handed_role TEXT,
    handed_session TEXT,
    handed_project TEXT,
    handed_task_id INTEGER,
    handed_at TEXT,
    due_at TEXT,  -- a due instant (UTC), when it has a time
    due_date TEXT,  -- a due date alone (YYYY-MM-DD, the owner's day): falls due at the due hour there
    on_due TEXT NOT NULL DEFAULT 'remind',  -- remind | hand_off
    target_project TEXT,  -- hand_off: to whom
    target_role TEXT,
    target_session TEXT,
    due_fired_at TEXT  -- when the hub acted on the due date: never twice
);
CREATE INDEX IF NOT EXISTS inbox_items_status ON inbox_items (status);

-- Each project's default hand-off role for Inbox items (`inbox/`): follows a project rename.
CREATE TABLE IF NOT EXISTS project_handoff (
    project TEXT PRIMARY KEY,
    role TEXT NOT NULL
);

-- Small facts the Inbox keeps (the last weekly nudge to the concierge).
CREATE TABLE IF NOT EXISTS inbox_state (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);
