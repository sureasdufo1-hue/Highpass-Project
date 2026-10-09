-- Exact source maintenance expiry; no clinical or delivery authority.
-- NOLOGIN policy capabilities; application credentials must be explicitly enrolled.
CREATE ROLE hp_v3_clinical_policy NOLOGIN NOSUPERUSER NOBYPASSRLS;
CREATE ROLE hp_v3_expiry_policy NOLOGIN NOSUPERUSER NOBYPASSRLS;
DO $$ DECLARE policy_row record;
BEGIN
 FOR policy_row IN SELECT c.relname,p.polname FROM pg_policy p JOIN pg_class c ON c.oid=p.polrelid
  JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='highpass_v3' AND p.polpermissive
  AND c.relname IN ('exchange_sessions','exchange_state_events','exchange_audit_outbox','exchange_cascade_outbox') LOOP
  EXECUTE format('ALTER POLICY %I ON highpass_v3.%I TO hp_v3_clinical_policy',policy_row.polname,policy_row.relname);
 END LOOP;
END $$;
CREATE FUNCTION highpass_v3.exchange_expirer(tenant uuid,hospital uuid) RETURNS boolean
 LANGUAGE sql STABLE SECURITY INVOKER SET search_path=pg_catalog AS $$
 SELECT tenant=nullif(current_setting('app.tenant_id',true),'')::uuid
 AND hospital=nullif(current_setting('app.hospital_id',true),'')::uuid
 AND EXISTS(SELECT 1 FROM highpass_v3.principal_bindings p
  JOIN highpass_v3.tenants t ON t.tenant_id=p.tenant_id
  JOIN highpass_v3.hospitals h ON h.tenant_id=p.tenant_id AND h.hospital_id=p.hospital_id
  WHERE p.actor_id=nullif(current_setting('app.actor_id',true),'')::uuid AND p.tenant_id=tenant AND p.hospital_id=hospital
   AND p.status='ACTIVE' AND t.status='ACTIVE' AND h.status='ACTIVE' AND p.role='INTERNAL_SERVICE'
   AND p.service_purpose='SESSION_EXPIRY' AND p.patient_ref IS NULL AND p.scopes=ARRAY['exchange:expire']::text[])
$$;
CREATE POLICY expiry_session_read ON highpass_v3.exchange_sessions FOR SELECT TO hp_v3_expiry_policy USING
 (state IN ('REQUESTED','EXPIRED') AND valid_until<=clock_timestamp() AND highpass_v3.exchange_expirer(owner_tenant_id,source_hospital_id));
CREATE POLICY expiry_session_update ON highpass_v3.exchange_sessions FOR UPDATE TO hp_v3_expiry_policy USING
 (state='REQUESTED' AND version=1 AND valid_until<=clock_timestamp() AND highpass_v3.exchange_expirer(owner_tenant_id,source_hospital_id)) WITH CHECK
 (state='EXPIRED' AND version=2 AND highpass_v3.exchange_expirer(owner_tenant_id,source_hospital_id));
ALTER TABLE highpass_v3.exchange_state_events
 DROP CONSTRAINT exchange_state_events_to_state_check,
 DROP CONSTRAINT exchange_state_events_reason_code_check,
 DROP CONSTRAINT exchange_state_events_action_check,
 ADD CONSTRAINT exchange_event_semantics CHECK
 ((to_state='CANCELLED' AND action='SESSION_CANCELLED' AND reason_code IN ('PATIENT_WITHDRAWN','REQUESTER_CANCELLED','ADMINISTRATIVE_CANCEL'))
 OR (to_state='EXPIRED' AND action='SESSION_EXPIRED' AND reason_code='SESSION_EXPIRED'));
