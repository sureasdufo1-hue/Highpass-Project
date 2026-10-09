-- Existing rows deliberately keep NULL registration, never infer their maker.
ALTER TABLE highpass_v3.patient_mappings ADD COLUMN registered_by uuid REFERENCES highpass_v3.principal_bindings(actor_id);
-- Root ownership record avoids mapping INSERT -> ref SELECT -> mapping RLS recursion.
ALTER TABLE highpass_v3.patient_refs ADD CONSTRAINT patient_ref_registration_tuple
 UNIQUE(patient_ref,owner_tenant_id,owner_hospital_id,registered_by);
CREATE TABLE highpass_v3.patient_ref_registrations (
 patient_ref uuid PRIMARY KEY,
 tenant_id uuid NOT NULL,
 hospital_id uuid NOT NULL,
 registered_by uuid NOT NULL,
 FOREIGN KEY(patient_ref,tenant_id,hospital_id,registered_by)
  REFERENCES highpass_v3.patient_refs(patient_ref,owner_tenant_id,owner_hospital_id,registered_by)
);
-- Copy only explicitly recorded ownership; legacy NULL ownership is not inferred.
INSERT INTO highpass_v3.patient_ref_registrations
 SELECT patient_ref,owner_tenant_id,owner_hospital_id,registered_by FROM highpass_v3.patient_refs
 WHERE owner_tenant_id IS NOT NULL AND owner_hospital_id IS NOT NULL AND registered_by IS NOT NULL;
ALTER TABLE highpass_v3.patient_ref_registrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE highpass_v3.patient_ref_registrations FORCE ROW LEVEL SECURITY;
CREATE POLICY ref_registration_read ON highpass_v3.patient_ref_registrations FOR SELECT USING
 (tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid
  AND hospital_id=nullif(current_setting('app.hospital_id',true),'')::uuid);
CREATE POLICY ref_registration_insert ON highpass_v3.patient_ref_registrations FOR INSERT WITH CHECK
 (tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid
  AND hospital_id=nullif(current_setting('app.hospital_id',true),'')::uuid
  AND registered_by=nullif(current_setting('app.actor_id',true),'')::uuid
  AND EXISTS(SELECT 1 FROM highpass_v3.principal_bindings p WHERE p.actor_id=patient_ref_registrations.registered_by
    AND p.tenant_id=patient_ref_registrations.tenant_id AND p.hospital_id=patient_ref_registrations.hospital_id
    AND p.status='ACTIVE' AND p.role IN ('HOSPITAL_ADMIN','SECURITY_ADMIN') AND 'mapping:write'=ANY(p.scopes)));
CREATE TRIGGER ref_registration_immutable BEFORE UPDATE OR DELETE ON highpass_v3.patient_ref_registrations
 FOR EACH ROW EXECUTE FUNCTION highpass_v3.reject_identity_audit_mutation();
REVOKE ALL ON highpass_v3.patient_ref_registrations FROM PUBLIC;
CREATE POLICY mapping_registration ON highpass_v3.patient_mappings AS RESTRICTIVE FOR INSERT WITH CHECK
 (registered_by=nullif(current_setting('app.actor_id',true),'')::uuid
  AND status='UNVERIFIED' AND version=1 AND evidence_digest IS NOT NULL
  AND verified_by IS NULL AND verified_at IS NULL
  AND EXISTS(SELECT 1 FROM highpass_v3.principal_bindings p WHERE p.actor_id=patient_mappings.registered_by
    AND p.tenant_id=patient_mappings.tenant_id AND p.hospital_id=patient_mappings.hospital_id
    AND p.status='ACTIVE' AND p.role IN ('HOSPITAL_ADMIN','SECURITY_ADMIN') AND 'mapping:write'=ANY(p.scopes))
  AND EXISTS(SELECT 1 FROM highpass_v3.patient_ref_registrations r WHERE r.patient_ref=patient_mappings.patient_ref
   AND r.tenant_id=patient_mappings.tenant_id AND r.hospital_id=patient_mappings.hospital_id));

