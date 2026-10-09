-- Synthetic internal issuance admission only. No runtime login/grants or approval.
CREATE POLICY approval_ceremony_read ON highpass_v3.consent_patient_ceremonies
 FOR SELECT TO hp_v3_consent_approval_policy USING
 (patient_actor_id=nullif(current_setting('app.actor_id',true),'')::uuid
  AND highpass_v3.approval_patient_context(owner_tenant_id,source_hospital_id,patient_ref));
CREATE POLICY approval_ceremony_insert ON highpass_v3.consent_patient_ceremonies
 FOR INSERT TO hp_v3_consent_approval_policy WITH CHECK
 (patient_actor_id=nullif(current_setting('app.actor_id',true),'')::uuid
  AND highpass_v3.approval_patient_context(owner_tenant_id,source_hospital_id,patient_ref));
CREATE POLICY approval_ceremony_audit_read ON highpass_v3.consent_patient_ceremony_audit
 FOR SELECT TO hp_v3_consent_approval_policy USING
 (patient_actor_id=nullif(current_setting('app.actor_id',true),'')::uuid
  AND highpass_v3.approval_patient_context(tenant_id,hospital_id,patient_ref));
CREATE POLICY approval_ceremony_audit_insert ON highpass_v3.consent_patient_ceremony_audit
 FOR INSERT TO hp_v3_consent_approval_policy WITH CHECK
 (patient_actor_id=nullif(current_setting('app.actor_id',true),'')::uuid
  AND highpass_v3.approval_patient_context(tenant_id,hospital_id,patient_ref));

ALTER TABLE highpass_v3.consent_patient_ceremonies ADD CONSTRAINT ceremony_issuance_receipt_tuple
 UNIQUE(ceremony_id,content_digest,issued_at,expires_at);
CREATE TABLE highpass_v3.consent_patient_challenge_results (
 tenant_id uuid NOT NULL,hospital_id uuid NOT NULL,patient_actor_id uuid NOT NULL,patient_ref uuid NOT NULL,
 operation text NOT NULL DEFAULT 'CHALLENGE_ISSUE' CHECK(operation='CHALLENGE_ISSUE'),
 key_digest bytea NOT NULL CHECK(octet_length(key_digest)=32),
 request_digest bytea NOT NULL CHECK(octet_length(request_digest)=32),
 ceremony_id uuid NOT NULL UNIQUE,preparation_id uuid NOT NULL,session_id uuid NOT NULL,
 session_version integer NOT NULL CHECK(session_version=1),content_digest bytea NOT NULL CHECK(octet_length(content_digest)=32),
 issued_at timestamptz NOT NULL CHECK(isfinite(issued_at)),expires_at timestamptz NOT NULL CHECK(isfinite(expires_at) AND expires_at>issued_at),
 response_status text NOT NULL DEFAULT 'ISSUED' CHECK(response_status='ISSUED'),
 PRIMARY KEY(tenant_id,hospital_id,patient_actor_id,operation,key_digest),
 FOREIGN KEY(ceremony_id,preparation_id,session_id,session_version,patient_ref,tenant_id,hospital_id,patient_actor_id)
 REFERENCES highpass_v3.consent_patient_ceremonies
 (ceremony_id,preparation_id,session_id,session_version,patient_ref,owner_tenant_id,source_hospital_id,patient_actor_id),
 FOREIGN KEY(ceremony_id,content_digest,issued_at,expires_at) REFERENCES highpass_v3.consent_patient_ceremonies
 (ceremony_id,content_digest,issued_at,expires_at)
);
ALTER TABLE highpass_v3.consent_patient_challenge_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE highpass_v3.consent_patient_challenge_results FORCE ROW LEVEL SECURITY;
REVOKE ALL ON highpass_v3.consent_patient_challenge_results FROM PUBLIC;
CREATE POLICY approval_challenge_result_read ON highpass_v3.consent_patient_challenge_results
 FOR SELECT TO hp_v3_consent_approval_policy USING
 (patient_actor_id=nullif(current_setting('app.actor_id',true),'')::uuid
  AND highpass_v3.approval_patient_context(tenant_id,hospital_id,patient_ref));
CREATE POLICY approval_challenge_result_insert ON highpass_v3.consent_patient_challenge_results
 FOR INSERT TO hp_v3_consent_approval_policy WITH CHECK
 (patient_actor_id=nullif(current_setting('app.actor_id',true),'')::uuid
  AND highpass_v3.approval_patient_context(tenant_id,hospital_id,patient_ref));
CREATE TRIGGER challenge_result_immutable BEFORE UPDATE OR DELETE ON highpass_v3.consent_patient_challenge_results
 FOR EACH ROW EXECUTE FUNCTION highpass_v3.reject_identity_audit_mutation();
