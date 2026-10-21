-- Explicit operator migration; no historical audit hashes or rows rewritten.
BEGIN;
SET LOCAL lock_timeout='2s';
SET LOCAL statement_timeout='5s';
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS helper_metadata jsonb;
COMMIT;
