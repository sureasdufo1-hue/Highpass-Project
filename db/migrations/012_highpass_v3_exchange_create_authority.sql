-- Additive source creation only; no destination activation, clinical access or runtime grants.
CREATE FUNCTION highpass_v3.exchange_creator(tenant uuid,hospital uuid,actor uuid,patient uuid,initiation text)
 RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path=pg_catalog AS $$
 SELECT tenant=nullif(current_setting('app.tenant_id',true),'')::uuid
  AND hospital=nullif(current_setting('app.hospital_id',true),'')::uuid
  AND actor=nullif(current_setting('app.actor_id',true),'')::uuid
  AND EXISTS(SELECT 1 FROM highpass_v3.principal_bindings p
   JOIN highpass_v3.tenants t ON t.tenant_id=p.tenant_id
   JOIN highpass_v3.hospitals h ON h.tenant_id=p.tenant_id AND h.hospital_id=p.hospital_id
   WHERE p.actor_id=actor AND p.tenant_id=tenant AND p.hospital_id=hospital
    AND p.status='ACTIVE' AND t.status='ACTIVE' AND h.status='ACTIVE' AND 'exchange:create'=ANY(p.scopes)
    AND ((p.role='PATIENT' AND p.patient_ref=patient AND initiation='PATIENT_INITIATED')
     OR (p.role IN ('DOCTOR','HOSPITAL_ADMIN') AND initiation='PROVIDER_INITIATED')))
$$;
-- Registry-only selector. No Session/PatientRef permission is derived from this.
-- A bare SQL caller with active principal context may select a chosen institution's
-- nonpatient registry metadata; actual creation locks/checks source activity first.
CREATE FUNCTION highpass_v3.exchange_directory_caller() RETURNS boolean
 LANGUAGE sql STABLE SECURITY INVOKER SET search_path=pg_catalog AS $$
 SELECT EXISTS(SELECT 1 FROM highpass_v3.principal_bindings p
  WHERE p.actor_id=nullif(current_setting('app.actor_id',true),'')::uuid
   AND p.tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid
   AND p.hospital_id=nullif(current_setting('app.hospital_id',true),'')::uuid
   AND p.status='ACTIVE' AND p.role IN ('PATIENT','DOCTOR','HOSPITAL_ADMIN') AND 'exchange:create'=ANY(p.scopes))
$$;
CREATE POLICY exchange_directory_hospital ON highpass_v3.hospitals FOR SELECT USING
 (hospital_id=nullif(current_setting('app.exchange_target_hospital',true),'')::uuid AND highpass_v3.exchange_directory_caller());
CREATE POLICY exchange_directory_tenant ON highpass_v3.tenants FOR SELECT USING
 (tenant_id=nullif(current_setting('app.exchange_target_tenant',true),'')::uuid AND highpass_v3.exchange_directory_caller());
CREATE POLICY exchange_directory_hospital_lock ON highpass_v3.hospitals FOR UPDATE USING
 (hospital_id=nullif(current_setting('app.exchange_target_hospital',true),'')::uuid AND highpass_v3.exchange_directory_caller()) WITH CHECK(false);
CREATE POLICY exchange_directory_tenant_lock ON highpass_v3.tenants FOR UPDATE USING
 (tenant_id=nullif(current_setting('app.exchange_target_tenant',true),'')::uuid AND highpass_v3.exchange_directory_caller()) WITH CHECK(false);

-- Root creation record avoids participant -> parent -> participant RLS recursion.
-- Copy only already recorded creator tuples, without modifying immutable rows.
ALTER TABLE highpass_v3.exchange_sessions ADD CONSTRAINT exchange_target_tuple UNIQUE(session_id,target_tenant_id,target_hospital_id);
ALTER TABLE highpass_v3.exchange_audit_outbox ADD CONSTRAINT exchange_creation_audit_tuple
 UNIQUE(event_id,session_id,tenant_id,hospital_id,actor_id,audit_session_id,trace_id,action);
