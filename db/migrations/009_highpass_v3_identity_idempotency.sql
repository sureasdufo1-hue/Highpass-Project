-- Durable result snapshots; no raw key/payload, no pending row committed.
-- SELECT FOR SHARE for replay must lock the owned ref until commit.
CREATE POLICY patient_ref_lock_only ON highpass_v3.patient_refs FOR UPDATE USING
  (owner_tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid
   AND owner_hospital_id=nullif(current_setting('app.hospital_id',true),'')::uuid
   AND deleted_at IS NULL) WITH CHECK(false);
CREATE TABLE highpass_v3.identity_write_results (
  tenant_id uuid NOT NULL,
  hospital_id uuid NOT NULL,
  actor_id uuid NOT NULL REFERENCES highpass_v3.principal_bindings(actor_id),
  operation text NOT NULL CHECK(operation IN ('PATIENT_REF_REGISTER','MAPPING_RECONCILE','MAPPING_REVIEW')),
  key_digest bytea NOT NULL CHECK(octet_length(key_digest)=32),
  request_digest bytea NOT NULL CHECK(octet_length(request_digest)=32),
  patient_ref uuid NOT NULL REFERENCES highpass_v3.patient_refs(patient_ref),
  mapping_id uuid REFERENCES highpass_v3.patient_mappings(mapping_id),
  response_metadata jsonb NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT statement_timestamp(),
  PRIMARY KEY(tenant_id,hospital_id,actor_id,operation,key_digest),
  FOREIGN KEY(tenant_id,hospital_id) REFERENCES highpass_v3.hospitals(tenant_id,hospital_id),
  CHECK(jsonb_typeof(response_metadata)='object'),
  CHECK(response_metadata->>'patientRefId'=patient_ref::text),
  CHECK(response_metadata ?& ARRAY['patientRefId','createdAt']),
  CHECK(jsonb_typeof(response_metadata->'patientRefId')='string'
    AND jsonb_typeof(response_metadata->'createdAt')='string'
    AND response_metadata->>'createdAt' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}[.][0-9]{3}Z$'),
  CHECK((operation='PATIENT_REF_REGISTER' AND mapping_id IS NULL
    AND response_metadata - ARRAY['patientRefId','createdAt']='{}'::jsonb)
    OR (operation<>'PATIENT_REF_REGISTER' AND mapping_id IS NOT NULL
    AND response_metadata->>'mappingId'=mapping_id::text
    AND response_metadata->>'tenantId'=tenant_id::text
    AND response_metadata->>'hospitalId'=hospital_id::text
    AND response_metadata ?& ARRAY['mappingId','tenantId','hospitalId','state','version','updatedAt']
    AND jsonb_typeof(response_metadata->'mappingId')='string'
    AND jsonb_typeof(response_metadata->'tenantId')='string'
    AND jsonb_typeof(response_metadata->'hospitalId')='string'
    AND response_metadata->>'state' IN ('NO_MATCH','MULTIPLE_MATCH','IDENTITY_CONFLICT','UNVERIFIED','VERIFIED')
    AND jsonb_typeof(response_metadata->'version')='number'
    AND response_metadata->>'version' ~ '^[1-9][0-9]{0,9}$'
    AND jsonb_typeof(response_metadata->'updatedAt')='string'
    AND response_metadata->>'updatedAt' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}[.][0-9]{3}Z$'
    AND (NOT response_metadata ? 'verifiedAt' OR (jsonb_typeof(response_metadata->'verifiedAt')='string'
      AND response_metadata->>'verifiedAt' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}[.][0-9]{3}Z$'))
    AND response_metadata - ARRAY['patientRefId','createdAt','mappingId','tenantId','hospitalId','state','version','updatedAt','verifiedAt']='{}'::jsonb))
);
ALTER TABLE highpass_v3.identity_write_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE highpass_v3.identity_write_results FORCE ROW LEVEL SECURITY;
CREATE POLICY identity_result_read ON highpass_v3.identity_write_results FOR SELECT USING
  (tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid
   AND hospital_id=nullif(current_setting('app.hospital_id',true),'')::uuid
   AND actor_id=nullif(current_setting('app.actor_id',true),'')::uuid);
CREATE POLICY identity_result_insert ON highpass_v3.identity_write_results FOR INSERT WITH CHECK
  (tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid
   AND hospital_id=nullif(current_setting('app.hospital_id',true),'')::uuid
   AND actor_id=nullif(current_setting('app.actor_id',true),'')::uuid
   AND EXISTS(SELECT 1 FROM highpass_v3.principal_bindings p WHERE p.actor_id=identity_write_results.actor_id
     AND p.tenant_id=identity_write_results.tenant_id AND p.hospital_id=identity_write_results.hospital_id
     AND p.status='ACTIVE'
     AND (CASE WHEN identity_write_results.operation='MAPPING_REVIEW' THEN 'mapping:review' ELSE 'mapping:write' END)=ANY(p.scopes))
   AND ((operation='PATIENT_REF_REGISTER' AND EXISTS(SELECT 1 FROM highpass_v3.patient_refs r
     WHERE r.patient_ref=identity_write_results.patient_ref AND r.deleted_at IS NULL
     AND r.owner_tenant_id=identity_write_results.tenant_id AND r.owner_hospital_id=identity_write_results.hospital_id
     AND r.registered_by=identity_write_results.actor_id))
     OR (operation<>'PATIENT_REF_REGISTER' AND EXISTS(SELECT 1 FROM highpass_v3.patient_mappings m
     WHERE m.mapping_id=identity_write_results.mapping_id AND m.patient_ref=identity_write_results.patient_ref
     AND m.tenant_id=identity_write_results.tenant_id AND m.hospital_id=identity_write_results.hospital_id AND m.deleted_at IS NULL))));
CREATE TRIGGER identity_results_immutable BEFORE UPDATE OR DELETE ON highpass_v3.identity_write_results
  FOR EACH ROW EXECUTE FUNCTION highpass_v3.reject_identity_audit_mutation();
REVOKE ALL ON highpass_v3.identity_write_results FROM PUBLIC;
