-- Isolated rollout only. REQUESTED -> CANCELLED has exact event/audit/outbox proof.
-- Clinical transitions, expiry worker and cascade delivery are later gates.
ALTER TABLE highpass_v3.exchange_sessions
 DROP CONSTRAINT exchange_sessions_state_check,
 DROP CONSTRAINT exchange_sessions_version_check,
 DROP CONSTRAINT exchange_sessions_check2,
 ADD CONSTRAINT exchange_state_valid CHECK(state IN ('REQUESTED','IDENTITY_PENDING','CONSENT_PENDING','CONSENTED','AUTHORIZED','PREFLIGHT','READY','ACTIVE',
 'VIEWING','DOWNLOADING','TRANSFERRING','MOBILE_EXPORTING','COMPLETED','REJECTED','EXPIRED','REVOKED','FAILED','CANCELLED')),
 ADD CONSTRAINT exchange_version_valid CHECK(version>=1),
 ADD CONSTRAINT exchange_initial_time CHECK(created_at=valid_from AND isfinite(updated_at) AND updated_at>=created_at
  AND (version<>1 OR updated_at=created_at));

CREATE FUNCTION highpass_v3.exchange_canceller(tenant uuid,hospital uuid,requester uuid,patient uuid,reason text DEFAULT NULL)
 RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path=pg_catalog AS $$
 SELECT tenant=nullif(current_setting('app.tenant_id',true),'')::uuid
 AND hospital=nullif(current_setting('app.hospital_id',true),'')::uuid
 AND EXISTS(SELECT 1 FROM highpass_v3.principal_bindings p
  JOIN highpass_v3.tenants t ON t.tenant_id=p.tenant_id
  JOIN highpass_v3.hospitals h ON h.tenant_id=p.tenant_id AND h.hospital_id=p.hospital_id
  WHERE p.actor_id=nullif(current_setting('app.actor_id',true),'')::uuid AND p.tenant_id=tenant AND p.hospital_id=hospital
   AND p.status='ACTIVE' AND t.status='ACTIVE' AND h.status='ACTIVE' AND 'exchange:cancel'=ANY(p.scopes)
   AND ((p.role='PATIENT' AND p.patient_ref=patient AND (reason IS NULL OR reason='PATIENT_WITHDRAWN'))
    OR (p.role='DOCTOR' AND p.actor_id=requester AND (reason IS NULL OR reason='REQUESTER_CANCELLED'))
    OR (p.role='HOSPITAL_ADMIN' AND (reason IS NULL OR reason='ADMINISTRATIVE_CANCEL'
      OR (reason='REQUESTER_CANCELLED' AND p.actor_id=requester)))))
$$;
CREATE POLICY exchange_cancel_read ON highpass_v3.exchange_sessions FOR SELECT USING
 (highpass_v3.exchange_canceller(owner_tenant_id,source_hospital_id,requester_id,patient_ref));
CREATE POLICY exchange_cancel_update ON highpass_v3.exchange_sessions FOR UPDATE USING
 (highpass_v3.exchange_canceller(owner_tenant_id,source_hospital_id,requester_id,patient_ref)) WITH CHECK
 (highpass_v3.exchange_canceller(owner_tenant_id,source_hospital_id,requester_id,patient_ref));

