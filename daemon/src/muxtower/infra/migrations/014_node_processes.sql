-- What a node's machine is (sys.platform), and which Remote Control sessions have their Claude Code
-- process there, as it last reported: those sessions are listed as that computer's.
ALTER TABLE nodes ADD COLUMN platform TEXT;
ALTER TABLE nodes ADD COLUMN running TEXT NOT NULL DEFAULT '[]';
