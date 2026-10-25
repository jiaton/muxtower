-- Whether a subscription also hears about finished turns (on unless switched off).
ALTER TABLE push_subscriptions ADD COLUMN done INTEGER NOT NULL DEFAULT 1;
