-- P0-05 schema foundation only. No runtime grants or write policy until the
-- authenticated Session repository, registry locks and retry contract are ready.
ALTER TABLE highpass_v3.patient_ref_registrations ADD CONSTRAINT ref_registration_source_tuple
 UNIQUE(patient_ref,tenant_id,hospital_id);
ALTER TABLE highpass_v3.principal_bindings ADD CONSTRAINT principal_institution_tuple
 UNIQUE(actor_id,tenant_id,hospital_id);

CREATE TABLE highpass_v3.exchange_sessions (
 session_id uuid PRIMARY KEY,
 patient_ref uuid NOT NULL,
 owner_tenant_id uuid NOT NULL,
 source_hospital_id uuid NOT NULL,
 target_tenant_id uuid NOT NULL,
 target_hospital_id uuid NOT NULL,
 requester_id uuid NOT NULL,
 purpose text NOT NULL CHECK(length(purpose) BETWEEN 2 AND 64 AND purpose ~ '^[A-Z][A-Z0-9_]*$'),
 initiation_type text NOT NULL CHECK(initiation_type IN ('PATIENT_INITIATED','PROVIDER_INITIATED')),
 state text NOT NULL DEFAULT 'REQUESTED' CHECK(state='REQUESTED'),
 version integer NOT NULL DEFAULT 1 CHECK(version=1),
 valid_from timestamptz NOT NULL DEFAULT statement_timestamp(),
 valid_until timestamptz NOT NULL,
 created_at timestamptz NOT NULL DEFAULT statement_timestamp(),
 updated_at timestamptz NOT NULL DEFAULT statement_timestamp(),
 resource_snapshot_digest bytea NOT NULL CHECK(octet_length(resource_snapshot_digest)=32),
 resource_count integer NOT NULL CHECK(resource_count BETWEEN 1 AND 100),
 audit_session_id uuid NOT NULL,
 trace_id text NOT NULL CHECK(trace_id ~ '^[A-Za-z0-9_-]{16,64}$'),
 FOREIGN KEY(patient_ref,owner_tenant_id,source_hospital_id)
  REFERENCES highpass_v3.patient_ref_registrations(patient_ref,tenant_id,hospital_id),
 FOREIGN KEY(requester_id,owner_tenant_id,source_hospital_id)
  REFERENCES highpass_v3.principal_bindings(actor_id,tenant_id,hospital_id),
 FOREIGN KEY(target_tenant_id,target_hospital_id) REFERENCES highpass_v3.hospitals(tenant_id,hospital_id),
 UNIQUE(session_id,patient_ref),
 UNIQUE(session_id,owner_tenant_id,source_hospital_id,requester_id),
 CHECK(source_hospital_id<>target_hospital_id AND owner_tenant_id<>target_tenant_id),
 CHECK(isfinite(valid_from) AND isfinite(valid_until) AND valid_until>valid_from),
 CHECK(created_at=valid_from AND updated_at=created_at)
);

CREATE TABLE highpass_v3.exchange_session_participants (
 session_id uuid NOT NULL,
 patient_ref uuid NOT NULL,
 tenant_id uuid NOT NULL,
 hospital_id uuid NOT NULL,
 participant_role text NOT NULL CHECK(participant_role IN ('SOURCE','DESTINATION')),
 status text NOT NULL CHECK(status IN ('ACTIVE','INVITED')),
 PRIMARY KEY(session_id,participant_role),
 UNIQUE(session_id,tenant_id,hospital_id),
 FOREIGN KEY(session_id,patient_ref) REFERENCES highpass_v3.exchange_sessions(session_id,patient_ref),
 FOREIGN KEY(tenant_id,hospital_id) REFERENCES highpass_v3.hospitals(tenant_id,hospital_id),
 CHECK((participant_role='SOURCE' AND status='ACTIVE') OR (participant_role='DESTINATION' AND status='INVITED'))
);

CREATE FUNCTION highpass_v3.valid_exchange_series(value text[]) RETURNS boolean
 LANGUAGE sql IMMUTABLE SECURITY INVOKER SET search_path=pg_catalog AS $$
 SELECT value IS NOT NULL AND cardinality(value) BETWEEN 1 AND 500
  AND array_ndims(value)=1 AND array_lower(value,1)=1
  AND (SELECT count(*)=count(DISTINCT item) AND bool_and(item IS NOT NULL
    AND length(item) BETWEEN 1 AND 64 AND item ~ '^[0-9]+(\.[0-9]+)*$') FROM unnest(value) AS item)
