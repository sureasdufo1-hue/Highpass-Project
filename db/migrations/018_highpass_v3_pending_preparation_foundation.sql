-- P0-06 immutable preparation foundation ONLY. No runtime grants/write policies.
-- PENDING/UNVERIFIED is not ConsentArtifact, patient approval or clinical authority.
CREATE ROLE hp_v3_pending_policy NOLOGIN NOSUPERUSER NOBYPASSRLS;

CREATE FUNCTION highpass_v3.pending_source_actor(tenant uuid,hospital uuid,requester uuid,patient uuid)
 RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path=pg_catalog AS $$
 SELECT tenant=nullif(current_setting('app.tenant_id',true),'')::uuid
 AND hospital=nullif(current_setting('app.hospital_id',true),'')::uuid
 AND EXISTS(SELECT 1 FROM highpass_v3.principal_bindings p
  JOIN highpass_v3.tenants t ON t.tenant_id=p.tenant_id
  JOIN highpass_v3.hospitals h ON h.tenant_id=p.tenant_id AND h.hospital_id=p.hospital_id
  WHERE p.actor_id=nullif(current_setting('app.actor_id',true),'')::uuid
   AND p.tenant_id=tenant AND p.hospital_id=hospital AND p.status='ACTIVE'
   AND t.status='ACTIVE' AND h.status='ACTIVE' AND 'consent:write'=ANY(p.scopes)
   AND ((p.role='PATIENT' AND p.patient_ref=patient)
    OR (p.role='DOCTOR' AND p.actor_id=requester) OR p.role='HOSPITAL_ADMIN'))
$$;
ALTER TABLE highpass_v3.exchange_sessions ADD CONSTRAINT exchange_preparation_source_target
 UNIQUE(session_id,patient_ref,owner_tenant_id,source_hospital_id,target_tenant_id,target_hospital_id);

