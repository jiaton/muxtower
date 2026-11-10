-- The voice dictionary (`asr/dictionary.py`): words speech to text should know, and corrections of what it
-- writes wrong ("heard" → "write"), in the owner's order. Kept on the hub.
CREATE TABLE IF NOT EXISTS asr_dictionary (
    position INTEGER PRIMARY KEY,
    kind TEXT NOT NULL CHECK (kind IN ('word', 'correction')),
    heard TEXT NOT NULL,  -- the word itself, or what is heard
    write TEXT NOT NULL DEFAULT ''  -- a correction's replacement
);
