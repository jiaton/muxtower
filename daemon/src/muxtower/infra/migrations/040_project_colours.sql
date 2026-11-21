-- Each project's colour in the app, one of its hues (`chips/project_colours.py`): kept on the hub, given the
-- first time the hub lists a session of the project, changed only by the owner.
CREATE TABLE IF NOT EXISTS project_colours (
    project TEXT PRIMARY KEY,  -- a project name as the app reads it from its sessions
    hue INTEGER NOT NULL CHECK (hue BETWEEN 1 AND 6)
);
