-- The owner named the session in muxtower (on starting it, or by renaming it): that name is kept over
-- the one its agent gives itself.
ALTER TABLE sessions ADD COLUMN named INTEGER NOT NULL DEFAULT 0
