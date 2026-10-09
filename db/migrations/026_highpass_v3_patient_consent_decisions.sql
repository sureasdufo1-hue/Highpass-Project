-- Initial synthetic patient decision persistence. No runtime/clinical enrollment.
CREATE TABLE highpass_v3.consent_content_versions (
 consent_id uuid NOT NULL,content_version integer NOT NULL CHECK(content_version>0),
 preparation_id uuid NOT NULL,ceremony_id uuid NOT NULL,session_id uuid NOT NULL,session_version integer NOT NULL CHECK(session_version=1),
 patient_ref uuid NOT NULL,owner_tenant_id uuid NOT NULL,source_hospital_id uuid NOT NULL,
 target_tenant_id uuid NOT NULL,target_hospital_id uuid NOT NULL,patient_actor_id uuid NOT NULL,
 purpose text NOT NULL,valid_from timestamptz NOT NULL,valid_until timestamptz NOT NULL,
 policy_version text NOT NULL,content_digest bytea NOT NULL CHECK(octet_length(content_digest)=32),
 resource_count integer NOT NULL CHECK(resource_count BETWEEN 1 AND 64),action_count integer NOT NULL CHECK(action_count BETWEEN 1 AND 4),
 link_clause_version text NOT NULL,link_clause_text text NOT NULL,link_clause_digest bytea NOT NULL,
 link_purpose text NOT NULL CHECK(link_purpose='PATIENT_IDENTITY_LINK'),link_valid_from timestamptz NOT NULL,link_valid_until timestamptz NOT NULL,
 created_at timestamptz NOT NULL CHECK(isfinite(created_at)),
 PRIMARY KEY(consent_id,content_version),UNIQUE(preparation_id,content_version),UNIQUE(ceremony_id),
 CHECK(isfinite(valid_from) AND isfinite(valid_until) AND valid_until>valid_from),
 CHECK(octet_length(link_clause_text) BETWEEN 1 AND 8192 AND link_clause_digest=sha256(convert_to(link_clause_text,'UTF8'))),
 CHECK(isfinite(link_valid_from) AND isfinite(link_valid_until) AND link_valid_until>link_valid_from
  AND link_valid_from>=valid_from AND link_valid_until<=valid_until),
 FOREIGN KEY(ceremony_id,preparation_id,session_id,session_version,patient_ref,owner_tenant_id,source_hospital_id,patient_actor_id)
 REFERENCES highpass_v3.consent_patient_ceremonies
 (ceremony_id,preparation_id,session_id,session_version,patient_ref,owner_tenant_id,source_hospital_id,patient_actor_id),
 UNIQUE(consent_id,content_version,ceremony_id,preparation_id,session_id,patient_ref,owner_tenant_id,source_hospital_id,patient_actor_id)
);
CREATE TABLE highpass_v3.consent_content_scopes (
 consent_id uuid NOT NULL,content_version integer NOT NULL,ordinal integer NOT NULL CHECK(ordinal>0),
 study_instance_uid text NOT NULL,whole_study boolean NOT NULL,series_instance_uids text[],
 PRIMARY KEY(consent_id,content_version,ordinal),UNIQUE(consent_id,content_version,study_instance_uid),
 FOREIGN KEY(consent_id,content_version) REFERENCES highpass_v3.consent_content_versions,
 CHECK((whole_study AND series_instance_uids IS NULL) OR
  (NOT whole_study AND series_instance_uids IS NOT NULL AND cardinality(series_instance_uids)>0))
);
CREATE TABLE highpass_v3.consent_content_actions (
 consent_id uuid NOT NULL,content_version integer NOT NULL,ordinal integer NOT NULL CHECK(ordinal>0),
 action text NOT NULL CHECK(action IN ('study:view','study:download','study:pacs-transfer','study:mobile-export')),
 PRIMARY KEY(consent_id,content_version,ordinal),UNIQUE(consent_id,content_version,action),
 FOREIGN KEY(consent_id,content_version) REFERENCES highpass_v3.consent_content_versions
);
CREATE TABLE highpass_v3.consent_state_events (
 event_id uuid PRIMARY KEY,consent_id uuid NOT NULL,content_version integer NOT NULL,event_sequence integer NOT NULL,
 ceremony_id uuid NOT NULL,preparation_id uuid NOT NULL,session_id uuid NOT NULL,patient_ref uuid NOT NULL,
 tenant_id uuid NOT NULL,hospital_id uuid NOT NULL,patient_actor_id uuid NOT NULL,
 from_state text,state text NOT NULL,action text NOT NULL,audit_session_id uuid NOT NULL,
 trace_id text NOT NULL CHECK(trace_id ~ '^[A-Za-z0-9_-]{16,64}$'),occurred_at timestamptz NOT NULL CHECK(isfinite(occurred_at)),
 UNIQUE(consent_id,content_version,event_sequence),
 CHECK((event_sequence=1 AND from_state IS NULL AND state='PENDING' AND action='CONTENT_RECORDED') OR
  (event_sequence=2 AND from_state IS NOT NULL AND from_state='PENDING' AND state IN ('ACTIVE','REJECTED') AND action='PATIENT_DECIDED')),
 FOREIGN KEY(consent_id,content_version,ceremony_id,preparation_id,session_id,patient_ref,tenant_id,hospital_id,patient_actor_id)
 REFERENCES highpass_v3.consent_content_versions
 (consent_id,content_version,ceremony_id,preparation_id,session_id,patient_ref,owner_tenant_id,source_hospital_id,patient_actor_id),
 UNIQUE(event_id,consent_id,content_version,event_sequence,tenant_id,hospital_id,patient_ref,patient_actor_id,audit_session_id,trace_id,action,occurred_at),
 UNIQUE(event_id,consent_id,content_version,event_sequence,state,occurred_at)
);
CREATE TABLE highpass_v3.consent_decision_audit (
 event_id uuid PRIMARY KEY,consent_id uuid NOT NULL,content_version integer NOT NULL,event_sequence integer NOT NULL,
 tenant_id uuid NOT NULL,hospital_id uuid NOT NULL,patient_ref uuid NOT NULL,patient_actor_id uuid NOT NULL,
 audit_session_id uuid NOT NULL,trace_id text NOT NULL,action text NOT NULL,
 result text NOT NULL DEFAULT 'RECORDED' CHECK(result='RECORDED'),
 reason_code text NOT NULL DEFAULT 'SYNTHETIC_PATIENT_DECISION_ONLY' CHECK(reason_code='SYNTHETIC_PATIENT_DECISION_ONLY'),
 occurred_at timestamptz NOT NULL,
 FOREIGN KEY(event_id,consent_id,content_version,event_sequence,tenant_id,hospital_id,patient_ref,patient_actor_id,audit_session_id,trace_id,action,occurred_at)
 REFERENCES highpass_v3.consent_state_events
 (event_id,consent_id,content_version,event_sequence,tenant_id,hospital_id,patient_ref,patient_actor_id,audit_session_id,trace_id,action,occurred_at)
 DEFERRABLE INITIALLY DEFERRED,
 UNIQUE(event_id,consent_id,content_version,event_sequence,tenant_id,hospital_id,patient_ref,patient_actor_id,audit_session_id,trace_id,action,occurred_at)
);
ALTER TABLE highpass_v3.consent_state_events ADD CONSTRAINT consent_event_audit_required
 FOREIGN KEY(event_id,consent_id,content_version,event_sequence,tenant_id,hospital_id,patient_ref,patient_actor_id,audit_session_id,trace_id,action,occurred_at)
 REFERENCES highpass_v3.consent_decision_audit
 (event_id,consent_id,content_version,event_sequence,tenant_id,hospital_id,patient_ref,patient_actor_id,audit_session_id,trace_id,action,occurred_at)
 DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE highpass_v3.consent_patient_ceremonies ADD CONSTRAINT ceremony_nonce_proof_tuple UNIQUE(ceremony_id,nonce_hash);
