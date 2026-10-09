-- Additive isolated foundation only. No runtime grants, credentials or scheduler.
CREATE ROLE hp_v3_consent_withdraw_policy NOLOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;
CREATE ROLE hp_v3_consent_expiry_policy NOLOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;
ALTER TABLE highpass_v3.principal_bindings DROP CONSTRAINT principal_service_purpose,
 ADD CONSTRAINT principal_service_purpose CHECK
 (CASE WHEN role='INTERNAL_SERVICE' THEN patient_ref IS NULL AND
   ((service_purpose IS NOT DISTINCT FROM 'SESSION_EXPIRY' AND scopes IS NOT DISTINCT FROM ARRAY['exchange:expire']::text[])
    OR (service_purpose IS NOT DISTINCT FROM 'CONSENT_EXPIRY' AND scopes IS NOT DISTINCT FROM ARRAY['consent:expire']::text[]))
  ELSE service_purpose IS NULL AND array_position(scopes,'exchange:expire') IS NULL
   AND array_position(scopes,'consent:expire') IS NULL AND array_position(scopes,NULL) IS NULL END);

CREATE FUNCTION highpass_v3.consent_lifecycle_context(tenant uuid,hospital uuid,patient uuid,operation text) RETURNS boolean
 LANGUAGE sql STABLE SECURITY INVOKER SET search_path=pg_catalog AS $$
 SELECT tenant=nullif(current_setting('app.tenant_id',true),'')::uuid
 AND hospital=nullif(current_setting('app.hospital_id',true),'')::uuid
 AND EXISTS(SELECT 1 FROM highpass_v3.principal_bindings p
  JOIN highpass_v3.tenants t ON t.tenant_id=p.tenant_id
  JOIN highpass_v3.hospitals h ON h.tenant_id=p.tenant_id AND h.hospital_id=p.hospital_id
  WHERE p.actor_id=nullif(current_setting('app.actor_id',true),'')::uuid
   AND p.tenant_id=tenant AND p.hospital_id=hospital AND p.status='ACTIVE' AND t.status='ACTIVE' AND h.status='ACTIVE'
   AND ((operation='CONSENT_WITHDRAW' AND p.role='PATIENT' AND p.patient_ref=patient AND 'consent:withdraw'=ANY(p.scopes))
    OR (operation='CONSENT_EXPIRE' AND p.role='INTERNAL_SERVICE' AND p.service_purpose='CONSENT_EXPIRY'
     AND p.patient_ref IS NULL AND p.scopes=ARRAY['consent:expire']::text[])))
$$;
CREATE POLICY withdrawal_ref_read ON highpass_v3.patient_refs FOR SELECT TO hp_v3_consent_withdraw_policy USING
 (deleted_at IS NULL AND highpass_v3.consent_lifecycle_context(owner_tenant_id,owner_hospital_id,patient_ref,'CONSENT_WITHDRAW'));
CREATE POLICY withdrawal_ref_lock ON highpass_v3.patient_refs FOR UPDATE TO hp_v3_consent_withdraw_policy USING
 (deleted_at IS NULL AND highpass_v3.consent_lifecycle_context(owner_tenant_id,owner_hospital_id,patient_ref,'CONSENT_WITHDRAW')) WITH CHECK(false);
CREATE POLICY withdrawal_content_read ON highpass_v3.consent_content_versions FOR SELECT TO hp_v3_consent_withdraw_policy USING
 (highpass_v3.consent_lifecycle_context(owner_tenant_id,source_hospital_id,patient_ref,'CONSENT_WITHDRAW'));
CREATE POLICY expiry_content_read ON highpass_v3.consent_content_versions FOR SELECT TO hp_v3_consent_expiry_policy USING
 (highpass_v3.consent_lifecycle_context(owner_tenant_id,source_hospital_id,patient_ref,'CONSENT_EXPIRE'));
CREATE POLICY withdrawal_initial_event_read ON highpass_v3.consent_state_events FOR SELECT TO hp_v3_consent_withdraw_policy USING
 (highpass_v3.consent_lifecycle_context(tenant_id,hospital_id,patient_ref,'CONSENT_WITHDRAW'));