ALTER TABLE highpass_v3.exchange_audit_outbox DROP CONSTRAINT exchange_audit_action,
 DROP CONSTRAINT exchange_audit_action_result,
 ADD CONSTRAINT exchange_audit_action CHECK(action IN ('SESSION_CREATED','SESSION_READ','SESSION_DENIED','SESSION_CANCELLED','SESSION_EXPIRED')),
 ADD CONSTRAINT exchange_audit_action_result CHECK
 ((action='SESSION_CREATED' AND result='ALLOW' AND reason_code='SESSION_REQUESTED' AND session_version=1 AND session_id IS NOT NULL)
 OR (action='SESSION_READ' AND result='ALLOW' AND reason_code='METADATA_READ' AND session_version>=1 AND session_id IS NOT NULL)
 OR (action='SESSION_CANCELLED' AND result='ALLOW' AND reason_code IN ('PATIENT_WITHDRAWN','REQUESTER_CANCELLED','ADMINISTRATIVE_CANCEL') AND session_version=2 AND session_id IS NOT NULL)
 OR (action='SESSION_EXPIRED' AND result='ALLOW' AND reason_code='SESSION_EXPIRED' AND session_version=2 AND session_id IS NOT NULL)
 OR (action='SESSION_DENIED' AND result='DENY' AND reason_code IN ('SESSION_NOT_FOUND','SCOPE_DENIED','SESSION_EXPIRED','IDEMPOTENCY_CONFLICT',
 'SOURCE_REF_UNAVAILABLE','TARGET_UNAVAILABLE','VERSION_MISMATCH','SESSION_TERMINAL','CANCEL_NOT_SUPPORTED')));
ALTER TABLE highpass_v3.exchange_cascade_outbox DROP CONSTRAINT exchange_cascade_outbox_kind_check,
 ADD CONSTRAINT exchange_cascade_kind CHECK(kind IN ('CANCEL_REQUESTED','EXPIRY_REQUESTED'));
CREATE POLICY expiry_event_read ON highpass_v3.exchange_state_events FOR SELECT TO hp_v3_expiry_policy USING
 (to_state='EXPIRED' AND highpass_v3.exchange_expirer(tenant_id,hospital_id));
CREATE POLICY expiry_event_insert ON highpass_v3.exchange_state_events FOR INSERT TO hp_v3_expiry_policy WITH CHECK
 (to_state='EXPIRED' AND actor_id=nullif(current_setting('app.actor_id',true),'')::uuid AND highpass_v3.exchange_expirer(tenant_id,hospital_id));
CREATE POLICY expiry_audit_insert ON highpass_v3.exchange_audit_outbox FOR INSERT TO hp_v3_expiry_policy WITH CHECK
 (action='SESSION_EXPIRED' AND actor_id=nullif(current_setting('app.actor_id',true),'')::uuid
  AND highpass_v3.exchange_expirer(tenant_id,hospital_id));
CREATE POLICY expiry_cascade_read ON highpass_v3.exchange_cascade_outbox FOR SELECT TO hp_v3_expiry_policy USING
 (EXISTS(SELECT 1 FROM highpass_v3.exchange_state_events e WHERE e.event_id=exchange_cascade_outbox.event_id AND e.to_state='EXPIRED'));
CREATE POLICY expiry_cascade_insert ON highpass_v3.exchange_cascade_outbox FOR INSERT TO hp_v3_expiry_policy WITH CHECK
 (kind='EXPIRY_REQUESTED' AND EXISTS(SELECT 1 FROM highpass_v3.exchange_state_events e WHERE e.event_id=exchange_cascade_outbox.event_id
  AND e.to_state='EXPIRED' AND e.actor_id=nullif(current_setting('app.actor_id',true),'')::uuid));
CREATE POLICY expiry_audit_authority ON highpass_v3.exchange_audit_outbox AS RESTRICTIVE FOR INSERT WITH CHECK
 (action<>'SESSION_EXPIRED' OR EXISTS(SELECT 1 FROM highpass_v3.exchange_sessions s WHERE s.session_id=exchange_audit_outbox.session_id
  AND s.state='EXPIRED' AND s.version=exchange_audit_outbox.session_version AND highpass_v3.exchange_expirer(s.owner_tenant_id,s.source_hospital_id)));