CREATE TABLE highpass_v3.consent_preparation_requests (
 preparation_id uuid PRIMARY KEY,session_id uuid NOT NULL,session_version integer NOT NULL CHECK(session_version=1),
 patient_ref uuid NOT NULL,owner_tenant_id uuid NOT NULL,source_hospital_id uuid NOT NULL,
 target_tenant_id uuid NOT NULL,target_hospital_id uuid NOT NULL,actor_id uuid NOT NULL,
 state text NOT NULL DEFAULT 'PENDING' CHECK(state='PENDING'),
 evidence_status text NOT NULL DEFAULT 'UNVERIFIED' CHECK(evidence_status='UNVERIFIED'),
 purpose text NOT NULL CHECK(purpose ~ '^[A-Z][A-Z0-9_]{1,63}$'),
 valid_from timestamptz NOT NULL,valid_until timestamptz NOT NULL,
 policy_version text NOT NULL CHECK(policy_version ~ '^[A-Za-z0-9._:-]{1,64}$'),
 submitted_evidence_commitment bytea NOT NULL CHECK(octet_length(submitted_evidence_commitment)=32),
 resource_snapshot_digest bytea NOT NULL CHECK(octet_length(resource_snapshot_digest)=32),
 resource_count integer NOT NULL CHECK(resource_count BETWEEN 1 AND 100),
 action_count integer NOT NULL CHECK(action_count BETWEEN 1 AND 4),
 created_at timestamptz NOT NULL DEFAULT statement_timestamp(),
 creation_event_id uuid NOT NULL,audit_session_id uuid NOT NULL,
 trace_id text NOT NULL CHECK(trace_id ~ '^[A-Za-z0-9_-]{16,64}$'),
 creation_action text NOT NULL DEFAULT 'PREPARATION_CREATED' CHECK(creation_action='PREPARATION_CREATED'),
 FOREIGN KEY(session_id,patient_ref,owner_tenant_id,source_hospital_id,target_tenant_id,target_hospital_id)
 REFERENCES highpass_v3.exchange_sessions(session_id,patient_ref,owner_tenant_id,source_hospital_id,target_tenant_id,target_hospital_id),
 FOREIGN KEY(actor_id,owner_tenant_id,source_hospital_id) REFERENCES highpass_v3.principal_bindings(actor_id,tenant_id,hospital_id),
 UNIQUE(preparation_id,owner_tenant_id,source_hospital_id,actor_id),
 UNIQUE(preparation_id,session_id,session_version),
 CHECK(isfinite(valid_from) AND isfinite(valid_until) AND valid_until>valid_from
  AND isfinite(created_at) AND valid_from>=created_at AND valid_until<=valid_from+interval '24 hours')
);
CREATE TABLE highpass_v3.consent_preparation_scopes (
 preparation_id uuid NOT NULL REFERENCES highpass_v3.consent_preparation_requests(preparation_id),
 ordinal integer NOT NULL CHECK(ordinal BETWEEN 1 AND 100),
 study_instance_uid text NOT NULL CHECK(length(study_instance_uid) BETWEEN 1 AND 64 AND study_instance_uid ~ '^[0-9]+(\.[0-9]+)*$'),
 whole_study boolean NOT NULL,series_instance_uids text[],
 PRIMARY KEY(preparation_id,ordinal),UNIQUE(preparation_id,study_instance_uid),
 CHECK((whole_study AND series_instance_uids IS NULL) OR
  (NOT whole_study AND highpass_v3.valid_exchange_series(series_instance_uids) IS TRUE))
);
CREATE TABLE highpass_v3.consent_preparation_actions (
 preparation_id uuid NOT NULL REFERENCES highpass_v3.consent_preparation_requests(preparation_id),
 ordinal integer NOT NULL CHECK(ordinal BETWEEN 1 AND 4),
 action text NOT NULL CHECK(action IN ('study:view','study:download','study:pacs-transfer','study:mobile-export')),
 PRIMARY KEY(preparation_id,ordinal),UNIQUE(preparation_id,action)
);
CREATE TABLE highpass_v3.consent_preparation_audit_outbox (
 event_id uuid PRIMARY KEY,tenant_id uuid NOT NULL,hospital_id uuid NOT NULL,actor_id uuid NOT NULL,
 session_id uuid,session_version integer,preparation_id uuid,
 audit_session_id uuid NOT NULL,trace_id text NOT NULL CHECK(trace_id ~ '^[A-Za-z0-9_-]{16,64}$'),
 action text NOT NULL,result text NOT NULL,reason_code text NOT NULL,
 occurred_at timestamptz NOT NULL DEFAULT statement_timestamp() CHECK(isfinite(occurred_at)),
 FOREIGN KEY(actor_id,tenant_id,hospital_id) REFERENCES highpass_v3.principal_bindings(actor_id,tenant_id,hospital_id),
 FOREIGN KEY(preparation_id,tenant_id,hospital_id,actor_id)
 REFERENCES highpass_v3.consent_preparation_requests(preparation_id,owner_tenant_id,source_hospital_id,actor_id) DEFERRABLE INITIALLY DEFERRED,
 FOREIGN KEY(preparation_id,session_id,session_version)
 REFERENCES highpass_v3.consent_preparation_requests(preparation_id,session_id,session_version) DEFERRABLE INITIALLY DEFERRED,
 UNIQUE(event_id,preparation_id,session_id,session_version,tenant_id,hospital_id,actor_id,audit_session_id,trace_id,action,occurred_at),
 CHECK((action IN ('PREPARATION_CREATED','PREPARATION_REPLAYED') AND result='ALLOW'
   AND reason_code='PENDING_UNVERIFIED' AND session_id IS NOT NULL AND session_version=1 AND preparation_id IS NOT NULL)
  OR (action='PREPARATION_DENIED' AND result='DENY' AND preparation_id IS NULL
   AND session_id IS NULL AND session_version IS NULL AND reason_code IN
   ('SESSION_NOT_FOUND','SOURCE_REF_UNAVAILABLE','TARGET_UNAVAILABLE','VERSION_MISMATCH','SESSION_TERMINAL',
    'SESSION_EXPIRED','SCOPE_DENIED','WINDOW_DENIED','IDEMPOTENCY_CONFLICT')))
);
ALTER TABLE highpass_v3.consent_preparation_requests ADD CONSTRAINT preparation_creation_audit
 FOREIGN KEY(creation_event_id,preparation_id,session_id,session_version,owner_tenant_id,source_hospital_id,actor_id,audit_session_id,trace_id,creation_action,created_at)
 REFERENCES highpass_v3.consent_preparation_audit_outbox(event_id,preparation_id,session_id,session_version,tenant_id,hospital_id,actor_id,audit_session_id,trace_id,action,occurred_at)
 DEFERRABLE INITIALLY DEFERRED;
