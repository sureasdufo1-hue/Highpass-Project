-- Additive P0-04, requires 006. No runtime role or credential provisioning.
CREATE TABLE highpass_v3.principal_bindings (
  actor_id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL,
  hospital_id uuid NOT NULL,
  role text NOT NULL CHECK (role IN ('PATIENT','DOCTOR','HOSPITAL_ADMIN','SECURITY_ADMIN','PLATFORM_ADMIN')),
  scopes text[] NOT NULL,
  status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','SUSPENDED','REVOKED')),
  patient_ref uuid REFERENCES highpass_v3.patient_refs(patient_ref),
  FOREIGN KEY (tenant_id, hospital_id) REFERENCES highpass_v3.hospitals(tenant_id, hospital_id),
  CHECK (role <> 'PATIENT' OR patient_ref IS NOT NULL)
);
ALTER TABLE highpass_v3.principal_bindings ENABLE ROW LEVEL SECURITY;
ALTER TABLE highpass_v3.principal_bindings FORCE ROW LEVEL SECURITY;
CREATE POLICY principal_self_read ON highpass_v3.principal_bindings FOR SELECT USING
  (actor_id = nullif(current_setting('app.actor_id',true),'')::uuid
   AND tenant_id = nullif(current_setting('app.tenant_id',true),'')::uuid
   AND hospital_id = nullif(current_setting('app.hospital_id',true),'')::uuid);

-- FOR SHARE needs UPDATE privilege and an applicable UPDATE USING policy.
-- Visibility for locking is scoped; WITH CHECK(false) forbids all actual writes.
CREATE POLICY tenant_lock_only ON highpass_v3.tenants FOR UPDATE USING
  (tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid) WITH CHECK(false);
CREATE POLICY hospital_lock_only ON highpass_v3.hospitals FOR UPDATE USING
  (tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid
   AND hospital_id=nullif(current_setting('app.hospital_id',true),'')::uuid) WITH CHECK(false);
CREATE POLICY principal_lock_only ON highpass_v3.principal_bindings FOR UPDATE USING
  (actor_id=nullif(current_setting('app.actor_id',true),'')::uuid
   AND tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid
   AND hospital_id=nullif(current_setting('app.hospital_id',true),'')::uuid) WITH CHECK(false);

CREATE TABLE highpass_v3.identity_audit_outbox (
  event_id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL,
  hospital_id uuid NOT NULL,
  actor_id uuid NOT NULL REFERENCES highpass_v3.principal_bindings(actor_id),
  mapping_id uuid REFERENCES highpass_v3.patient_mappings(mapping_id),
  audit_session_id uuid NOT NULL,
  trace_id text NOT NULL CHECK (trace_id ~ '^[A-Za-z0-9_-]{16,64}$'),
  action text NOT NULL CHECK (action IN ('MAPPING_CREATED','MAPPING_REVIEWED','MAPPING_CONFLICT','MAPPING_READ','MAPPING_DENIED')),
  result text NOT NULL CHECK (result IN ('ALLOW','DENY')),
  reason_code text NOT NULL CHECK (reason_code ~ '^[A-Z][A-Z0-9_]{1,63}$'),
  old_state text CHECK (old_state IN ('NO_MATCH','MULTIPLE_MATCH','IDENTITY_CONFLICT','UNVERIFIED','VERIFIED')),
  new_state text CHECK (new_state IN ('NO_MATCH','MULTIPLE_MATCH','IDENTITY_CONFLICT','UNVERIFIED','VERIFIED')),
  mapping_version integer,
  evidence_digest bytea CHECK (octet_length(evidence_digest)=32),
  occurred_at timestamptz NOT NULL DEFAULT statement_timestamp(),
  FOREIGN KEY (tenant_id,hospital_id) REFERENCES highpass_v3.hospitals(tenant_id,hospital_id),
  CHECK ((mapping_id IS NULL AND mapping_version IS NULL) OR
         (mapping_id IS NOT NULL AND mapping_version IS NOT NULL AND mapping_version>0))
);
CREATE INDEX identity_audit_tenant_time ON highpass_v3.identity_audit_outbox(tenant_id,occurred_at);
ALTER TABLE highpass_v3.identity_audit_outbox ENABLE ROW LEVEL SECURITY;
ALTER TABLE highpass_v3.identity_audit_outbox FORCE ROW LEVEL SECURITY;
CREATE POLICY identity_audit_read ON highpass_v3.identity_audit_outbox FOR SELECT USING
  (tenant_id = nullif(current_setting('app.tenant_id',true),'')::uuid
   AND hospital_id = nullif(current_setting('app.hospital_id',true),'')::uuid
   AND actor_id = nullif(current_setting('app.actor_id',true),'')::uuid);
CREATE POLICY identity_audit_append ON highpass_v3.identity_audit_outbox FOR INSERT WITH CHECK
  (tenant_id = nullif(current_setting('app.tenant_id',true),'')::uuid
   AND hospital_id = nullif(current_setting('app.hospital_id',true),'')::uuid
   AND actor_id = nullif(current_setting('app.actor_id',true),'')::uuid
   AND (mapping_id IS NULL OR EXISTS (SELECT 1 FROM highpass_v3.patient_mappings m WHERE m.mapping_id=identity_audit_outbox.mapping_id
               AND m.tenant_id=identity_audit_outbox.tenant_id AND m.hospital_id=identity_audit_outbox.hospital_id
               AND m.version=identity_audit_outbox.mapping_version
               AND (identity_audit_outbox.new_state IS NULL OR m.status=identity_audit_outbox.new_state)))
   AND EXISTS (SELECT 1 FROM highpass_v3.principal_bindings p WHERE p.actor_id=identity_audit_outbox.actor_id
               AND p.tenant_id=identity_audit_outbox.tenant_id AND p.hospital_id=identity_audit_outbox.hospital_id AND p.status='ACTIVE'));

CREATE FUNCTION highpass_v3.reject_identity_audit_mutation() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog AS $$
BEGIN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='IDENTITY_AUDIT_APPEND_ONLY'; END;
$$;
CREATE TRIGGER identity_audit_immutable BEFORE UPDATE OR DELETE ON highpass_v3.identity_audit_outbox
FOR EACH ROW EXECUTE FUNCTION highpass_v3.reject_identity_audit_mutation();
REVOKE ALL ON FUNCTION highpass_v3.reject_identity_audit_mutation() FROM PUBLIC;
REVOKE ALL ON highpass_v3.principal_bindings,highpass_v3.identity_audit_outbox FROM PUBLIC;
