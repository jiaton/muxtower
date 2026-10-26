-- Which paired device registered a subscription: the subscriptions of a revoked device stop. Rows from
-- before have no owner and are dropped, and a device still paired registers its subscription again
-- when it opens the app.
ALTER TABLE push_subscriptions ADD COLUMN device TEXT;
DELETE FROM push_subscriptions;