CREATE FUNCTION highpass_v3.require_patient_challenge_result() RETURNS trigger
 LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM highpass_v3.consent_patient_challenge_results r WHERE r.ceremony_id=NEW.ceremony_id)
 THEN RAISE EXCEPTION 'V3_PATIENT_CHALLENGE_RESULT_REQUIRED' USING ERRCODE='23514'; END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER challenge_result_required AFTER INSERT ON highpass_v3.consent_patient_ceremonies
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION highpass_v3.require_patient_challenge_result();

-- Keep all023 validation, avoid SELECT * on the preparation (creator/commitment
-- are deliberately not granted to the patient role).
CREATE OR REPLACE FUNCTION highpass_v3.require_patient_ceremony_assembly() RETURNS trigger
 LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $$
DECLARE c highpass_v3.consent_patient_ceremonies; p record;
BEGIN
 SELECT * INTO c FROM highpass_v3.consent_patient_ceremonies WHERE ceremony_id=NEW.ceremony_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'V3_PATIENT_CEREMONY_ASSEMBLY_REQUIRED' USING ERRCODE='23514'; END IF;
 SELECT preparation_id,valid_from,valid_until,state,evidence_status INTO p
 FROM highpass_v3.consent_preparation_requests WHERE preparation_id=c.preparation_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'V3_PATIENT_CEREMONY_ASSEMBLY_REQUIRED' USING ERRCODE='23514'; END IF;
 IF c.patient_actor_id IS DISTINCT FROM nullif(current_setting('app.actor_id',true),'')::uuid
  OR c.owner_tenant_id IS DISTINCT FROM nullif(current_setting('app.tenant_id',true),'')::uuid
  OR c.source_hospital_id IS DISTINCT FROM nullif(current_setting('app.hospital_id',true),'')::uuid
  OR c.issued_at>clock_timestamp() OR c.expires_at<=clock_timestamp() OR c.expires_at>p.valid_until
  OR c.link_valid_from<p.valid_from OR c.link_valid_until>p.valid_until
  OR c.content_digest IS DISTINCT FROM highpass_v3.patient_consent_content_digest(c.preparation_id,
   c.link_clause_version,c.link_clause_digest,c.link_purpose,c.link_valid_from,c.link_valid_until)
  OR p.state<>'PENDING' OR p.evidence_status<>'UNVERIFIED'
  OR NOT EXISTS(SELECT 1 FROM highpass_v3.principal_bindings x
   JOIN highpass_v3.hospitals h ON h.hospital_id=x.hospital_id AND h.tenant_id=x.tenant_id
   JOIN highpass_v3.tenants t ON t.tenant_id=x.tenant_id
   WHERE x.actor_id=c.patient_actor_id AND x.tenant_id=c.owner_tenant_id AND x.hospital_id=c.source_hospital_id
    AND x.role='PATIENT' AND x.patient_ref=c.patient_ref AND 'consent:approve'=ANY(x.scopes)
    AND x.status='ACTIVE' AND h.status='ACTIVE' AND t.status='ACTIVE')
  OR NOT EXISTS(SELECT 1 FROM highpass_v3.patient_refs r WHERE r.patient_ref=c.patient_ref AND r.deleted_at IS NULL
   AND r.owner_tenant_id=c.owner_tenant_id AND r.owner_hospital_id=c.source_hospital_id)
  OR NOT EXISTS(SELECT 1 FROM highpass_v3.exchange_sessions s WHERE s.session_id=c.session_id
   AND s.state='REQUESTED' AND s.version=c.session_version AND s.valid_until>clock_timestamp())
  OR NOT EXISTS(SELECT 1 FROM highpass_v3.exchange_session_participants x WHERE x.session_id=c.session_id
   AND x.patient_ref=c.patient_ref AND x.tenant_id=c.owner_tenant_id AND x.hospital_id=c.source_hospital_id
   AND x.participant_role='SOURCE' AND x.status='ACTIVE')
  OR NOT EXISTS(SELECT 1 FROM highpass_v3.hospitals h JOIN highpass_v3.tenants t ON t.tenant_id=h.tenant_id
   WHERE h.hospital_id=c.target_hospital_id AND h.tenant_id=c.target_tenant_id AND h.status='ACTIVE' AND t.status='ACTIVE')
 THEN RAISE EXCEPTION 'V3_PATIENT_CEREMONY_ASSEMBLY_REQUIRED' USING ERRCODE='23514'; END IF;
 RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION highpass_v3.require_patient_challenge_result(),highpass_v3.require_patient_ceremony_assembly() FROM PUBLIC;
-- No consume/update/delete/approved artifact or deployed login enrollment.
