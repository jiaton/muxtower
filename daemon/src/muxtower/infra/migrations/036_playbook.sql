-- The owner's team playbook (`playbook/`): one shared, and per project additions or a replacement. Kept on the hub.
CREATE TABLE IF NOT EXISTS playbooks (
    scope TEXT PRIMARY KEY,  -- "shared", or "projects/<project>"
    mode TEXT NOT NULL,      -- add | replace (a project's, the shared one is add)
    version INTEGER NOT NULL,
    text TEXT NOT NULL,
    at TEXT NOT NULL,
    author TEXT NOT NULL
);
-- Every version ever saved, never rewritten: history, and what a revert copies.
CREATE TABLE IF NOT EXISTS playbook_versions (
    scope TEXT NOT NULL,
    version INTEGER NOT NULL,
    mode TEXT NOT NULL,
    text TEXT NOT NULL,
    at TEXT NOT NULL,
    author TEXT NOT NULL,
    note TEXT,
    PRIMARY KEY (scope, version)
);