CREATE POLICY expiry_initial_event_read ON highpass_v3.consent_state_events FOR SELECT TO hp_v3_consent_expiry_policy USING
 (highpass_v3.consent_lifecycle_context(tenant_id,hospital_id,patient_ref,'CONSENT_EXPIRE'));

ALTER TABLE highpass_v3.consent_content_versions ADD CONSTRAINT lifecycle_content_identity
 UNIQUE(consent_id,content_version,patient_ref,owner_tenant_id,source_hospital_id,patient_actor_id,content_digest,valid_until,policy_version);
CREATE TABLE highpass_v3.consent_lifecycle_events (
 event_id uuid PRIMARY KEY,consent_id uuid NOT NULL,content_version integer NOT NULL CHECK(content_version=1),
 event_sequence integer NOT NULL DEFAULT 3 CHECK(event_sequence=3),
 predecessor_id uuid NOT NULL,predecessor_sequence integer NOT NULL DEFAULT 2 CHECK(predecessor_sequence=2),
 predecessor_state text NOT NULL DEFAULT 'ACTIVE' CHECK(predecessor_state='ACTIVE'),
 predecessor_at timestamptz NOT NULL CHECK(isfinite(predecessor_at)),
 tenant_id uuid NOT NULL,hospital_id uuid NOT NULL,patient_ref uuid NOT NULL,subject_actor_id uuid NOT NULL,
 actor_id uuid NOT NULL REFERENCES highpass_v3.principal_bindings(actor_id),actor_role text NOT NULL,actor_purpose text NOT NULL,
 operation text NOT NULL,state text NOT NULL,content_digest bytea NOT NULL CHECK(octet_length(content_digest)=32),
 valid_until timestamptz NOT NULL CHECK(isfinite(valid_until)),policy_version text NOT NULL,
 effective_at timestamptz NOT NULL CHECK(isfinite(effective_at)),recorded_at timestamptz NOT NULL CHECK(isfinite(recorded_at)),
 assurance_kind text NOT NULL,reauthenticated_at timestamptz,max_reauth_age_ms integer,
 audit_session_id uuid NOT NULL,trace_id text NOT NULL CHECK(trace_id ~ '^[A-Za-z0-9_-]{16,64}$'),
 reason_code text NOT NULL,key_digest bytea NOT NULL CHECK(octet_length(key_digest)=32),
 request_digest bytea NOT NULL CHECK(octet_length(request_digest)=32),evidence_digest bytea NOT NULL CHECK(octet_length(evidence_digest)=32),
 UNIQUE(consent_id,content_version),
 CHECK(recorded_at>=predecessor_at AND effective_at<=recorded_at),
 CHECK(CASE WHEN operation='CONSENT_WITHDRAW' THEN state='WITHDRAWN' AND actor_role='PATIENT'
   AND actor_purpose='PATIENT_WITHDRAWAL' AND reason_code='PATIENT_WITHDRAWN'
   AND assurance_kind='SIGNED_SYNTHETIC_REAUTH_ONLY' AND reauthenticated_at IS NOT NULL
   AND max_reauth_age_ms IS NOT NULL AND max_reauth_age_ms BETWEEN 1000 AND 300000
   AND isfinite(reauthenticated_at) AND reauthenticated_at<=recorded_at
   AND recorded_at-reauthenticated_at<=max_reauth_age_ms*interval '1 millisecond'
   AND effective_at=recorded_at AND recorded_at<valid_until
  WHEN operation='CONSENT_EXPIRE' THEN state='EXPIRED' AND actor_role='INTERNAL_SERVICE'
   AND actor_purpose='CONSENT_EXPIRY' AND reason_code='CONSENT_DEADLINE_EXPIRED'
   AND assurance_kind='REGISTERED_SERVICE_ONLY' AND reauthenticated_at IS NULL AND max_reauth_age_ms IS NULL
   AND effective_at=valid_until AND recorded_at>=valid_until
  ELSE false END),
 FOREIGN KEY(consent_id,content_version,patient_ref,tenant_id,hospital_id,subject_actor_id,content_digest,valid_until,policy_version)
 REFERENCES highpass_v3.consent_content_versions
 (consent_id,content_version,patient_ref,owner_tenant_id,source_hospital_id,patient_actor_id,content_digest,valid_until,policy_version),
 FOREIGN KEY(predecessor_id,consent_id,content_version,predecessor_sequence,predecessor_state,predecessor_at)
 REFERENCES highpass_v3.consent_state_events(event_id,consent_id,content_version,event_sequence,state,occurred_at),
 UNIQUE(event_id,consent_id,content_version,tenant_id,hospital_id,patient_ref,actor_id,evidence_digest),
 UNIQUE(event_id,tenant_id,hospital_id,actor_id,operation,key_digest,request_digest,state,effective_at,recorded_at,evidence_digest)
);
-- Same typed tuple; digest and deferred full-row comparison prevent audit drift.
CREATE TABLE highpass_v3.consent_lifecycle_audit (LIKE highpass_v3.consent_lifecycle_events INCLUDING DEFAULTS INCLUDING CONSTRAINTS);
ALTER TABLE highpass_v3.consent_lifecycle_audit ADD PRIMARY KEY(event_id),
 ADD UNIQUE(event_id,consent_id,content_version,tenant_id,hospital_id,patient_ref,actor_id,evidence_digest),
 ADD FOREIGN KEY(event_id,consent_id,content_version,tenant_id,hospital_id,patient_ref,actor_id,evidence_digest)
 REFERENCES highpass_v3.consent_lifecycle_events(event_id,consent_id,content_version,tenant_id,hospital_id,patient_ref,actor_id,evidence_digest)
 DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE highpass_v3.consent_lifecycle_events ADD CONSTRAINT lifecycle_audit_required
 FOREIGN KEY(event_id,consent_id,content_version,tenant_id,hospital_id,patient_ref,actor_id,evidence_digest)
 REFERENCES highpass_v3.consent_lifecycle_audit(event_id,consent_id,content_version,tenant_id,hospital_id,patient_ref,actor_id,evidence_digest)
 DEFERRABLE INITIALLY DEFERRED;
