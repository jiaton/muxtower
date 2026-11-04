-- How the app reaches a node itself while its hub is down (`nodes/direct.py`): the address the node
-- reports, the owner's own instead, and the device tokens to revoke there once it is connected again.
ALTER TABLE nodes ADD COLUMN reported_url TEXT;
ALTER TABLE nodes ADD COLUMN direct_url TEXT;
CREATE TABLE IF NOT EXISTS node_revocations (
    node TEXT NOT NULL,
    token_name TEXT NOT NULL,
    PRIMARY KEY (node, token_name)
);
