-- Where the owner placed a session (a machine, a folder), for sessions whose source does not say:
-- it overrides what the source reports. NULL: not placed.
ALTER TABLE session_marks ADD COLUMN machine TEXT;
ALTER TABLE session_marks ADD COLUMN folder TEXT