ALTER TABLE highpass_v3.exchange_audit_outbox
 DROP CONSTRAINT exchange_audit_outbox_action_check,
 DROP CONSTRAINT exchange_audit_outbox_session_version_check,
 DROP CONSTRAINT exchange_audit_reason,
 DROP CONSTRAINT exchange_audit_action_result,
 ADD CONSTRAINT exchange_audit_action CHECK(action IN ('SESSION_CREATED','SESSION_READ','SESSION_DENIED','SESSION_CANCELLED')),
 ADD CONSTRAINT exchange_audit_version CHECK(session_version>=1),
 ADD CONSTRAINT exchange_audit_reason CHECK(reason_code IN ('SESSION_REQUESTED','METADATA_READ','SESSION_NOT_FOUND','SCOPE_DENIED','SESSION_EXPIRED',
 'IDEMPOTENCY_CONFLICT','SOURCE_REF_UNAVAILABLE','TARGET_UNAVAILABLE','VERSION_MISMATCH','SESSION_TERMINAL','CANCEL_NOT_SUPPORTED',
 'PATIENT_WITHDRAWN','REQUESTER_CANCELLED','ADMINISTRATIVE_CANCEL')),
 ADD CONSTRAINT exchange_audit_action_result CHECK
 ((action='SESSION_CREATED' AND result='ALLOW' AND reason_code='SESSION_REQUESTED' AND session_version=1 AND session_id IS NOT NULL)
 OR (action='SESSION_READ' AND result='ALLOW' AND reason_code='METADATA_READ' AND session_version>=1 AND session_id IS NOT NULL)
 OR (action='SESSION_CANCELLED' AND result='ALLOW' AND reason_code IN ('PATIENT_WITHDRAWN','REQUESTER_CANCELLED','ADMINISTRATIVE_CANCEL') AND session_version=2 AND session_id IS NOT NULL)
 OR (action='SESSION_DENIED' AND result='DENY' AND reason_code IN ('SESSION_NOT_FOUND','SCOPE_DENIED','SESSION_EXPIRED','IDEMPOTENCY_CONFLICT',
 'SOURCE_REF_UNAVAILABLE','TARGET_UNAVAILABLE','VERSION_MISMATCH','SESSION_TERMINAL','CANCEL_NOT_SUPPORTED'))),
 ADD CONSTRAINT exchange_state_audit_tuple UNIQUE(event_id,session_id,tenant_id,hospital_id,actor_id,audit_session_id,trace_id,action,reason_code,session_version);

CREATE TABLE highpass_v3.exchange_state_events (
 event_id uuid PRIMARY KEY,session_id uuid NOT NULL,patient_ref uuid NOT NULL,tenant_id uuid NOT NULL,hospital_id uuid NOT NULL,
 requester_id uuid NOT NULL,actor_id uuid NOT NULL,
 from_state text NOT NULL CHECK(from_state='REQUESTED'),to_state text NOT NULL CHECK(to_state='CANCELLED'),
 from_version integer NOT NULL CHECK(from_version=1),to_version integer NOT NULL CHECK(to_version=2),
 reason_code text NOT NULL CHECK(reason_code IN ('PATIENT_WITHDRAWN','REQUESTER_CANCELLED','ADMINISTRATIVE_CANCEL')),
 audit_session_id uuid NOT NULL,trace_id text NOT NULL CHECK(trace_id ~ '^[A-Za-z0-9_-]{16,64}$'),
 action text NOT NULL DEFAULT 'SESSION_CANCELLED' CHECK(action='SESSION_CANCELLED'),
 occurred_at timestamptz NOT NULL CHECK(isfinite(occurred_at)),
 UNIQUE(session_id,to_version),UNIQUE(event_id,session_id,tenant_id,hospital_id,actor_id),
 FOREIGN KEY(session_id,tenant_id,hospital_id,requester_id) REFERENCES highpass_v3.exchange_sessions(session_id,owner_tenant_id,source_hospital_id,requester_id),
 FOREIGN KEY(session_id,patient_ref) REFERENCES highpass_v3.exchange_sessions(session_id,patient_ref),
 FOREIGN KEY(actor_id,tenant_id,hospital_id) REFERENCES highpass_v3.principal_bindings(actor_id,tenant_id,hospital_id),
 FOREIGN KEY(event_id,session_id,tenant_id,hospital_id,actor_id,audit_session_id,trace_id,action,reason_code,to_version)
  REFERENCES highpass_v3.exchange_audit_outbox(event_id,session_id,tenant_id,hospital_id,actor_id,audit_session_id,trace_id,action,reason_code,session_version)
  DEFERRABLE INITIALLY DEFERRED
);
CREATE TABLE highpass_v3.exchange_cancel_results (
 tenant_id uuid NOT NULL,hospital_id uuid NOT NULL,actor_id uuid NOT NULL,
 key_digest bytea NOT NULL CHECK(octet_length(key_digest)=32),request_digest bytea NOT NULL CHECK(octet_length(request_digest)=32),
 event_id uuid NOT NULL,session_id uuid NOT NULL,
 PRIMARY KEY(tenant_id,hospital_id,actor_id,key_digest),UNIQUE(event_id),
 FOREIGN KEY(event_id,session_id,tenant_id,hospital_id,actor_id)
  REFERENCES highpass_v3.exchange_state_events(event_id,session_id,tenant_id,hospital_id,actor_id)
);
CREATE TABLE highpass_v3.exchange_cascade_outbox (
 event_id uuid PRIMARY KEY REFERENCES highpass_v3.exchange_state_events(event_id),
 kind text NOT NULL DEFAULT 'CANCEL_REQUESTED' CHECK(kind='CANCEL_REQUESTED'),
 -- Delivery/actual revoke acknowledgements belong to a later immutable receipt table.
 delivery_status text NOT NULL DEFAULT 'REQUESTED' CHECK(delivery_status='REQUESTED')
);
ALTER TABLE highpass_v3.exchange_state_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE highpass_v3.exchange_state_events FORCE ROW LEVEL SECURITY;
ALTER TABLE highpass_v3.exchange_cancel_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE highpass_v3.exchange_cancel_results FORCE ROW LEVEL SECURITY;
ALTER TABLE highpass_v3.exchange_cascade_outbox ENABLE ROW LEVEL SECURITY;
ALTER TABLE highpass_v3.exchange_cascade_outbox FORCE ROW LEVEL SECURITY;
CREATE POLICY exchange_state_event_read ON highpass_v3.exchange_state_events FOR SELECT USING
 (highpass_v3.exchange_canceller(tenant_id,hospital_id,requester_id,patient_ref));