CREATE TABLE highpass_v3.exchange_creation_context (
 session_id uuid PRIMARY KEY,patient_ref uuid NOT NULL,owner_tenant_id uuid NOT NULL,
 source_hospital_id uuid NOT NULL,requester_id uuid NOT NULL,
 initiation_type text NOT NULL CHECK(initiation_type IN ('PATIENT_INITIATED','PROVIDER_INITIATED')),
 target_tenant_id uuid NOT NULL,target_hospital_id uuid NOT NULL,
 creation_event_id uuid NOT NULL,audit_session_id uuid NOT NULL,
 trace_id text NOT NULL CHECK(trace_id ~ '^[A-Za-z0-9_-]{16,64}$'),
 creation_action text NOT NULL DEFAULT 'SESSION_CREATED' CHECK(creation_action='SESSION_CREATED'),
 FOREIGN KEY(session_id,owner_tenant_id,source_hospital_id,requester_id)
 REFERENCES highpass_v3.exchange_sessions(session_id,owner_tenant_id,source_hospital_id,requester_id) DEFERRABLE INITIALLY DEFERRED,
 FOREIGN KEY(session_id,patient_ref) REFERENCES highpass_v3.exchange_sessions(session_id,patient_ref) DEFERRABLE INITIALLY DEFERRED,
 FOREIGN KEY(session_id,target_tenant_id,target_hospital_id)
 REFERENCES highpass_v3.exchange_sessions(session_id,target_tenant_id,target_hospital_id) DEFERRABLE INITIALLY DEFERRED,
 FOREIGN KEY(creation_event_id,session_id,owner_tenant_id,source_hospital_id,requester_id,audit_session_id,trace_id,creation_action)
 REFERENCES highpass_v3.exchange_audit_outbox(event_id,session_id,tenant_id,hospital_id,actor_id,audit_session_id,trace_id,action) DEFERRABLE INITIALLY DEFERRED
);
INSERT INTO highpass_v3.exchange_creation_context
 SELECT s.session_id,s.patient_ref,s.owner_tenant_id,s.source_hospital_id,s.requester_id,s.initiation_type,s.target_tenant_id,s.target_hospital_id,
 e.event_id,s.audit_session_id,s.trace_id,'SESSION_CREATED'
 FROM highpass_v3.exchange_sessions s JOIN LATERAL(SELECT event_id FROM highpass_v3.exchange_audit_outbox e
  WHERE e.session_id=s.session_id AND e.actor_id=s.requester_id AND e.tenant_id=s.owner_tenant_id AND e.hospital_id=s.source_hospital_id
   AND e.action='SESSION_CREATED' AND e.audit_session_id=s.audit_session_id AND e.trace_id=s.trace_id ORDER BY e.event_id LIMIT 1) e ON true;
ALTER TABLE highpass_v3.exchange_creation_context ENABLE ROW LEVEL SECURITY;
ALTER TABLE highpass_v3.exchange_creation_context FORCE ROW LEVEL SECURITY;
CREATE POLICY exchange_creation_context_read ON highpass_v3.exchange_creation_context FOR SELECT USING
 (highpass_v3.exchange_creator(owner_tenant_id,source_hospital_id,requester_id,patient_ref,initiation_type));
CREATE POLICY exchange_creation_context_insert ON highpass_v3.exchange_creation_context FOR INSERT WITH CHECK
 (highpass_v3.exchange_creator(owner_tenant_id,source_hospital_id,requester_id,patient_ref,initiation_type));
CREATE TRIGGER exchange_creation_context_immutable BEFORE UPDATE OR DELETE ON highpass_v3.exchange_creation_context
 FOR EACH ROW EXECUTE FUNCTION highpass_v3.reject_identity_audit_mutation();
REVOKE ALL ON highpass_v3.exchange_creation_context FROM PUBLIC;

-- Source creator's own metadata is readable with create scope for atomic assembly
-- and durable retry. This does not let the invited recipient see the session.
CREATE POLICY exchange_created_session_read ON highpass_v3.exchange_sessions FOR SELECT USING
 (highpass_v3.exchange_creator(owner_tenant_id,source_hospital_id,requester_id,patient_ref,initiation_type));
CREATE POLICY exchange_created_participant_read ON highpass_v3.exchange_session_participants FOR SELECT USING
 (EXISTS(SELECT 1 FROM highpass_v3.exchange_creation_context c WHERE c.session_id=exchange_session_participants.session_id));
CREATE POLICY exchange_create ON highpass_v3.exchange_sessions FOR INSERT WITH CHECK
 (highpass_v3.exchange_creator(owner_tenant_id,source_hospital_id,requester_id,patient_ref,initiation_type)
  AND state='REQUESTED' AND version=1 AND created_at=statement_timestamp()
  AND valid_until>clock_timestamp()
  AND valid_until<=valid_from+make_interval(secs=>nullif(current_setting('app.exchange_max_lifetime_ms',true),'')::double precision/1000)
  AND EXISTS(SELECT 1 FROM highpass_v3.patient_refs r WHERE r.patient_ref=exchange_sessions.patient_ref AND r.deleted_at IS NULL)
  AND EXISTS(SELECT 1 FROM highpass_v3.hospitals h JOIN highpass_v3.tenants t ON t.tenant_id=h.tenant_id
   WHERE h.hospital_id=exchange_sessions.target_hospital_id AND h.tenant_id=exchange_sessions.target_tenant_id AND h.status='ACTIVE' AND t.status='ACTIVE'));
CREATE POLICY exchange_create_participant ON highpass_v3.exchange_session_participants FOR INSERT WITH CHECK
 (EXISTS(SELECT 1 FROM highpass_v3.exchange_creation_context c WHERE c.session_id=exchange_session_participants.session_id
  AND ((participant_role='SOURCE' AND status='ACTIVE' AND tenant_id=c.owner_tenant_id AND hospital_id=c.source_hospital_id)
   OR (participant_role='DESTINATION' AND status='INVITED' AND tenant_id=c.target_tenant_id AND hospital_id=c.target_hospital_id))));
