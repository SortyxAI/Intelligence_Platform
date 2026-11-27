-- Mark bins without telemetry as unregistered after the enum value is committed.
UPDATE bins SET status = 'unregistered'
WHERE status = 'active' AND last_seen_at IS NULL;
