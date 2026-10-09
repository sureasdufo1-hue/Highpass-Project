-- Explicit synthetic authority projection. Not loaded by legacy store bootstrap.
-- Apply only through a bounded, reviewed migration; no automatic patient seeding.
CREATE TABLE capstone_patient_accounts (
  subject varchar(128) PRIMARY KEY,
  patient_id varchar NOT NULL UNIQUE,
  evidence_kind varchar NOT NULL CHECK (evidence_kind = 'CAPSTONE_MOCK_IDP'),
  status varchar NOT NULL CHECK (status IN ('ACTIVE','SUSPENDED','REVOKED')),
  revision uuid NOT NULL UNIQUE,
  UNIQUE (subject, patient_id)
);

CREATE TABLE capstone_patient_ownership_refs (
  ref_id uuid PRIMARY KEY,
  subject varchar(128) NOT NULL,
  patient_id varchar NOT NULL,
  study_instance_uid varchar NOT NULL UNIQUE,
  source_hospital_id varchar NOT NULL,
  status varchar NOT NULL CHECK (status IN ('ACTIVE','DELETED','REVOKED')),
  version integer NOT NULL CHECK (version > 0),
  FOREIGN KEY (subject, patient_id) REFERENCES capstone_patient_accounts(subject, patient_id) ON DELETE RESTRICT
);

REVOKE ALL ON capstone_patient_accounts, capstone_patient_ownership_refs FROM PUBLIC;
-- No runtime writes or implicit ACTIVE/default values. Registration and minimum
-- SELECT grants belong to the explicit capstone activation operator, not HTTP.
-- Legacy saveNow replaces its own tables using TRUNCATE CASCADE. Deliberately
-- avoid FKs into that replaceable snapshot: every authority read joins and checks
-- current patient/Study/Series/source rows. Missing/mismatched rows deny, while
-- legacy saves must never cascade-delete this explicit durable authority state.