CREATE TABLE highpass_v3.consent_lifecycle_results (
 event_id uuid NOT NULL UNIQUE,tenant_id uuid NOT NULL,hospital_id uuid NOT NULL,actor_id uuid NOT NULL,
 operation text NOT NULL CHECK(operation IN ('CONSENT_WITHDRAW','CONSENT_EXPIRE')),
 key_digest bytea NOT NULL,request_digest bytea NOT NULL,state text NOT NULL,
 effective_at timestamptz NOT NULL,recorded_at timestamptz NOT NULL,evidence_digest bytea NOT NULL,
 PRIMARY KEY(tenant_id,hospital_id,actor_id,operation,key_digest),
 FOREIGN KEY(event_id,tenant_id,hospital_id,actor_id,operation,key_digest,request_digest,state,effective_at,recorded_at,evidence_digest)
 REFERENCES highpass_v3.consent_lifecycle_events
 (event_id,tenant_id,hospital_id,actor_id,operation,key_digest,request_digest,state,effective_at,recorded_at,evidence_digest)
 DEFERRABLE INITIALLY DEFERRED
);
CREATE TABLE highpass_v3.consent_lifecycle_cascade (
 event_id uuid PRIMARY KEY REFERENCES highpass_v3.consent_lifecycle_events(event_id) DEFERRABLE INITIALLY DEFERRED,
 status text NOT NULL DEFAULT 'REQUESTED' CHECK(status='REQUESTED')
);
CREATE FUNCTION highpass_v3.consent_lifecycle_evidence(payload jsonb) RETURNS bytea
 LANGUAGE sql IMMUTABLE SECURITY INVOKER SET search_path=pg_catalog AS $$
 SELECT sha256(convert_to(jsonb_build_array('HP-V3-CONSENT-LIFECYCLE-PG16-V1',payload-'evidence_digest')::text,'UTF8'))
$$;
CREATE FUNCTION highpass_v3.require_consent_lifecycle_assembly() RETURNS trigger
 LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $$