$$;
CREATE TABLE highpass_v3.exchange_resource_scopes (
 session_id uuid NOT NULL REFERENCES highpass_v3.exchange_sessions(session_id),
 ordinal integer NOT NULL CHECK(ordinal BETWEEN 1 AND 100),
 study_instance_uid text NOT NULL CHECK(length(study_instance_uid) BETWEEN 1 AND 64 AND study_instance_uid ~ '^[0-9]+(\.[0-9]+)*$'),
 whole_study boolean NOT NULL,
 series_instance_uids text[],
 PRIMARY KEY(session_id,ordinal),
 UNIQUE(session_id,study_instance_uid),
 CHECK((whole_study AND series_instance_uids IS NULL)
  OR (NOT whole_study AND highpass_v3.valid_exchange_series(series_instance_uids) IS TRUE))
);

CREATE TABLE highpass_v3.exchange_audit_outbox (
 event_id uuid PRIMARY KEY,
 session_id uuid REFERENCES highpass_v3.exchange_sessions(session_id),
 tenant_id uuid NOT NULL,
 hospital_id uuid NOT NULL,
 actor_id uuid NOT NULL,
 audit_session_id uuid NOT NULL,
 trace_id text NOT NULL CHECK(trace_id ~ '^[A-Za-z0-9_-]{16,64}$'),
 action text NOT NULL CHECK(action IN ('SESSION_CREATED','SESSION_READ','SESSION_DENIED')),
 result text NOT NULL CHECK(result IN ('ALLOW','DENY')),
 reason_code text NOT NULL CHECK(reason_code IN ('SESSION_REQUESTED','METADATA_READ','SESSION_NOT_FOUND','SCOPE_DENIED','SESSION_EXPIRED')),
 session_version integer CHECK(session_version=1),
 timestamp timestamptz NOT NULL DEFAULT statement_timestamp(),
 FOREIGN KEY(actor_id,tenant_id,hospital_id) REFERENCES highpass_v3.principal_bindings(actor_id,tenant_id,hospital_id),
 CHECK(action='SESSION_DENIED' OR (session_id IS NOT NULL AND session_version IS NOT NULL)),
 CHECK((action='SESSION_CREATED' AND result='ALLOW' AND reason_code='SESSION_REQUESTED' AND session_id IS NOT NULL AND session_version=1)
  OR (action='SESSION_READ' AND result='ALLOW' AND reason_code='METADATA_READ' AND session_id IS NOT NULL AND session_version=1)
  OR (action='SESSION_DENIED' AND result='DENY' AND reason_code IN ('SESSION_NOT_FOUND','SCOPE_DENIED','SESSION_EXPIRED')))
);
CREATE TABLE highpass_v3.exchange_write_results (
 tenant_id uuid NOT NULL,
 hospital_id uuid NOT NULL,
 actor_id uuid NOT NULL,
 operation text NOT NULL CHECK(operation='SESSION_CREATE'),
 key_digest bytea NOT NULL CHECK(octet_length(key_digest)=32),
 request_digest bytea NOT NULL CHECK(octet_length(request_digest)=32),
 session_id uuid NOT NULL,
 response_state text NOT NULL CHECK(response_state='REQUESTED'),
 response_version integer NOT NULL CHECK(response_version=1),
 response_created_at timestamptz NOT NULL CHECK(isfinite(response_created_at)),
 PRIMARY KEY(tenant_id,hospital_id,actor_id,operation,key_digest),
 FOREIGN KEY(session_id,tenant_id,hospital_id,actor_id)
  REFERENCES highpass_v3.exchange_sessions(session_id,owner_tenant_id,source_hospital_id,requester_id)
);