CREATE POLICY exchange_create_scope ON highpass_v3.exchange_resource_scopes FOR INSERT WITH CHECK
 (EXISTS(SELECT 1 FROM highpass_v3.exchange_sessions s WHERE s.session_id=exchange_resource_scopes.session_id
  AND highpass_v3.exchange_creator(s.owner_tenant_id,s.source_hospital_id,s.requester_id,s.patient_ref,s.initiation_type)));
CREATE POLICY exchange_session_lock ON highpass_v3.exchange_sessions FOR UPDATE USING
 (highpass_v3.exchange_creator(owner_tenant_id,source_hospital_id,requester_id,patient_ref,initiation_type)) WITH CHECK(false);
CREATE POLICY exchange_create_result ON highpass_v3.exchange_write_results FOR INSERT WITH CHECK
 (EXISTS(SELECT 1 FROM highpass_v3.exchange_sessions s WHERE s.session_id=exchange_write_results.session_id
  AND s.owner_tenant_id=exchange_write_results.tenant_id AND s.source_hospital_id=exchange_write_results.hospital_id
  AND s.requester_id=exchange_write_results.actor_id AND s.created_at=exchange_write_results.response_created_at
  AND highpass_v3.exchange_creator(s.owner_tenant_id,s.source_hospital_id,s.requester_id,s.patient_ref,s.initiation_type)));
CREATE POLICY exchange_create_audit ON highpass_v3.exchange_audit_outbox FOR INSERT WITH CHECK
 (tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid
  AND hospital_id=nullif(current_setting('app.hospital_id',true),'')::uuid
  AND actor_id=nullif(current_setting('app.actor_id',true),'')::uuid
  AND EXISTS(SELECT 1 FROM highpass_v3.principal_bindings p JOIN highpass_v3.tenants t ON t.tenant_id=p.tenant_id
   JOIN highpass_v3.hospitals h ON h.tenant_id=p.tenant_id AND h.hospital_id=p.hospital_id
   WHERE p.actor_id=exchange_audit_outbox.actor_id AND p.status='ACTIVE' AND t.status='ACTIVE' AND h.status='ACTIVE'
    AND p.role IN ('PATIENT','DOCTOR','HOSPITAL_ADMIN') AND 'exchange:create'=ANY(p.scopes))
  AND (session_id IS NULL OR EXISTS(SELECT 1 FROM highpass_v3.exchange_sessions s WHERE s.session_id=exchange_audit_outbox.session_id)));
-- Audit existence/identity is enforced by a deferred composite FK, not by letting
-- a patient SELECT admin audit rows or using SECURITY DEFINER to read them.
CREATE OR REPLACE FUNCTION highpass_v3.require_exchange_assembly() RETURNS trigger
 LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $$
DECLARE n integer; a integer;
BEGIN
 SELECT count(*),max(ordinal) INTO n,a FROM highpass_v3.exchange_resource_scopes WHERE session_id=NEW.session_id;
 IF n<>NEW.resource_count OR a<>n OR NEW.valid_until<=clock_timestamp() OR
  (SELECT count(*) FROM highpass_v3.exchange_session_participants WHERE session_id=NEW.session_id)<>2 OR
  NOT EXISTS(SELECT 1 FROM highpass_v3.exchange_session_participants p WHERE p.session_id=NEW.session_id
   AND p.tenant_id=NEW.owner_tenant_id AND p.hospital_id=NEW.source_hospital_id AND p.participant_role='SOURCE' AND p.status='ACTIVE') OR
  NOT EXISTS(SELECT 1 FROM highpass_v3.exchange_session_participants p WHERE p.session_id=NEW.session_id
   AND p.tenant_id=NEW.target_tenant_id AND p.hospital_id=NEW.target_hospital_id AND p.participant_role='DESTINATION' AND p.status='INVITED') OR
  highpass_v3.exchange_creator(NEW.owner_tenant_id,NEW.source_hospital_id,NEW.requester_id,NEW.patient_ref,NEW.initiation_type) IS NOT TRUE OR
  NOT EXISTS(SELECT 1 FROM highpass_v3.hospitals h JOIN highpass_v3.tenants t ON t.tenant_id=h.tenant_id
   WHERE h.hospital_id=NEW.target_hospital_id AND h.tenant_id=NEW.target_tenant_id AND h.status='ACTIVE' AND t.status='ACTIVE') OR
  NOT EXISTS(SELECT 1 FROM highpass_v3.patient_refs r WHERE r.patient_ref=NEW.patient_ref AND r.deleted_at IS NULL) OR
  NOT EXISTS(SELECT 1 FROM highpass_v3.exchange_creation_context c WHERE c.session_id=NEW.session_id
   AND c.audit_session_id=NEW.audit_session_id AND c.trace_id=NEW.trace_id) OR
  NOT EXISTS(SELECT 1 FROM highpass_v3.exchange_write_results r WHERE r.session_id=NEW.session_id AND r.response_created_at=NEW.created_at)
 THEN RAISE EXCEPTION 'V3_SESSION_ASSEMBLY_REQUIRED' USING ERRCODE='23514'; END IF;
 RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION highpass_v3.exchange_creator(uuid,uuid,uuid,uuid,text),highpass_v3.exchange_directory_caller() FROM PUBLIC;
