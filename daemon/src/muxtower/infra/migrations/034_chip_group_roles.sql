-- A chip group may hold roles too (role keys, the leading name of a session's role: "PM"), each matched in every project.
ALTER TABLE chip_groups ADD COLUMN roles TEXT NOT NULL DEFAULT '[]';  -- JSON list of role keys