CREATE FUNCTION highpass_v3.guard_mapping_review() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE actor uuid := nullif(current_setting('app.actor_id',true),'')::uuid;
BEGIN
 IF OLD.registered_by IS NULL THEN
  IF NEW.registered_by IS DISTINCT FROM OLD.registered_by THEN
   RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='MAPPING_MAKER_BACKFILL_FORBIDDEN';
  END IF;
  RETURN NEW;
 END IF;
 IF (NEW.tenant_id,NEW.hospital_id,NEW.patient_ref,NEW.registered_by,NEW.protected_local_ref,NEW.local_ref_digest)
   IS DISTINCT FROM (OLD.tenant_id,OLD.hospital_id,OLD.patient_ref,OLD.registered_by,OLD.protected_local_ref,OLD.local_ref_digest)
   OR NEW.version<>OLD.version+1 OR NEW.evidence_digest IS NULL THEN
  RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='MAPPING_TRANSITION_INVALID';
 END IF;
 IF NOT EXISTS(SELECT 1 FROM highpass_v3.principal_bindings p WHERE p.actor_id=actor
   AND p.tenant_id=OLD.tenant_id AND p.hospital_id=OLD.hospital_id AND p.status='ACTIVE'
   AND p.role IN ('HOSPITAL_ADMIN','SECURITY_ADMIN')
   AND ((actor<>OLD.registered_by AND 'mapping:review'=ANY(p.scopes))
    OR (NEW.status='IDENTITY_CONFLICT' AND 'mapping:write'=ANY(p.scopes)))) THEN
  RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='MAPPING_REVIEW_NOT_AUTHORIZED';
 END IF;
 IF NEW.status='VERIFIED' THEN
  IF actor=OLD.registered_by OR NEW.verified_by IS DISTINCT FROM actor OR NEW.verified_at IS NULL THEN
   RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='MAPPING_SELF_REVIEW_FORBIDDEN';
  END IF;
 ELSIF NEW.verified_by IS NOT NULL OR NEW.verified_at IS NOT NULL THEN
  RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='MAPPING_VERIFIER_CLEAR_REQUIRED';
 END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER mapping_transition_guard BEFORE UPDATE ON highpass_v3.patient_mappings
 FOR EACH ROW EXECUTE FUNCTION highpass_v3.guard_mapping_review();

CREATE FUNCTION highpass_v3.require_mapping_audit() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
 IF NEW.registered_by IS NULL THEN RETURN NULL; END IF;
 IF NOT EXISTS(SELECT 1 FROM highpass_v3.patient_refs r WHERE r.patient_ref=NEW.patient_ref
   AND r.deleted_at IS NULL AND r.owner_tenant_id=NEW.tenant_id AND r.owner_hospital_id=NEW.hospital_id) THEN
  RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='MAPPING_OWNED_REF_REQUIRED';
 END IF;
 IF NOT EXISTS(SELECT 1 FROM highpass_v3.identity_audit_outbox a WHERE a.mapping_id=NEW.mapping_id
   AND a.tenant_id=NEW.tenant_id AND a.hospital_id=NEW.hospital_id
   AND a.actor_id=nullif(current_setting('app.actor_id',true),'')::uuid
   AND a.mapping_version=NEW.version AND a.new_state=NEW.status AND a.evidence_digest=NEW.evidence_digest
   AND a.old_state IS NOT DISTINCT FROM (CASE WHEN TG_OP='UPDATE' THEN OLD.status ELSE NULL END)
   AND ((TG_OP='INSERT' AND a.action='MAPPING_CREATED' AND a.result='ALLOW')
    OR (TG_OP='UPDATE' AND ((a.action='MAPPING_REVIEWED' AND a.result='ALLOW') OR (a.action='MAPPING_CONFLICT' AND a.result='DENY'))))) THEN
  RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='MAPPING_AUDIT_REQUIRED';
 END IF;
 RETURN NULL;
END; $$;
CREATE CONSTRAINT TRIGGER mapping_audit_required AFTER INSERT OR UPDATE ON highpass_v3.patient_mappings
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION highpass_v3.require_mapping_audit();
REVOKE ALL ON FUNCTION highpass_v3.guard_mapping_review(),highpass_v3.require_mapping_audit() FROM PUBLIC;
