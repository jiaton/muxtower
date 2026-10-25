-- Read state becomes the owner's marks on a session, which also say whether they hid it.
ALTER TABLE session_reads RENAME TO session_marks;
ALTER TABLE session_marks ADD COLUMN hidden INTEGER NOT NULL DEFAULT 0