CREATE TABLE highpass_v3.consent_preparation_results (
 tenant_id uuid NOT NULL,hospital_id uuid NOT NULL,actor_id uuid NOT NULL,
 operation text NOT NULL CHECK(operation='CONSENT_PREPARE'),
 key_digest bytea NOT NULL CHECK(octet_length(key_digest)=32),request_digest bytea NOT NULL CHECK(octet_length(request_digest)=32),
 preparation_id uuid NOT NULL UNIQUE,session_id uuid NOT NULL,response_session_version integer NOT NULL CHECK(response_session_version=1),
 response_state text NOT NULL CHECK(response_state='PENDING'),response_evidence_status text NOT NULL CHECK(response_evidence_status='UNVERIFIED'),
 response_created_at timestamptz NOT NULL CHECK(isfinite(response_created_at)),
 PRIMARY KEY(tenant_id,hospital_id,actor_id,operation,key_digest),
 FOREIGN KEY(preparation_id,tenant_id,hospital_id,actor_id)
 REFERENCES highpass_v3.consent_preparation_requests(preparation_id,owner_tenant_id,source_hospital_id,actor_id),
 FOREIGN KEY(preparation_id,session_id,response_session_version)
 REFERENCES highpass_v3.consent_preparation_requests(preparation_id,session_id,session_version)
);
DO $$ DECLARE object_name text;
BEGIN
 FOREACH object_name IN ARRAY ARRAY['consent_preparation_requests','consent_preparation_scopes',
  'consent_preparation_actions','consent_preparation_audit_outbox','consent_preparation_results'] LOOP
  EXECUTE format('ALTER TABLE highpass_v3.%I ENABLE ROW LEVEL SECURITY',object_name);
  EXECUTE format('ALTER TABLE highpass_v3.%I FORCE ROW LEVEL SECURITY',object_name);
  EXECUTE format('REVOKE ALL ON highpass_v3.%I FROM PUBLIC',object_name);
  EXECUTE format('CREATE TRIGGER preparation_immutable BEFORE UPDATE OR DELETE ON highpass_v3.%I FOR EACH ROW EXECUTE FUNCTION highpass_v3.reject_identity_audit_mutation()',object_name);
 END LOOP;
END $$;

-- Canonical JSON equals JS JSON.stringify for these strictly digit/dot UID fields.
-- No extension/SECURITY DEFINER; called under the future nonowner's own visibility.
CREATE FUNCTION highpass_v3.pending_scope_digest(id uuid) RETURNS bytea
 LANGUAGE sql STABLE SECURITY INVOKER SET search_path=pg_catalog AS $$
 SELECT sha256(convert_to('['||coalesce(string_agg('{"studyInstanceUid":'||to_json(s.study_instance_uid)::text||
  CASE WHEN s.whole_study THEN '' ELSE ',"seriesInstanceUids":['||
   (SELECT string_agg(to_json(u)::text,',' ORDER BY n) FROM unnest(s.series_instance_uids) WITH ORDINALITY AS series(u,n))||']' END||'}',',' ORDER BY s.ordinal),'')||']','UTF8'))
 FROM highpass_v3.consent_preparation_scopes s WHERE s.preparation_id=id
$$;
CREATE FUNCTION highpass_v3.require_pending_preparation_assembly() RETURNS trigger
 LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $$
