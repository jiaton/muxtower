-- Short versions of long agent replies, keyed by the reply's sha256, so each reply is summarized once.
CREATE TABLE reply_summaries (
    reply_hash TEXT PRIMARY KEY,
    summary    TEXT NOT NULL,
    created_at TEXT NOT NULL
);
