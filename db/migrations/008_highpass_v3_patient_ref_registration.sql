-- Additive bootstrap. No inferred ownership/backfill for existing global refs.
ALTER TABLE highpass_v3.patient_refs
  ADD COLUMN owner_tenant_id uuid,
  ADD COLUMN owner_hospital_id uuid,
  ADD COLUMN registered_by uuid REFERENCES highpass_v3.principal_bindings(actor_id),
  ADD CONSTRAINT patient_ref_owner_fk FOREIGN KEY(owner_tenant_id,owner_hospital_id)
    REFERENCES highpass_v3.hospitals(tenant_id,hospital_id),
  ADD CONSTRAINT patient_ref_owner_complete CHECK
    ((owner_tenant_id IS NULL AND owner_hospital_id IS NULL AND registered_by IS NULL) OR
     (owner_tenant_id IS NOT NULL AND owner_hospital_id IS NOT NULL AND registered_by IS NOT NULL));

CREATE POLICY patient_ref_owner_read ON highpass_v3.patient_refs FOR SELECT USING
  (deleted_at IS NULL
   AND owner_tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid
   AND owner_hospital_id=nullif(current_setting('app.hospital_id',true),'')::uuid
   AND EXISTS (SELECT 1 FROM highpass_v3.principal_bindings p
      JOIN highpass_v3.tenants t ON t.tenant_id=p.tenant_id
      JOIN highpass_v3.hospitals h ON h.tenant_id=p.tenant_id AND h.hospital_id=p.hospital_id
      WHERE p.actor_id=nullif(current_setting('app.actor_id',true),'')::uuid
      AND p.tenant_id=patient_refs.owner_tenant_id AND p.hospital_id=patient_refs.owner_hospital_id
      AND p.status='ACTIVE' AND t.status='ACTIVE' AND h.status='ACTIVE'));
CREATE POLICY patient_ref_register ON highpass_v3.patient_refs FOR INSERT WITH CHECK
  (owner_tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid
   AND owner_hospital_id=nullif(current_setting('app.hospital_id',true),'')::uuid
   AND registered_by=nullif(current_setting('app.actor_id',true),'')::uuid
   AND deleted_at IS NULL
   AND EXISTS (SELECT 1 FROM highpass_v3.principal_bindings p
      JOIN highpass_v3.tenants t ON t.tenant_id=p.tenant_id
      JOIN highpass_v3.hospitals h ON h.tenant_id=p.tenant_id AND h.hospital_id=p.hospital_id
      WHERE p.actor_id=patient_refs.registered_by AND p.tenant_id=patient_refs.owner_tenant_id
      AND p.hospital_id=patient_refs.owner_hospital_id
      AND p.role IN ('HOSPITAL_ADMIN','SECURITY_ADMIN') AND 'mapping:write'=ANY(p.scopes)
      AND p.status='ACTIVE' AND t.status='ACTIVE' AND h.status='ACTIVE'));

ALTER TABLE highpass_v3.identity_audit_outbox
  ADD COLUMN patient_ref uuid REFERENCES highpass_v3.patient_refs(patient_ref);
ALTER TABLE highpass_v3.identity_audit_outbox DROP CONSTRAINT identity_audit_outbox_action_check;
ALTER TABLE highpass_v3.identity_audit_outbox ADD CONSTRAINT identity_audit_outbox_action_check
  CHECK(action IN ('MAPPING_CREATED','MAPPING_REVIEWED','MAPPING_CONFLICT','MAPPING_READ','MAPPING_DENIED','PATIENT_REF_CREATED'));
ALTER TABLE highpass_v3.identity_audit_outbox ADD CONSTRAINT patient_ref_creation_event CHECK
  (action<>'PATIENT_REF_CREATED' OR (patient_ref IS NOT NULL AND mapping_id IS NULL
   AND old_state IS NULL AND new_state IS NULL AND result='ALLOW' AND reason_code='PATIENT_REF_REGISTERED'));
-- AND with existing scoped append policy, never a permissive OR bypass.
CREATE POLICY identity_audit_patient_ref ON highpass_v3.identity_audit_outbox AS RESTRICTIVE
  FOR INSERT WITH CHECK(patient_ref IS NULL OR EXISTS
    (SELECT 1 FROM highpass_v3.patient_refs r WHERE r.patient_ref=identity_audit_outbox.patient_ref
      AND r.owner_tenant_id=identity_audit_outbox.tenant_id
      AND r.owner_hospital_id=identity_audit_outbox.hospital_id AND r.deleted_at IS NULL
      AND (identity_audit_outbox.action<>'PATIENT_REF_CREATED' OR r.registered_by=identity_audit_outbox.actor_id)));
-- Runtime provisioning is separate; no grants or SECURITY DEFINER here.