CREATE TABLE highpass_v3.consent_patient_decisions (
 ceremony_id uuid PRIMARY KEY,preparation_id uuid NOT NULL UNIQUE,consent_id uuid NOT NULL,content_version integer NOT NULL,
 session_id uuid NOT NULL,patient_ref uuid NOT NULL,tenant_id uuid NOT NULL,hospital_id uuid NOT NULL,patient_actor_id uuid NOT NULL,
 nonce_proof_digest bytea NOT NULL CHECK(octet_length(nonce_proof_digest)=32),
 decision text NOT NULL CHECK(decision IN ('APPROVE','REJECT')),identity_link_approved boolean NOT NULL,
 event_id uuid NOT NULL UNIQUE,event_sequence integer NOT NULL DEFAULT 2 CHECK(event_sequence=2),
 state text NOT NULL CHECK(state IN ('ACTIVE','REJECTED')),decided_at timestamptz NOT NULL CHECK(isfinite(decided_at)),
 assurance_kind text NOT NULL CHECK(assurance_kind='SIGNED_SYNTHETIC_REAUTH_ONLY'),
 reauthenticated_at timestamptz NOT NULL,max_reauth_age_ms integer NOT NULL CHECK(max_reauth_age_ms BETWEEN 1000 AND 300000),
 evidence_digest bytea NOT NULL CHECK(octet_length(evidence_digest)=32),
 CHECK((decision='APPROVE' AND state='ACTIVE') OR (decision='REJECT' AND state='REJECTED' AND NOT identity_link_approved)),
 CHECK(isfinite(reauthenticated_at) AND reauthenticated_at<=decided_at
  AND decided_at-reauthenticated_at<=max_reauth_age_ms*interval '1 millisecond'),
 UNIQUE(consent_id,content_version),
 FOREIGN KEY(ceremony_id,nonce_proof_digest) REFERENCES highpass_v3.consent_patient_ceremonies(ceremony_id,nonce_hash),
 FOREIGN KEY(consent_id,content_version,ceremony_id,preparation_id,session_id,patient_ref,tenant_id,hospital_id,patient_actor_id)
 REFERENCES highpass_v3.consent_content_versions
 (consent_id,content_version,ceremony_id,preparation_id,session_id,patient_ref,owner_tenant_id,source_hospital_id,patient_actor_id),
 FOREIGN KEY(event_id,consent_id,content_version,event_sequence,state,decided_at) REFERENCES highpass_v3.consent_state_events
 (event_id,consent_id,content_version,event_sequence,state,occurred_at) DEFERRABLE INITIALLY DEFERRED,
 UNIQUE(ceremony_id,consent_id,content_version,event_id,state,identity_link_approved,decided_at,evidence_digest,tenant_id,hospital_id,patient_actor_id,patient_ref)
);
CREATE TABLE highpass_v3.consent_patient_decision_results (
 tenant_id uuid NOT NULL,hospital_id uuid NOT NULL,patient_actor_id uuid NOT NULL,patient_ref uuid NOT NULL,
 operation text NOT NULL DEFAULT 'CONSENT_DECIDE' CHECK(operation='CONSENT_DECIDE'),
 key_digest bytea NOT NULL CHECK(octet_length(key_digest)=32),request_digest bytea NOT NULL CHECK(octet_length(request_digest)=32),
 ceremony_id uuid NOT NULL UNIQUE,consent_id uuid NOT NULL,content_version integer NOT NULL,event_id uuid NOT NULL,
 state text NOT NULL,identity_link_approved boolean NOT NULL,decided_at timestamptz NOT NULL,evidence_digest bytea NOT NULL,
 PRIMARY KEY(tenant_id,hospital_id,patient_actor_id,operation,key_digest),
 FOREIGN KEY(ceremony_id,consent_id,content_version,event_id,state,identity_link_approved,decided_at,evidence_digest,tenant_id,hospital_id,patient_actor_id,patient_ref)
 REFERENCES highpass_v3.consent_patient_decisions
 (ceremony_id,consent_id,content_version,event_id,state,identity_link_approved,decided_at,evidence_digest,tenant_id,hospital_id,patient_actor_id,patient_ref)
);

