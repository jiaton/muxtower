-- The owner's groups of projects, the app's second chip row (`chips/`): kept on the hub, in their order.
CREATE TABLE IF NOT EXISTS chip_groups (
    position INTEGER PRIMARY KEY,
    id TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    projects TEXT NOT NULL  -- JSON list of project names
);