ALTER TABLE highpass_v3.exchange_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE highpass_v3.exchange_sessions FORCE ROW LEVEL SECURITY;
ALTER TABLE highpass_v3.exchange_session_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE highpass_v3.exchange_session_participants FORCE ROW LEVEL SECURITY;
ALTER TABLE highpass_v3.exchange_resource_scopes ENABLE ROW LEVEL SECURITY;
ALTER TABLE highpass_v3.exchange_resource_scopes FORCE ROW LEVEL SECURITY;
ALTER TABLE highpass_v3.exchange_audit_outbox ENABLE ROW LEVEL SECURITY;
ALTER TABLE highpass_v3.exchange_audit_outbox FORCE ROW LEVEL SECURITY;
ALTER TABLE highpass_v3.exchange_write_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE highpass_v3.exchange_write_results FORCE ROW LEVEL SECURITY;

-- Base participant policy never reads its parent, avoiding RLS recursion.
CREATE POLICY exchange_participant_read ON highpass_v3.exchange_session_participants FOR SELECT USING
 (status='ACTIVE' AND tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid
  AND hospital_id=nullif(current_setting('app.hospital_id',true),'')::uuid
  AND EXISTS(SELECT 1 FROM highpass_v3.principal_bindings p
   JOIN highpass_v3.tenants t ON t.tenant_id=p.tenant_id
   JOIN highpass_v3.hospitals h ON h.tenant_id=p.tenant_id AND h.hospital_id=p.hospital_id
   WHERE p.actor_id=nullif(current_setting('app.actor_id',true),'')::uuid
    AND p.tenant_id=exchange_session_participants.tenant_id AND p.hospital_id=exchange_session_participants.hospital_id
    AND p.status='ACTIVE' AND t.status='ACTIVE' AND h.status='ACTIVE' AND 'exchange:read'=ANY(p.scopes)
    AND (p.role IN ('DOCTOR','HOSPITAL_ADMIN') OR (p.role='PATIENT' AND p.patient_ref=exchange_session_participants.patient_ref))));
CREATE POLICY exchange_session_read ON highpass_v3.exchange_sessions FOR SELECT USING
 (EXISTS(SELECT 1 FROM highpass_v3.exchange_session_participants p WHERE p.session_id=exchange_sessions.session_id));
CREATE POLICY exchange_scope_read ON highpass_v3.exchange_resource_scopes FOR SELECT USING
 (EXISTS(SELECT 1 FROM highpass_v3.exchange_sessions s WHERE s.session_id=exchange_resource_scopes.session_id));
CREATE POLICY exchange_result_read ON highpass_v3.exchange_write_results FOR SELECT USING
 (tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid
  AND hospital_id=nullif(current_setting('app.hospital_id',true),'')::uuid
  AND actor_id=nullif(current_setting('app.actor_id',true),'')::uuid
  AND EXISTS(SELECT 1 FROM highpass_v3.exchange_sessions s WHERE s.session_id=exchange_write_results.session_id));
CREATE POLICY exchange_audit_read ON highpass_v3.exchange_audit_outbox FOR SELECT USING
 (tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid
  AND hospital_id=nullif(current_setting('app.hospital_id',true),'')::uuid
  AND EXISTS(SELECT 1 FROM highpass_v3.principal_bindings p JOIN highpass_v3.tenants t ON t.tenant_id=p.tenant_id
   JOIN highpass_v3.hospitals h ON h.tenant_id=p.tenant_id AND h.hospital_id=p.hospital_id
   WHERE p.actor_id=nullif(current_setting('app.actor_id',true),'')::uuid AND p.tenant_id=exchange_audit_outbox.tenant_id
    AND p.hospital_id=exchange_audit_outbox.hospital_id AND p.status='ACTIVE' AND t.status='ACTIVE' AND h.status='ACTIVE'
    AND p.role IN ('HOSPITAL_ADMIN','SECURITY_ADMIN') AND 'audit:read'=ANY(p.scopes)));

-- Fail-closed rollout: all application INSERT/UPDATE/DELETE remain forbidden.
CREATE TRIGGER exchange_session_immutable BEFORE UPDATE OR DELETE ON highpass_v3.exchange_sessions
 FOR EACH ROW EXECUTE FUNCTION highpass_v3.reject_identity_audit_mutation();
CREATE TRIGGER exchange_participant_immutable BEFORE UPDATE OR DELETE ON highpass_v3.exchange_session_participants
 FOR EACH ROW EXECUTE FUNCTION highpass_v3.reject_identity_audit_mutation();
CREATE TRIGGER exchange_scope_immutable BEFORE UPDATE OR DELETE ON highpass_v3.exchange_resource_scopes
 FOR EACH ROW EXECUTE FUNCTION highpass_v3.reject_identity_audit_mutation();