CREATE FUNCTION highpass_v3.patient_decision_evidence_digest(ceremony uuid,consent uuid,version integer,
 choice text,link_choice boolean,decided timestamptz,reauth timestamptz,max_age integer) RETURNS bytea
 LANGUAGE sql STABLE SECURITY INVOKER SET search_path=pg_catalog AS $$
 SELECT sha256(convert_to(jsonb_build_array('HP-V3-PATIENT-DECISION-PG16-V1',consent,version,c.ceremony_id,
  c.preparation_id,c.session_id,c.session_version,c.patient_ref,c.owner_tenant_id,c.source_hospital_id,
  c.target_tenant_id,c.target_hospital_id,c.patient_actor_id,encode(c.content_digest,'hex'),
  c.link_clause_version,encode(c.link_clause_digest,'hex'),c.link_purpose,extract(epoch FROM c.link_valid_from),
  extract(epoch FROM c.link_valid_until),choice,link_choice,extract(epoch FROM decided),
  'SIGNED_SYNTHETIC_REAUTH_ONLY',extract(epoch FROM reauth),max_age)::text,'UTF8'))
 FROM highpass_v3.consent_patient_ceremonies c WHERE c.ceremony_id=ceremony
$$;

CREATE FUNCTION highpass_v3.require_patient_decision_assembly() RETURNS trigger
 LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $$
