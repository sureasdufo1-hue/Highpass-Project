-- Additive P0-04 foundation; deliberately not loaded by the legacy runtime.
-- Apply as schema owner inside a bounded migration transaction.
CREATE SCHEMA highpass_v3;
REVOKE ALL ON SCHEMA highpass_v3 FROM PUBLIC;

CREATE TABLE highpass_v3.tenants (
  tenant_id uuid PRIMARY KEY,
  code text NOT NULL UNIQUE CHECK (length(code) BETWEEN 1 AND 64),
  display_name text NOT NULL CHECK (length(display_name) BETWEEN 1 AND 128),
  status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','SUSPENDED','REVOKED'))
);
CREATE TABLE highpass_v3.hospitals (
  hospital_id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL UNIQUE REFERENCES highpass_v3.tenants(tenant_id),
  code text NOT NULL CHECK (length(code) BETWEEN 1 AND 64),
  status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','SUSPENDED','REVOKED')),
  capability_version integer NOT NULL DEFAULT 1 CHECK (capability_version > 0),
  UNIQUE (tenant_id, code),
  UNIQUE (tenant_id, hospital_id)
);
CREATE TABLE highpass_v3.patient_refs (
  patient_ref uuid PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT statement_timestamp(),
  deleted_at timestamptz,
  CHECK (deleted_at IS NULL OR deleted_at >= created_at)
);
CREATE TABLE highpass_v3.patient_mappings (
  mapping_id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL,
  hospital_id uuid NOT NULL,
  patient_ref uuid NOT NULL REFERENCES highpass_v3.patient_refs(patient_ref),
  protected_local_ref bytea NOT NULL CHECK (octet_length(protected_local_ref) BETWEEN 24 AND 4096),
  local_ref_digest bytea NOT NULL CHECK (octet_length(local_ref_digest) BETWEEN 32 AND 64),
  status text NOT NULL DEFAULT 'UNVERIFIED'
    CHECK (status IN ('NO_MATCH','MULTIPLE_MATCH','IDENTITY_CONFLICT','UNVERIFIED','VERIFIED')),
  evidence_digest bytea CHECK (octet_length(evidence_digest) = 32),
  verified_by uuid,
  verified_at timestamptz,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT statement_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT statement_timestamp(),
  deleted_at timestamptz,
  FOREIGN KEY (tenant_id, hospital_id) REFERENCES highpass_v3.hospitals(tenant_id, hospital_id),
  CHECK (updated_at >= created_at),
  CHECK (deleted_at IS NULL OR deleted_at >= created_at),
  CHECK (status <> 'VERIFIED' OR (evidence_digest IS NOT NULL AND verified_by IS NOT NULL AND verified_at IS NOT NULL))
);
CREATE UNIQUE INDEX patient_mappings_active_local_ref
  ON highpass_v3.patient_mappings(tenant_id, hospital_id, local_ref_digest) WHERE deleted_at IS NULL;
CREATE INDEX patient_mappings_ref ON highpass_v3.patient_mappings(patient_ref);

-- An unset context is NULL and matches nothing. Invalid context fails closed.
ALTER TABLE highpass_v3.tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE highpass_v3.tenants FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_read ON highpass_v3.tenants FOR SELECT USING
  (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);
ALTER TABLE highpass_v3.hospitals ENABLE ROW LEVEL SECURITY;
ALTER TABLE highpass_v3.hospitals FORCE ROW LEVEL SECURITY;
CREATE POLICY hospital_read ON highpass_v3.hospitals FOR SELECT USING
  (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid
   AND hospital_id = nullif(current_setting('app.hospital_id', true), '')::uuid);
ALTER TABLE highpass_v3.patient_mappings ENABLE ROW LEVEL SECURITY;
ALTER TABLE highpass_v3.patient_mappings FORCE ROW LEVEL SECURITY;
CREATE POLICY mapping_context ON highpass_v3.patient_mappings USING
  (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid
   AND hospital_id = nullif(current_setting('app.hospital_id', true), '')::uuid
   AND EXISTS (SELECT 1 FROM highpass_v3.tenants t JOIN highpass_v3.hospitals h USING (tenant_id)
               WHERE t.tenant_id = patient_mappings.tenant_id AND h.hospital_id = patient_mappings.hospital_id
                 AND t.status = 'ACTIVE' AND h.status = 'ACTIVE'));
ALTER TABLE highpass_v3.patient_refs ENABLE ROW LEVEL SECURITY;
ALTER TABLE highpass_v3.patient_refs FORCE ROW LEVEL SECURITY;
CREATE POLICY patient_ref_read ON highpass_v3.patient_refs FOR SELECT USING
  (deleted_at IS NULL AND EXISTS (SELECT 1 FROM highpass_v3.patient_mappings m
                                 WHERE m.patient_ref = patient_refs.patient_ref AND m.deleted_at IS NULL));

-- No runtime role receives grants yet. Service-layer ABAC, identifier protection,
-- versioned state changes and transactional audit must precede runtime activation.
REVOKE ALL ON ALL TABLES IN SCHEMA highpass_v3 FROM PUBLIC;
