-- Default-off patient authority ledger; no legacy doctor/consent surrogate.
CREATE TABLE capstone_patient_self_view_grants (
  grant_id uuid PRIMARY KEY,
  token_hash char(64) NOT NULL UNIQUE CHECK (token_hash ~ '^[a-f0-9]{64}$'),
  subject varchar(128) NOT NULL,
  patient_id varchar NOT NULL,
  ref_id uuid NOT NULL REFERENCES capstone_patient_ownership_refs(ref_id) ON DELETE RESTRICT,
  ownership_revision char(64) NOT NULL CHECK (ownership_revision ~ '^[a-f0-9]{64}$'),
  source_hospital_id varchar NOT NULL,
  viewing_gateway_id varchar NOT NULL,
  study_instance_uid varchar NOT NULL,
  series_instance_uid varchar NOT NULL,
  proof_key_thumbprint varchar(43) NOT NULL CHECK (proof_key_thumbprint ~ '^[A-Za-z0-9_-]{43}$'),
  audit_session_id uuid NOT NULL UNIQUE,
  permission varchar NOT NULL CHECK (permission = 'VIEW_ONLY'),
  authority_type varchar NOT NULL CHECK (authority_type = 'PATIENT_SELF_VIEW'),
  status varchar NOT NULL CHECK (status IN ('ACTIVE','REVOKED','EXPIRED')),
  issued_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  CHECK (expires_at > issued_at AND expires_at <= issued_at + interval '5 minutes'),
  FOREIGN KEY (subject, patient_id) REFERENCES capstone_patient_accounts(subject, patient_id) ON DELETE RESTRICT
);
CREATE INDEX capstone_patient_self_view_grants_expiry ON capstone_patient_self_view_grants(expires_at) WHERE status='ACTIVE';
REVOKE ALL ON capstone_patient_self_view_grants FROM PUBLIC;
-- Atomic main-audit append + grant insert wiring is required before activation.
-- No token issuing endpoint, runtime grants, raw token or clinical bytes here.