DECLARE v highpass_v3.consent_content_versions; c highpass_v3.consent_patient_ceremonies;
 d highpass_v3.consent_patient_decisions; p record; n integer;
BEGIN
 SELECT * INTO v FROM highpass_v3.consent_content_versions WHERE consent_id=NEW.consent_id AND content_version=NEW.content_version;
 IF NOT FOUND THEN RAISE EXCEPTION 'V3_PATIENT_DECISION_ASSEMBLY_REQUIRED' USING ERRCODE='23514'; END IF;
 SELECT * INTO c FROM highpass_v3.consent_patient_ceremonies WHERE ceremony_id=v.ceremony_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'V3_PATIENT_DECISION_ASSEMBLY_REQUIRED' USING ERRCODE='23514'; END IF;
 SELECT * INTO d FROM highpass_v3.consent_patient_decisions WHERE consent_id=v.consent_id AND content_version=v.content_version;
 IF NOT FOUND THEN RAISE EXCEPTION 'V3_PATIENT_DECISION_ASSEMBLY_REQUIRED' USING ERRCODE='23514'; END IF;
 SELECT preparation_id,purpose,policy_version,resource_count,action_count,valid_from,valid_until,state,evidence_status INTO p
 FROM highpass_v3.consent_preparation_requests WHERE preparation_id=v.preparation_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'V3_PATIENT_DECISION_ASSEMBLY_REQUIRED' USING ERRCODE='23514'; END IF;
 IF v.content_version<>1 OR v.patient_actor_id IS DISTINCT FROM nullif(current_setting('app.actor_id',true),'')::uuid
  OR highpass_v3.approval_patient_context(v.owner_tenant_id,v.source_hospital_id,v.patient_ref) IS NOT TRUE
  OR ROW(v.target_tenant_id,v.target_hospital_id,v.content_digest,v.link_clause_version,v.link_clause_text,v.link_clause_digest,
   v.link_purpose,v.link_valid_from,v.link_valid_until) IS DISTINCT FROM
   ROW(c.target_tenant_id,c.target_hospital_id,c.content_digest,c.link_clause_version,c.link_clause_text,c.link_clause_digest,
   c.link_purpose,c.link_valid_from,c.link_valid_until)
  OR ROW(v.purpose,v.policy_version,v.resource_count,v.action_count,v.valid_from,v.valid_until) IS DISTINCT FROM
   ROW(p.purpose,p.policy_version,p.resource_count,p.action_count,p.valid_from,p.valid_until)
  OR p.state<>'PENDING' OR p.evidence_status<>'UNVERIFIED'
  OR v.created_at<>d.decided_at OR d.decided_at<c.issued_at OR d.decided_at>=c.expires_at OR d.decided_at>clock_timestamp()
  OR c.expires_at<=clock_timestamp() OR v.valid_until<=clock_timestamp()
  OR d.reauthenticated_at+d.max_reauth_age_ms*interval '1 millisecond'<=clock_timestamp()
  OR d.evidence_digest IS DISTINCT FROM highpass_v3.patient_decision_evidence_digest(c.ceremony_id,v.consent_id,v.content_version,
   d.decision,d.identity_link_approved,d.decided_at,d.reauthenticated_at,d.max_reauth_age_ms)
  OR v.content_digest IS DISTINCT FROM highpass_v3.patient_consent_content_digest(v.preparation_id,v.link_clause_version,
   v.link_clause_digest,v.link_purpose,v.link_valid_from,v.link_valid_until)
  OR NOT EXISTS(SELECT 1 FROM highpass_v3.consent_patient_challenge_results r WHERE r.ceremony_id=c.ceremony_id)
  OR NOT EXISTS(SELECT 1 FROM highpass_v3.patient_refs r WHERE r.patient_ref=v.patient_ref AND r.deleted_at IS NULL
   AND r.owner_tenant_id=v.owner_tenant_id AND r.owner_hospital_id=v.source_hospital_id)
  OR NOT EXISTS(SELECT 1 FROM highpass_v3.exchange_sessions s WHERE s.session_id=v.session_id AND s.version=v.session_version
   AND s.state='REQUESTED' AND s.valid_until>clock_timestamp())
  OR NOT EXISTS(SELECT 1 FROM highpass_v3.exchange_session_participants x WHERE x.session_id=v.session_id AND x.patient_ref=v.patient_ref
   AND x.tenant_id=v.owner_tenant_id AND x.hospital_id=v.source_hospital_id AND x.participant_role='SOURCE' AND x.status='ACTIVE')
  OR NOT EXISTS(SELECT 1 FROM highpass_v3.hospitals h JOIN highpass_v3.tenants t ON t.tenant_id=h.tenant_id
   WHERE h.hospital_id=v.target_hospital_id AND h.tenant_id=v.target_tenant_id AND h.status='ACTIVE' AND t.status='ACTIVE')
 THEN RAISE EXCEPTION 'V3_PATIENT_DECISION_ASSEMBLY_REQUIRED' USING ERRCODE='23514'; END IF;
 SELECT count(*) INTO n FROM highpass_v3.consent_state_events WHERE consent_id=v.consent_id AND content_version=v.content_version;
 IF n<>2 OR NOT EXISTS(SELECT 1 FROM highpass_v3.consent_state_events e WHERE e.consent_id=v.consent_id AND e.content_version=v.content_version
   AND e.event_sequence=1 AND e.state='PENDING' AND e.from_state IS NULL AND e.occurred_at=v.created_at)
  OR NOT EXISTS(SELECT 1 FROM highpass_v3.consent_state_events e WHERE e.event_id=d.event_id AND e.event_sequence=2 AND e.state=d.state
   AND e.occurred_at=d.decided_at)
  OR NOT EXISTS(SELECT 1 FROM highpass_v3.consent_patient_decision_results r WHERE r.ceremony_id=d.ceremony_id)
 THEN RAISE EXCEPTION 'V3_PATIENT_DECISION_ASSEMBLY_REQUIRED' USING ERRCODE='23514'; END IF;
 IF EXISTS((SELECT ordinal,study_instance_uid,whole_study,series_instance_uids FROM highpass_v3.consent_content_scopes
   WHERE consent_id=v.consent_id AND content_version=v.content_version EXCEPT SELECT ordinal,study_instance_uid,whole_study,series_instance_uids
   FROM highpass_v3.consent_preparation_scopes WHERE preparation_id=v.preparation_id)
  UNION ALL (SELECT ordinal,study_instance_uid,whole_study,series_instance_uids FROM highpass_v3.consent_preparation_scopes
   WHERE preparation_id=v.preparation_id EXCEPT SELECT ordinal,study_instance_uid,whole_study,series_instance_uids
   FROM highpass_v3.consent_content_scopes WHERE consent_id=v.consent_id AND content_version=v.content_version))
  OR EXISTS((SELECT ordinal,action FROM highpass_v3.consent_content_actions WHERE consent_id=v.consent_id AND content_version=v.content_version
   EXCEPT SELECT ordinal,action FROM highpass_v3.consent_preparation_actions WHERE preparation_id=v.preparation_id)
  UNION ALL (SELECT ordinal,action FROM highpass_v3.consent_preparation_actions WHERE preparation_id=v.preparation_id
   EXCEPT SELECT ordinal,action FROM highpass_v3.consent_content_actions WHERE consent_id=v.consent_id AND content_version=v.content_version))
 THEN RAISE EXCEPTION 'V3_PATIENT_DECISION_ASSEMBLY_REQUIRED' USING ERRCODE='23514'; END IF;
 RETURN NULL;