DECLARE e highpass_v3.consent_lifecycle_events; a highpass_v3.consent_lifecycle_audit;
BEGIN
 SELECT * INTO e FROM highpass_v3.consent_lifecycle_events WHERE event_id=NEW.event_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'V3_CONSENT_LIFECYCLE_ASSEMBLY_REQUIRED' USING ERRCODE='23514'; END IF;
 SELECT * INTO a FROM highpass_v3.consent_lifecycle_audit WHERE event_id=e.event_id;
 IF NOT FOUND OR to_jsonb(a) IS DISTINCT FROM to_jsonb(e)
  OR e.actor_id IS DISTINCT FROM nullif(current_setting('app.actor_id',true),'')::uuid
  OR highpass_v3.consent_lifecycle_context(e.tenant_id,e.hospital_id,e.patient_ref,e.operation) IS NOT TRUE
  OR e.evidence_digest IS DISTINCT FROM highpass_v3.consent_lifecycle_evidence(to_jsonb(e))
  OR e.recorded_at>clock_timestamp()
  OR NOT EXISTS(SELECT 1 FROM highpass_v3.principal_bindings p WHERE p.actor_id=e.actor_id AND p.role=e.actor_role
   AND ((e.operation='CONSENT_WITHDRAW' AND p.service_purpose IS NULL) OR p.service_purpose=e.actor_purpose))
  OR NOT EXISTS(SELECT 1 FROM highpass_v3.consent_lifecycle_results r WHERE r.event_id=e.event_id)
  OR NOT EXISTS(SELECT 1 FROM highpass_v3.consent_lifecycle_cascade c WHERE c.event_id=e.event_id AND c.status='REQUESTED')
 THEN RAISE EXCEPTION 'V3_CONSENT_LIFECYCLE_ASSEMBLY_REQUIRED' USING ERRCODE='23514'; END IF;
 -- Do not use a boolean AND as permission-level control flow: generic SQL
 -- plans still contain patient_refs. Maintenance must not need that privilege.
 IF e.operation='CONSENT_WITHDRAW' THEN
  IF e.valid_until<=clock_timestamp()
   OR e.reauthenticated_at+e.max_reauth_age_ms*interval '1 millisecond'<=clock_timestamp()
   OR NOT EXISTS(SELECT 1 FROM highpass_v3.patient_refs r WHERE r.patient_ref=e.patient_ref
    AND r.owner_tenant_id=e.tenant_id AND r.owner_hospital_id=e.hospital_id AND r.deleted_at IS NULL)
  THEN RAISE EXCEPTION 'V3_CONSENT_LIFECYCLE_ASSEMBLY_REQUIRED' USING ERRCODE='23514'; END IF;
 END IF;
 RETURN NULL;
