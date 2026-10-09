-- Legacy consent-originated handoff contract: requestId is optional,
-- consentId and patientId remain mandatory foreign keys. No rows are removed.
BEGIN;
ALTER TABLE transfer_tickets ALTER COLUMN request_id DROP NOT NULL;
COMMIT;