DECLARE p highpass_v3.consent_preparation_requests; id uuid; n integer; last_ordinal integer;
BEGIN
 id=NEW.preparation_id;
 SELECT * INTO p FROM highpass_v3.consent_preparation_requests WHERE preparation_id=id;
 IF NOT FOUND THEN RAISE EXCEPTION 'V3_PENDING_ASSEMBLY_REQUIRED' USING ERRCODE='23514'; END IF;
 SELECT count(*),max(ordinal) INTO n,last_ordinal FROM highpass_v3.consent_preparation_scopes WHERE preparation_id=id;
 IF p.actor_id IS DISTINCT FROM nullif(current_setting('app.actor_id',true),'')::uuid
  OR n<>p.resource_count OR last_ordinal<>n OR highpass_v3.pending_scope_digest(id)<>p.resource_snapshot_digest
  OR p.valid_until<=clock_timestamp()
  OR NOT EXISTS(SELECT 1 FROM highpass_v3.exchange_sessions s WHERE s.session_id=p.session_id
   AND s.state='REQUESTED' AND s.version=p.session_version AND s.purpose=p.purpose
   AND s.valid_from<=p.valid_from AND s.valid_until>=p.valid_until AND s.valid_until>clock_timestamp()
   AND highpass_v3.pending_source_actor(s.owner_tenant_id,s.source_hospital_id,s.requester_id,s.patient_ref) IS TRUE)
  OR NOT EXISTS(SELECT 1 FROM highpass_v3.patient_refs r WHERE r.patient_ref=p.patient_ref
   AND r.owner_tenant_id=p.owner_tenant_id AND r.owner_hospital_id=p.source_hospital_id AND r.deleted_at IS NULL)
  OR NOT EXISTS(SELECT 1 FROM highpass_v3.exchange_session_participants x WHERE x.session_id=p.session_id
   AND x.tenant_id=p.owner_tenant_id AND x.hospital_id=p.source_hospital_id AND x.patient_ref=p.patient_ref
   AND x.participant_role='SOURCE' AND x.status='ACTIVE')
  OR NOT EXISTS(SELECT 1 FROM highpass_v3.hospitals h JOIN highpass_v3.tenants t ON t.tenant_id=h.tenant_id
   WHERE h.hospital_id=p.target_hospital_id AND h.tenant_id=p.target_tenant_id AND h.status='ACTIVE' AND t.status='ACTIVE')
  OR EXISTS(SELECT 1 FROM highpass_v3.consent_preparation_scopes c WHERE c.preparation_id=id AND NOT EXISTS
   (SELECT 1 FROM highpass_v3.exchange_resource_scopes s WHERE s.session_id=p.session_id AND s.study_instance_uid=c.study_instance_uid
    AND (s.whole_study OR (NOT c.whole_study AND c.series_instance_uids<@s.series_instance_uids))))
  OR (SELECT count(*) FROM highpass_v3.consent_preparation_actions WHERE preparation_id=id)<>p.action_count
  OR (SELECT max(ordinal) FROM highpass_v3.consent_preparation_actions WHERE preparation_id=id)<>p.action_count
  OR EXISTS(SELECT 1 FROM highpass_v3.consent_preparation_actions a JOIN highpass_v3.exchange_sessions s ON s.session_id=p.session_id
   WHERE a.preparation_id=id AND NOT(a.action=ANY(s.requested_actions)))
  OR NOT EXISTS(SELECT 1 FROM highpass_v3.consent_preparation_results r WHERE r.preparation_id=id
   AND r.response_created_at=p.created_at)
 THEN RAISE EXCEPTION 'V3_PENDING_ASSEMBLY_REQUIRED' USING ERRCODE='23514'; END IF;
 RETURN NULL;
END $$;
DO $$ DECLARE object_name text;
BEGIN
 FOREACH object_name IN ARRAY ARRAY['consent_preparation_requests','consent_preparation_scopes','consent_preparation_actions','consent_preparation_results'] LOOP
  EXECUTE format('CREATE CONSTRAINT TRIGGER pending_assembly_required AFTER INSERT ON highpass_v3.%I DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION highpass_v3.require_pending_preparation_assembly()',object_name);
 END LOOP;
END $$;
REVOKE ALL ON FUNCTION highpass_v3.pending_source_actor(uuid,uuid,uuid,uuid),
 highpass_v3.pending_scope_digest(uuid),highpass_v3.require_pending_preparation_assembly() FROM PUBLIC;
-- Purpose-built RLS and nonowner provisioning are the NEXT gate, not bypassed here.