END $$;

DO $$ DECLARE object_name text;
BEGIN
 FOREACH object_name IN ARRAY ARRAY['consent_content_versions','consent_content_scopes','consent_content_actions','consent_state_events',
  'consent_decision_audit','consent_patient_decisions','consent_patient_decision_results'] LOOP
  EXECUTE format('ALTER TABLE highpass_v3.%I ENABLE ROW LEVEL SECURITY',object_name);
  EXECUTE format('ALTER TABLE highpass_v3.%I FORCE ROW LEVEL SECURITY',object_name);
  EXECUTE format('REVOKE ALL ON highpass_v3.%I FROM PUBLIC',object_name);
  EXECUTE format('CREATE TRIGGER consent_decision_immutable BEFORE UPDATE OR DELETE ON highpass_v3.%I FOR EACH ROW EXECUTE FUNCTION highpass_v3.reject_identity_audit_mutation()',object_name);
  EXECUTE format('CREATE CONSTRAINT TRIGGER patient_decision_assembly_required AFTER INSERT ON highpass_v3.%I DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION highpass_v3.require_patient_decision_assembly()',object_name);
 END LOOP;
END $$;
CREATE POLICY patient_content_read ON highpass_v3.consent_content_versions FOR SELECT TO hp_v3_consent_approval_policy USING
 (patient_actor_id=nullif(current_setting('app.actor_id',true),'')::uuid
  AND highpass_v3.approval_patient_context(owner_tenant_id,source_hospital_id,patient_ref));
