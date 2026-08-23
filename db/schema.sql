CREATE TABLE IF NOT EXISTS patients (
  patient_id varchar PRIMARY KEY,
  name varchar NOT NULL,
  birth_date date NOT NULL,
  phone varchar,
  created_at timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS hospitals (
  hospital_id varchar PRIMARY KEY,
  hospital_name varchar NOT NULL,
  gateway_url varchar NOT NULL,
  status varchar NOT NULL,
  public_key text
);

CREATE TABLE IF NOT EXISTS gateways (
  gateway_id varchar PRIMARY KEY,
  hospital_id varchar NOT NULL REFERENCES hospitals(hospital_id),
  gateway_name varchar NOT NULL,
  dicomweb_endpoint varchar NOT NULL,
  status varchar NOT NULL,
  supports_qido boolean NOT NULL DEFAULT true,
  supports_wado boolean NOT NULL DEFAULT true,
  supports_stow boolean NOT NULL DEFAULT false,
  last_health_checked_at timestamptz
);

CREATE TABLE IF NOT EXISTS doctors (
  doctor_id varchar PRIMARY KEY,
  name varchar NOT NULL,
  hospital_id varchar NOT NULL REFERENCES hospitals(hospital_id),
  roles text[] NOT NULL,
  approved_purposes text[] NOT NULL
);

CREATE TABLE IF NOT EXISTS imaging_studies (
  study_id varchar PRIMARY KEY,
  patient_id varchar NOT NULL REFERENCES patients(patient_id),
  source_hospital_id varchar NOT NULL REFERENCES hospitals(hospital_id),
  study_instance_uid varchar NOT NULL UNIQUE,
  modality varchar NOT NULL,
  body_part varchar NOT NULL,
  study_date date NOT NULL,
  description varchar NOT NULL,
  metadata_only boolean NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS imaging_series (
  series_instance_uid varchar PRIMARY KEY,
  study_instance_uid varchar NOT NULL REFERENCES imaging_studies(study_instance_uid) ON DELETE CASCADE,
  modality varchar NOT NULL,
  description varchar NOT NULL,
  instance_count integer NOT NULL,
  bytes bigint NOT NULL,
  preview_image_url varchar
);

ALTER TABLE imaging_series ADD COLUMN IF NOT EXISTS preview_image_url varchar;

CREATE TABLE IF NOT EXISTS consents (
  consent_id varchar PRIMARY KEY,
  patient_id varchar NOT NULL REFERENCES patients(patient_id),
  source_hospital_id varchar NOT NULL REFERENCES hospitals(hospital_id),
  target_hospital_id varchar NOT NULL REFERENCES hospitals(hospital_id),
  purpose varchar NOT NULL,
  permission varchar NOT NULL,
  valid_from timestamptz NOT NULL,
  valid_until timestamptz NOT NULL,
  status varchar NOT NULL,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  revoked_at timestamptz
);

ALTER TABLE consents ADD COLUMN IF NOT EXISTS updated_at timestamptz;
ALTER TABLE consents ADD COLUMN IF NOT EXISTS revoked_at timestamptz;
UPDATE consents SET updated_at = created_at WHERE updated_at IS NULL;
ALTER TABLE consents ALTER COLUMN updated_at SET NOT NULL;

CREATE TABLE IF NOT EXISTS consent_scopes (
  scope_id varchar PRIMARY KEY,
  consent_id varchar NOT NULL REFERENCES consents(consent_id) ON DELETE CASCADE,
  study_instance_uid varchar NOT NULL,
  series_instance_uid varchar,
  allowed boolean NOT NULL,
  created_at timestamptz NOT NULL
);

ALTER TABLE consent_scopes ADD COLUMN IF NOT EXISTS created_at timestamptz;
UPDATE consent_scopes SET created_at = now() WHERE created_at IS NULL;
ALTER TABLE consent_scopes ALTER COLUMN created_at SET NOT NULL;

CREATE TABLE IF NOT EXISTS dicom_access_token_logs (
  token_id varchar PRIMARY KEY,
  token varchar NOT NULL UNIQUE,
  audit_session_id varchar,
  consent_id varchar NOT NULL REFERENCES consents(consent_id),
  doctor_id varchar NOT NULL,
  target_hospital_id varchar NOT NULL REFERENCES hospitals(hospital_id),
  study_instance_uid varchar NOT NULL,
  series_instance_uid varchar,
  allowed_series_uids jsonb,
  permission varchar,
  purpose varchar,
  issued_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  status varchar NOT NULL
);

ALTER TABLE dicom_access_token_logs ADD COLUMN IF NOT EXISTS audit_session_id varchar;
ALTER TABLE dicom_access_token_logs ADD COLUMN IF NOT EXISTS allowed_series_uids jsonb;
ALTER TABLE dicom_access_token_logs ADD COLUMN IF NOT EXISTS permission varchar;
ALTER TABLE dicom_access_token_logs ADD COLUMN IF NOT EXISTS purpose varchar;

CREATE TABLE IF NOT EXISTS audit_logs (
  audit_id varchar PRIMARY KEY,
  audit_session_id varchar NOT NULL,
  actor_type varchar NOT NULL,
  actor_id varchar NOT NULL,
  hospital_id varchar,
  patient_id varchar,
  consent_id varchar,
  source_hospital_id varchar,
  target_hospital_id varchar,
  action varchar NOT NULL,
  study_instance_uid varchar,
  series_instance_uid varchar,
  sop_instance_uid varchar,
  ip_address varchar,
  user_agent varchar,
  created_at timestamptz NOT NULL,
  result varchar NOT NULL,
  reason varchar,
  reason_code varchar,
  previous_hash varchar,
  record_hash varchar
);

ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS hospital_id varchar;
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS patient_id varchar;
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS consent_id varchar;
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS sop_instance_uid varchar;
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS reason_code varchar;
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS previous_hash varchar;
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS record_hash varchar;

CREATE TABLE IF NOT EXISTS transfer_usage_logs (
  usage_id varchar PRIMARY KEY,
  audit_session_id varchar NOT NULL,
  source_hospital_id varchar NOT NULL,
  target_hospital_id varchar NOT NULL,
  study_instance_uid varchar NOT NULL,
  series_instance_uid varchar,
  sop_instance_uid varchar,
  bytes_transferred bigint NOT NULL,
  transfer_started_at timestamptz NOT NULL,
  transfer_finished_at timestamptz NOT NULL,
  transfer_mode varchar NOT NULL,
  estimated_cost numeric(12, 4) NOT NULL
);

ALTER TABLE transfer_usage_logs ADD COLUMN IF NOT EXISTS sop_instance_uid varchar;

CREATE TABLE IF NOT EXISTS research_export_requests (
  request_id varchar PRIMARY KEY,
  requester_id varchar NOT NULL,
  approver_id varchar,
  dataset_id varchar NOT NULL,
  study_instance_uid varchar NOT NULL,
  series_instance_uid varchar,
  purpose varchar NOT NULL,
  status varchar NOT NULL,
  high_risk_image boolean NOT NULL DEFAULT false,
  release_decision varchar,
  release_reason varchar,
  requested_at timestamptz NOT NULL,
  decided_at timestamptz,
  exported_at timestamptz,
  decision_reason varchar
);

ALTER TABLE research_export_requests ADD COLUMN IF NOT EXISTS release_decision varchar;
ALTER TABLE research_export_requests ADD COLUMN IF NOT EXISTS release_reason varchar;

CREATE TABLE IF NOT EXISTS pseudonym_mappings (
  mapping_id varchar PRIMARY KEY,
  patient_id varchar NOT NULL REFERENCES patients(patient_id),
  study_instance_uid varchar NOT NULL,
  pseudonym_id varchar NOT NULL UNIQUE,
  protected_patient_ref varchar,
  key_provider varchar,
  key_id varchar,
  created_at timestamptz NOT NULL,
  protection varchar NOT NULL
);

ALTER TABLE pseudonym_mappings ADD COLUMN IF NOT EXISTS protected_patient_ref varchar;
ALTER TABLE pseudonym_mappings ADD COLUMN IF NOT EXISTS key_provider varchar;
ALTER TABLE pseudonym_mappings ADD COLUMN IF NOT EXISTS key_id varchar;

CREATE INDEX IF NOT EXISTS idx_imaging_studies_patient ON imaging_studies(patient_id);
CREATE INDEX IF NOT EXISTS idx_gateways_hospital ON gateways(hospital_id);
CREATE INDEX IF NOT EXISTS idx_consents_lookup ON consents(patient_id, source_hospital_id, target_hospital_id, purpose, status);
CREATE INDEX IF NOT EXISTS idx_consent_scopes_lookup ON consent_scopes(consent_id, study_instance_uid, series_instance_uid);
CREATE UNIQUE INDEX IF NOT EXISTS idx_consent_scopes_unique ON consent_scopes(consent_id, study_instance_uid, COALESCE(series_instance_uid, ''));
CREATE INDEX IF NOT EXISTS idx_tokens_token ON dicom_access_token_logs(token);
CREATE INDEX IF NOT EXISTS idx_audit_created_at ON audit_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_audit_actor_created_at ON audit_logs(actor_id, created_at);
CREATE INDEX IF NOT EXISTS idx_audit_action_created_at ON audit_logs(action, created_at);
CREATE INDEX IF NOT EXISTS idx_transfer_usage_study ON transfer_usage_logs(study_instance_uid);
CREATE INDEX IF NOT EXISTS idx_transfer_usage_instance ON transfer_usage_logs(sop_instance_uid);
CREATE INDEX IF NOT EXISTS idx_research_export_status ON research_export_requests(status, requested_at);
CREATE UNIQUE INDEX IF NOT EXISTS idx_pseudonym_mapping_patient_study ON pseudonym_mappings(patient_id, study_instance_uid);