END $$;
DO $$ DECLARE n text;
BEGIN
 FOREACH n IN ARRAY ARRAY['consent_lifecycle_events','consent_lifecycle_audit','consent_lifecycle_results','consent_lifecycle_cascade'] LOOP
  EXECUTE format('ALTER TABLE highpass_v3.%I ENABLE ROW LEVEL SECURITY',n);
  EXECUTE format('ALTER TABLE highpass_v3.%I FORCE ROW LEVEL SECURITY',n);
  EXECUTE format('REVOKE ALL ON highpass_v3.%I FROM PUBLIC',n);
  EXECUTE format('CREATE TRIGGER lifecycle_immutable BEFORE UPDATE OR DELETE ON highpass_v3.%I FOR EACH ROW EXECUTE FUNCTION highpass_v3.reject_identity_audit_mutation()',n);
  EXECUTE format('CREATE CONSTRAINT TRIGGER lifecycle_assembly_required AFTER INSERT ON highpass_v3.%I DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION highpass_v3.require_consent_lifecycle_assembly()',n);
 END LOOP;
 FOREACH n IN ARRAY ARRAY['consent_lifecycle_events','consent_lifecycle_audit'] LOOP
  EXECUTE format('CREATE POLICY withdraw_context ON highpass_v3.%I FOR ALL TO hp_v3_consent_withdraw_policy
   USING (operation=''CONSENT_WITHDRAW'' AND actor_id=nullif(current_setting(''app.actor_id'',true),'''')::uuid
    AND highpass_v3.consent_lifecycle_context(tenant_id,hospital_id,patient_ref,operation))
   WITH CHECK(operation=''CONSENT_WITHDRAW'' AND actor_id=nullif(current_setting(''app.actor_id'',true),'''')::uuid
    AND highpass_v3.consent_lifecycle_context(tenant_id,hospital_id,patient_ref,operation))',n);
  EXECUTE format('CREATE POLICY expiry_context ON highpass_v3.%I FOR ALL TO hp_v3_consent_expiry_policy
   USING (operation=''CONSENT_EXPIRE'' AND actor_id=nullif(current_setting(''app.actor_id'',true),'''')::uuid
    AND highpass_v3.consent_lifecycle_context(tenant_id,hospital_id,patient_ref,operation))
   WITH CHECK(operation=''CONSENT_EXPIRE'' AND actor_id=nullif(current_setting(''app.actor_id'',true),'''')::uuid
    AND highpass_v3.consent_lifecycle_context(tenant_id,hospital_id,patient_ref,operation))',n);
 END LOOP;
 FOREACH n IN ARRAY ARRAY['consent_lifecycle_results','consent_lifecycle_cascade'] LOOP
  EXECUTE format('CREATE POLICY lifecycle_child ON highpass_v3.%I FOR ALL TO hp_v3_consent_withdraw_policy,hp_v3_consent_expiry_policy
   USING (EXISTS(SELECT 1 FROM highpass_v3.consent_lifecycle_events e WHERE e.event_id=%I.event_id))
   WITH CHECK(EXISTS(SELECT 1 FROM highpass_v3.consent_lifecycle_events e WHERE e.event_id=%I.event_id))',n,n,n);
 END LOOP;
END $$;
-- Withdrawal must observe an expiry written by a DIFFERENT maintenance actor.
-- Internal own-history visibility only; not an unaudited public evidence API.
CREATE POLICY withdrawal_terminal_history ON highpass_v3.consent_lifecycle_events FOR SELECT TO hp_v3_consent_withdraw_policy USING
 (highpass_v3.consent_lifecycle_context(tenant_id,hospital_id,patient_ref,'CONSENT_WITHDRAW'));
-- Maintenance must observe an already committed withdrawal, without inheriting
-- the patient's result ledger or audit authority. Source-bound internal read only.
CREATE POLICY expiry_terminal_history ON highpass_v3.consent_lifecycle_events FOR SELECT TO hp_v3_consent_expiry_policy USING
 (highpass_v3.consent_lifecycle_context(tenant_id,hospital_id,patient_ref,'CONSENT_EXPIRE'));
CREATE POLICY expiry_result_actor_read ON highpass_v3.consent_lifecycle_results AS RESTRICTIVE FOR SELECT TO hp_v3_consent_expiry_policy USING
 (actor_id=nullif(current_setting('app.actor_id',true),'')::uuid AND operation='CONSENT_EXPIRE');
CREATE POLICY expiry_cascade_actor_read ON highpass_v3.consent_lifecycle_cascade AS RESTRICTIVE FOR SELECT TO hp_v3_consent_expiry_policy USING
 (EXISTS(SELECT 1 FROM highpass_v3.consent_lifecycle_events e WHERE e.event_id=consent_lifecycle_cascade.event_id
   AND e.actor_id=nullif(current_setting('app.actor_id',true),'')::uuid AND e.operation='CONSENT_EXPIRE'));
CREATE POLICY expiry_result_actor_write ON highpass_v3.consent_lifecycle_results AS RESTRICTIVE FOR INSERT TO hp_v3_consent_expiry_policy WITH CHECK
 (actor_id=nullif(current_setting('app.actor_id',true),'')::uuid AND operation='CONSENT_EXPIRE');
CREATE POLICY expiry_cascade_actor_write ON highpass_v3.consent_lifecycle_cascade AS RESTRICTIVE FOR INSERT TO hp_v3_consent_expiry_policy WITH CHECK
 (EXISTS(SELECT 1 FROM highpass_v3.consent_lifecycle_events e WHERE e.event_id=consent_lifecycle_cascade.event_id
   AND e.actor_id=nullif(current_setting('app.actor_id',true),'')::uuid AND e.operation='CONSENT_EXPIRE'));
REVOKE ALL ON FUNCTION highpass_v3.consent_lifecycle_context(uuid,uuid,uuid,text),
 highpass_v3.consent_lifecycle_evidence(jsonb),highpass_v3.require_consent_lifecycle_assembly() FROM PUBLIC;
-- Public read, cryptographic receipt creation, locks and private services are separate gates.
