-- Single sessions a group of projects holds besides whole projects (`chips/`): a JSON list of session ids.
ALTER TABLE chip_groups ADD COLUMN sessions TEXT NOT NULL DEFAULT '[]'