CREATE POLICY exchange_state_event_insert ON highpass_v3.exchange_state_events FOR INSERT WITH CHECK
 (actor_id=nullif(current_setting('app.actor_id',true),'')::uuid
  AND highpass_v3.exchange_canceller(tenant_id,hospital_id,requester_id,patient_ref,reason_code));
CREATE POLICY exchange_cancel_result_read ON highpass_v3.exchange_cancel_results FOR SELECT USING
 (tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid AND hospital_id=nullif(current_setting('app.hospital_id',true),'')::uuid
  AND actor_id=nullif(current_setting('app.actor_id',true),'')::uuid
  AND EXISTS(SELECT 1 FROM highpass_v3.exchange_state_events e WHERE e.event_id=exchange_cancel_results.event_id));
CREATE POLICY exchange_cancel_result_insert ON highpass_v3.exchange_cancel_results FOR INSERT WITH CHECK
 (tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid AND hospital_id=nullif(current_setting('app.hospital_id',true),'')::uuid
  AND actor_id=nullif(current_setting('app.actor_id',true),'')::uuid
  AND EXISTS(SELECT 1 FROM highpass_v3.exchange_state_events e WHERE e.event_id=exchange_cancel_results.event_id AND e.actor_id=exchange_cancel_results.actor_id));
CREATE POLICY exchange_cascade_read ON highpass_v3.exchange_cascade_outbox FOR SELECT USING
 (EXISTS(SELECT 1 FROM highpass_v3.exchange_state_events e WHERE e.event_id=exchange_cascade_outbox.event_id));
CREATE POLICY exchange_cascade_insert ON highpass_v3.exchange_cascade_outbox FOR INSERT WITH CHECK
 (EXISTS(SELECT 1 FROM highpass_v3.exchange_state_events e WHERE e.event_id=exchange_cascade_outbox.event_id
  AND e.actor_id=nullif(current_setting('app.actor_id',true),'')::uuid));
CREATE POLICY exchange_cancel_audit_insert ON highpass_v3.exchange_audit_outbox FOR INSERT WITH CHECK
 (tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid AND hospital_id=nullif(current_setting('app.hospital_id',true),'')::uuid
  AND actor_id=nullif(current_setting('app.actor_id',true),'')::uuid AND action IN ('SESSION_CANCELLED','SESSION_DENIED')
  AND EXISTS(SELECT 1 FROM highpass_v3.principal_bindings p WHERE p.actor_id=exchange_audit_outbox.actor_id
   AND p.status='ACTIVE' AND 'exchange:cancel'=ANY(p.scopes) AND p.role IN ('PATIENT','DOCTOR','HOSPITAL_ADMIN'))
  AND (session_id IS NULL OR EXISTS(SELECT 1 FROM highpass_v3.exchange_sessions s WHERE s.session_id=exchange_audit_outbox.session_id
   AND highpass_v3.exchange_canceller(s.owner_tenant_id,s.source_hospital_id,s.requester_id,s.patient_ref))));