CREATE POLICY patient_content_insert ON highpass_v3.consent_content_versions FOR INSERT TO hp_v3_consent_approval_policy WITH CHECK
 (patient_actor_id=nullif(current_setting('app.actor_id',true),'')::uuid
  AND highpass_v3.approval_patient_context(owner_tenant_id,source_hospital_id,patient_ref));
DO $$ DECLARE object_name text;
BEGIN
 FOREACH object_name IN ARRAY ARRAY['consent_content_scopes','consent_content_actions'] LOOP
  EXECUTE format('CREATE POLICY patient_child_read ON highpass_v3.%I FOR SELECT TO hp_v3_consent_approval_policy USING
   (EXISTS(SELECT 1 FROM highpass_v3.consent_content_versions v WHERE v.consent_id=%I.consent_id AND v.content_version=%I.content_version))',object_name,object_name,object_name);
  EXECUTE format('CREATE POLICY patient_child_insert ON highpass_v3.%I FOR INSERT TO hp_v3_consent_approval_policy WITH CHECK
   (EXISTS(SELECT 1 FROM highpass_v3.consent_content_versions v WHERE v.consent_id=%I.consent_id AND v.content_version=%I.content_version))',object_name,object_name,object_name);
 END LOOP;
 FOREACH object_name IN ARRAY ARRAY['consent_state_events','consent_decision_audit','consent_patient_decisions','consent_patient_decision_results'] LOOP
  EXECUTE format('CREATE POLICY patient_decision_read ON highpass_v3.%I FOR SELECT TO hp_v3_consent_approval_policy USING
   (patient_actor_id=nullif(current_setting(''app.actor_id'',true),'''')::uuid AND highpass_v3.approval_patient_context(tenant_id,hospital_id,patient_ref))',object_name);
  EXECUTE format('CREATE POLICY patient_decision_insert ON highpass_v3.%I FOR INSERT TO hp_v3_consent_approval_policy WITH CHECK
   (patient_actor_id=nullif(current_setting(''app.actor_id'',true),'''')::uuid AND highpass_v3.approval_patient_context(tenant_id,hospital_id,patient_ref))',object_name);
 END LOOP;
END $$;
REVOKE ALL ON FUNCTION highpass_v3.patient_decision_evidence_digest(uuid,uuid,integer,text,boolean,timestamptz,timestamptz,integer),
 highpass_v3.require_patient_decision_assembly() FROM PUBLIC;
-- All admission remains fixture-only until service/races/transport/review gates.
