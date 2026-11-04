-- Feature settings changed from the app (`settings/`): over the defaults, under the config file.
CREATE TABLE IF NOT EXISTS settings_values (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,  -- JSON
    updated_at TEXT NOT NULL,
    updated_by TEXT
);
