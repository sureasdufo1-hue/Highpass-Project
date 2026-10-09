-- Default-off patient-only ledger. No doctor surrogate, receipt/token/DEK/bytes.
CREATE TABLE capstone_patient_key_releases (
  release_id uuid PRIMARY KEY,
  grant_id uuid NOT NULL REFERENCES capstone_patient_self_view_grants(grant_id) ON DELETE RESTRICT,
  package_id varchar(128) NOT NULL UNIQUE CHECK (package_id ~ '^pkg_[A-Za-z0-9_-]{16,80}$'),
  metadata jsonb NOT NULL CHECK (jsonb_typeof(metadata)='object'),
  status varchar NOT NULL CHECK (status IN ('PENDING','PREPARED','PRECHECKED','CONSUMED')),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  CHECK (expires_at > created_at AND expires_at <= created_at + interval '30 seconds'),
  CHECK ((status='CONSUMED') = (consumed_at IS NOT NULL))
);
CREATE INDEX capstone_patient_key_release_expiry ON capstone_patient_key_releases(expires_at) WHERE status<>'CONSUMED';
REVOKE ALL ON capstone_patient_key_releases FROM PUBLIC;
-- Deployment grants SELECT/INSERT and UPDATE(status,consumed_at) only to a
-- dedicated patient release role after independent review. No runtime GRANT here.
