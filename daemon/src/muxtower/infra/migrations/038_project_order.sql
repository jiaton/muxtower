-- The owner's order of projects in the session list grouped by project (`chips/project_order.py`): kept on the hub.
CREATE TABLE IF NOT EXISTS project_order (
    position INTEGER PRIMARY KEY,
    project TEXT NOT NULL UNIQUE  -- a project name as the app reads it from its sessions
);
