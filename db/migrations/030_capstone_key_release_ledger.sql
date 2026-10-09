-- Capstone legacy DICOM transport metadata only; not v3 TransferGrant.
BEGIN;
CREATE TABLE IF NOT EXISTS capstone_key_releases (
  release_id UUID PRIMARY KEY,
  metadata JSONB NOT NULL CHECK (jsonb_typeof(metadata) = 'object'),
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX IF NOT EXISTS capstone_key_releases_expiry_idx ON capstone_key_releases (expires_at);
COMMIT;