-- Permissive legacy create/read policies cannot be used to fabricate cancel audit.
CREATE POLICY exchange_cancel_audit_authority ON highpass_v3.exchange_audit_outbox AS RESTRICTIVE FOR INSERT WITH CHECK
 (action<>'SESSION_CANCELLED' OR EXISTS(SELECT 1 FROM highpass_v3.exchange_sessions s
  WHERE s.session_id=exchange_audit_outbox.session_id AND s.state='CANCELLED' AND s.version=exchange_audit_outbox.session_version
   AND highpass_v3.exchange_canceller(s.owner_tenant_id,s.source_hospital_id,s.requester_id,s.patient_ref,exchange_audit_outbox.reason_code)));

CREATE FUNCTION highpass_v3.guard_exchange_transition() RETURNS trigger
 LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'V3_SESSION_IMMUTABLE' USING ERRCODE='42501'; END IF;
 IF (to_jsonb(NEW)-ARRAY['state','version','updated_at']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['state','version','updated_at'])
  OR OLD.state<>'REQUESTED' OR OLD.version<>1 OR NEW.state<>'CANCELLED' OR NEW.version<>2
  OR OLD.valid_until<=clock_timestamp() OR NEW.updated_at<OLD.updated_at OR NEW.updated_at>clock_timestamp()
  OR highpass_v3.exchange_canceller(OLD.owner_tenant_id,OLD.source_hospital_id,OLD.requester_id,OLD.patient_ref) IS NOT TRUE
 THEN RAISE EXCEPTION 'V3_SESSION_TRANSITION_DENIED' USING ERRCODE='42501'; END IF;
 RETURN NEW;
END $$;
DROP TRIGGER exchange_session_immutable ON highpass_v3.exchange_sessions;
CREATE TRIGGER exchange_session_transition_guard BEFORE UPDATE OR DELETE ON highpass_v3.exchange_sessions
 FOR EACH ROW EXECUTE FUNCTION highpass_v3.guard_exchange_transition();
CREATE FUNCTION highpass_v3.require_exchange_transition_proof() RETURNS trigger
 LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM highpass_v3.exchange_state_events e
  JOIN highpass_v3.exchange_cascade_outbox o ON o.event_id=e.event_id
  JOIN highpass_v3.exchange_cancel_results r ON r.event_id=e.event_id
  WHERE e.session_id=NEW.session_id AND e.to_version=NEW.version AND e.to_state=NEW.state
   AND e.from_version=OLD.version AND e.from_state=OLD.state AND e.occurred_at=NEW.updated_at
   AND e.actor_id=nullif(current_setting('app.actor_id',true),'')::uuid)
 THEN RAISE EXCEPTION 'V3_SESSION_TRANSITION_PROOF_REQUIRED' USING ERRCODE='23514'; END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER exchange_transition_proof AFTER UPDATE ON highpass_v3.exchange_sessions
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION highpass_v3.require_exchange_transition_proof();
CREATE FUNCTION highpass_v3.require_exchange_state_event() RETURNS trigger
 LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM highpass_v3.exchange_sessions s WHERE s.session_id=NEW.session_id
  AND s.state=NEW.to_state AND s.version=NEW.to_version AND s.updated_at=NEW.occurred_at)
 THEN RAISE EXCEPTION 'V3_SESSION_EVENT_STATE_REQUIRED' USING ERRCODE='23514'; END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER exchange_event_state_proof AFTER INSERT ON highpass_v3.exchange_state_events
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION highpass_v3.require_exchange_state_event();
CREATE TRIGGER exchange_state_event_immutable BEFORE UPDATE OR DELETE ON highpass_v3.exchange_state_events
 FOR EACH ROW EXECUTE FUNCTION highpass_v3.reject_identity_audit_mutation();
CREATE TRIGGER exchange_cancel_result_immutable BEFORE UPDATE OR DELETE ON highpass_v3.exchange_cancel_results
 FOR EACH ROW EXECUTE FUNCTION highpass_v3.reject_identity_audit_mutation();
CREATE TRIGGER exchange_cascade_immutable BEFORE UPDATE OR DELETE ON highpass_v3.exchange_cascade_outbox
 FOR EACH ROW EXECUTE FUNCTION highpass_v3.reject_identity_audit_mutation();
REVOKE ALL ON highpass_v3.exchange_state_events,highpass_v3.exchange_cancel_results,highpass_v3.exchange_cascade_outbox FROM PUBLIC;
REVOKE ALL ON FUNCTION highpass_v3.exchange_canceller(uuid,uuid,uuid,uuid,text),highpass_v3.guard_exchange_transition(),
 highpass_v3.require_exchange_transition_proof(),highpass_v3.require_exchange_state_event() FROM PUBLIC;