CREATE POLICY cascade_event_kind ON highpass_v3.exchange_cascade_outbox AS RESTRICTIVE FOR INSERT WITH CHECK
 (EXISTS(SELECT 1 FROM highpass_v3.exchange_state_events e WHERE e.event_id=exchange_cascade_outbox.event_id
  AND ((e.to_state='CANCELLED' AND kind='CANCEL_REQUESTED') OR (e.to_state='EXPIRED' AND kind='EXPIRY_REQUESTED'))));
CREATE POLICY state_audit_event_required ON highpass_v3.exchange_audit_outbox AS RESTRICTIVE FOR INSERT WITH CHECK
 (action NOT IN ('SESSION_CANCELLED','SESSION_EXPIRED') OR EXISTS(SELECT 1 FROM highpass_v3.exchange_state_events e
  WHERE e.event_id=exchange_audit_outbox.event_id AND e.session_id=exchange_audit_outbox.session_id
   AND e.actor_id=exchange_audit_outbox.actor_id AND e.to_version=exchange_audit_outbox.session_version));
CREATE OR REPLACE FUNCTION highpass_v3.guard_exchange_transition() RETURNS trigger
 LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'V3_SESSION_IMMUTABLE' USING ERRCODE='42501'; END IF;
 IF (to_jsonb(NEW)-ARRAY['state','version','updated_at']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['state','version','updated_at'])
  OR OLD.state<>'REQUESTED' OR OLD.version<>1 OR NEW.version<>2
  OR NEW.updated_at<OLD.updated_at OR NEW.updated_at>clock_timestamp()
  OR NOT ((NEW.state='CANCELLED' AND OLD.valid_until>clock_timestamp()
    AND highpass_v3.exchange_canceller(OLD.owner_tenant_id,OLD.source_hospital_id,OLD.requester_id,OLD.patient_ref) IS TRUE)
   OR (NEW.state='EXPIRED' AND OLD.valid_until<=clock_timestamp()
    AND highpass_v3.exchange_expirer(OLD.owner_tenant_id,OLD.source_hospital_id) IS TRUE))
 THEN RAISE EXCEPTION 'V3_SESSION_TRANSITION_DENIED' USING ERRCODE='42501'; END IF;
 RETURN NEW;
END $$;
CREATE OR REPLACE FUNCTION highpass_v3.require_exchange_transition_proof() RETURNS trigger
 LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM highpass_v3.exchange_state_events e JOIN highpass_v3.exchange_cascade_outbox o ON o.event_id=e.event_id
  WHERE e.session_id=NEW.session_id AND e.to_version=NEW.version AND e.to_state=NEW.state
   AND e.from_version=OLD.version AND e.from_state=OLD.state AND e.occurred_at=NEW.updated_at
   AND e.actor_id=nullif(current_setting('app.actor_id',true),'')::uuid
   AND ((NEW.state='CANCELLED' AND o.kind='CANCEL_REQUESTED') OR (NEW.state='EXPIRED' AND o.kind='EXPIRY_REQUESTED')))
 THEN RAISE EXCEPTION 'V3_SESSION_TRANSITION_PROOF_REQUIRED' USING ERRCODE='23514'; END IF;
 IF NEW.state='CANCELLED' THEN
  IF NOT EXISTS(SELECT 1 FROM highpass_v3.exchange_cancel_results r
   JOIN highpass_v3.exchange_state_events e ON e.event_id=r.event_id WHERE e.session_id=NEW.session_id AND e.to_version=NEW.version)
  THEN RAISE EXCEPTION 'V3_SESSION_CANCEL_RESULT_REQUIRED' USING ERRCODE='23514'; END IF;
 END IF;
 RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION highpass_v3.exchange_expirer(uuid,uuid) FROM PUBLIC;