CREATE TRIGGER exchange_audit_immutable BEFORE UPDATE OR DELETE ON highpass_v3.exchange_audit_outbox
 FOR EACH ROW EXECUTE FUNCTION highpass_v3.reject_identity_audit_mutation();
CREATE TRIGGER exchange_result_immutable BEFORE UPDATE OR DELETE ON highpass_v3.exchange_write_results
 FOR EACH ROW EXECUTE FUNCTION highpass_v3.reject_identity_audit_mutation();

CREATE FUNCTION highpass_v3.require_exchange_assembly() RETURNS trigger
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
  NOT EXISTS(SELECT 1 FROM highpass_v3.principal_bindings p JOIN highpass_v3.tenants t ON t.tenant_id=p.tenant_id
   JOIN highpass_v3.hospitals h ON h.hospital_id=p.hospital_id AND h.tenant_id=p.tenant_id
   WHERE p.actor_id=NEW.requester_id AND p.tenant_id=NEW.owner_tenant_id AND p.hospital_id=NEW.source_hospital_id
    AND p.status='ACTIVE' AND t.status='ACTIVE' AND h.status='ACTIVE' AND 'exchange:create'=ANY(p.scopes)
    AND ((p.role='PATIENT' AND p.patient_ref=NEW.patient_ref AND NEW.initiation_type='PATIENT_INITIATED')
      OR (p.role IN ('DOCTOR','HOSPITAL_ADMIN') AND NEW.initiation_type='PROVIDER_INITIATED'))) OR
  NOT EXISTS(SELECT 1 FROM highpass_v3.hospitals h JOIN highpass_v3.tenants t ON t.tenant_id=h.tenant_id
   WHERE h.hospital_id=NEW.target_hospital_id AND h.tenant_id=NEW.target_tenant_id AND h.status='ACTIVE' AND t.status='ACTIVE') OR
  NOT EXISTS(SELECT 1 FROM highpass_v3.patient_refs r WHERE r.patient_ref=NEW.patient_ref AND r.deleted_at IS NULL) OR
  NOT EXISTS(SELECT 1 FROM highpass_v3.exchange_audit_outbox e WHERE e.session_id=NEW.session_id
   AND e.tenant_id=NEW.owner_tenant_id AND e.hospital_id=NEW.source_hospital_id AND e.actor_id=NEW.requester_id
   AND e.action='SESSION_CREATED' AND e.audit_session_id=NEW.audit_session_id AND e.trace_id=NEW.trace_id) OR
  NOT EXISTS(SELECT 1 FROM highpass_v3.exchange_write_results r WHERE r.session_id=NEW.session_id AND r.response_created_at=NEW.created_at)
 THEN RAISE EXCEPTION 'V3_SESSION_ASSEMBLY_REQUIRED' USING ERRCODE='23514'; END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER exchange_assembly_required AFTER INSERT ON highpass_v3.exchange_sessions
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION highpass_v3.require_exchange_assembly();
-- Immutability includes append: a later INSERT cannot silently enlarge a sealed
-- snapshot. The parent's immutable declared count binds the assembled scope set.
CREATE FUNCTION highpass_v3.require_exchange_scope_count() RETURNS trigger
 LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM highpass_v3.exchange_sessions s WHERE s.session_id=NEW.session_id
  AND s.resource_count=(SELECT count(*) FROM highpass_v3.exchange_resource_scopes r WHERE r.session_id=NEW.session_id))
 THEN RAISE EXCEPTION 'V3_SESSION_SCOPE_IMMUTABLE' USING ERRCODE='23514'; END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER exchange_scope_count_required AFTER INSERT ON highpass_v3.exchange_resource_scopes
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION highpass_v3.require_exchange_scope_count();
REVOKE ALL ON highpass_v3.exchange_sessions,highpass_v3.exchange_session_participants,highpass_v3.exchange_resource_scopes,
 highpass_v3.exchange_audit_outbox,highpass_v3.exchange_write_results FROM PUBLIC;
REVOKE ALL ON FUNCTION highpass_v3.valid_exchange_series(text[]),highpass_v3.require_exchange_assembly(),highpass_v3.require_exchange_scope_count() FROM PUBLIC;
