-- Isolated synthetic ceremony foundation. No approval, consumption or runtime grants.
-- Private signed reauth/nonce provenance and concurrency are future service gates.
CREATE ROLE hp_v3_consent_approval_policy NOLOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;
ALTER TABLE highpass_v3.consent_preparation_requests ADD CONSTRAINT preparation_patient_ceremony_tuple
 UNIQUE(preparation_id,session_id,session_version,patient_ref,owner_tenant_id,source_hospital_id,target_tenant_id,target_hospital_id);

CREATE FUNCTION highpass_v3.patient_consent_content_digest(id uuid,clause_version text,clause_hash bytea,
 link_purpose text,link_from timestamptz,link_until timestamptz) RETURNS bytea
 LANGUAGE sql STABLE SECURITY INVOKER SET search_path=pg_catalog AS $$
 SELECT sha256(convert_to(jsonb_build_array('HP-V3-PATIENT-CONTENT-PG16-V1',
  p.preparation_id,p.session_id,p.session_version,p.patient_ref,p.owner_tenant_id,p.source_hospital_id,
  p.target_tenant_id,p.target_hospital_id,p.purpose,extract(epoch FROM p.valid_from),extract(epoch FROM p.valid_until),
  p.policy_version,p.resource_count,p.action_count,
  (SELECT jsonb_agg(jsonb_build_array(s.ordinal,s.study_instance_uid,s.whole_study,s.series_instance_uids) ORDER BY s.ordinal)
   FROM highpass_v3.consent_preparation_scopes s WHERE s.preparation_id=p.preparation_id),
  (SELECT jsonb_agg(jsonb_build_array(a.ordinal,a.action) ORDER BY a.ordinal)
   FROM highpass_v3.consent_preparation_actions a WHERE a.preparation_id=p.preparation_id),
  clause_version,encode(clause_hash,'hex'),link_purpose,extract(epoch FROM link_from),extract(epoch FROM link_until))::text,'UTF8'))
 FROM highpass_v3.consent_preparation_requests p WHERE p.preparation_id=id
$$;

CREATE TABLE highpass_v3.consent_patient_ceremonies (
 ceremony_id uuid PRIMARY KEY,preparation_id uuid NOT NULL,session_id uuid NOT NULL,
 session_version integer NOT NULL CHECK(session_version=1),patient_ref uuid NOT NULL,
 owner_tenant_id uuid NOT NULL,source_hospital_id uuid NOT NULL,target_tenant_id uuid NOT NULL,target_hospital_id uuid NOT NULL,
 patient_actor_id uuid NOT NULL,
 nonce_hash bytea NOT NULL UNIQUE CHECK(octet_length(nonce_hash)=32),
 content_digest bytea NOT NULL CHECK(octet_length(content_digest)=32),
 digest_domain text NOT NULL DEFAULT 'HP-V3-PATIENT-CONTENT-PG16-V1' CHECK(digest_domain='HP-V3-PATIENT-CONTENT-PG16-V1'),
 link_clause_version text NOT NULL CHECK(link_clause_version ~ '^[A-Za-z0-9._:-]{1,64}$'),
 link_clause_text text NOT NULL CHECK(octet_length(link_clause_text) BETWEEN 1 AND 8192),
 link_clause_digest bytea NOT NULL CHECK(octet_length(link_clause_digest)=32
  AND link_clause_digest=sha256(convert_to(link_clause_text,'UTF8'))),
 link_purpose text NOT NULL CHECK(link_purpose='PATIENT_IDENTITY_LINK'),
 link_valid_from timestamptz NOT NULL CHECK(isfinite(link_valid_from)),
 link_valid_until timestamptz NOT NULL CHECK(isfinite(link_valid_until) AND link_valid_until>link_valid_from),
 assurance_kind text NOT NULL CHECK(assurance_kind='SIGNED_SYNTHETIC_REAUTH_ONLY'),
 reauthenticated_at timestamptz NOT NULL CHECK(isfinite(reauthenticated_at)),
 max_reauth_age_ms integer NOT NULL CHECK(max_reauth_age_ms BETWEEN 1000 AND 300000),
 issued_at timestamptz NOT NULL DEFAULT statement_timestamp() CHECK(isfinite(issued_at)),
 expires_at timestamptz NOT NULL CHECK(isfinite(expires_at)),
 creation_event_id uuid NOT NULL,audit_session_id uuid NOT NULL,
 trace_id text NOT NULL CHECK(trace_id ~ '^[A-Za-z0-9_-]{16,64}$'),
 creation_action text NOT NULL DEFAULT 'CEREMONY_CREATED' CHECK(creation_action='CEREMONY_CREATED'),
 CHECK(reauthenticated_at<=issued_at AND issued_at-reauthenticated_at<=max_reauth_age_ms*interval '1 millisecond'
  AND expires_at>issued_at AND expires_at<=issued_at+interval '5 minutes'
  AND expires_at<=reauthenticated_at+max_reauth_age_ms*interval '1 millisecond'),
 FOREIGN KEY(preparation_id,session_id,session_version,patient_ref,owner_tenant_id,source_hospital_id,target_tenant_id,target_hospital_id)
 REFERENCES highpass_v3.consent_preparation_requests
 (preparation_id,session_id,session_version,patient_ref,owner_tenant_id,source_hospital_id,target_tenant_id,target_hospital_id),
 FOREIGN KEY(patient_actor_id,owner_tenant_id,source_hospital_id)
 REFERENCES highpass_v3.principal_bindings(actor_id,tenant_id,hospital_id),
 UNIQUE(ceremony_id,preparation_id,session_id,session_version,patient_ref,owner_tenant_id,source_hospital_id,patient_actor_id)
);
CREATE TABLE highpass_v3.consent_patient_ceremony_audit (
 event_id uuid PRIMARY KEY,ceremony_id uuid NOT NULL,preparation_id uuid NOT NULL,session_id uuid NOT NULL,
 session_version integer NOT NULL CHECK(session_version=1),patient_ref uuid NOT NULL,
 tenant_id uuid NOT NULL,hospital_id uuid NOT NULL,patient_actor_id uuid NOT NULL,
 audit_session_id uuid NOT NULL,trace_id text NOT NULL CHECK(trace_id ~ '^[A-Za-z0-9_-]{16,64}$'),
 action text NOT NULL CHECK(action='CEREMONY_CREATED'),result text NOT NULL CHECK(result='RECORDED'),
 reason_code text NOT NULL CHECK(reason_code='SYNTHETIC_CHALLENGE_ONLY'),
 occurred_at timestamptz NOT NULL DEFAULT statement_timestamp() CHECK(isfinite(occurred_at)),
 FOREIGN KEY(ceremony_id,preparation_id,session_id,session_version,patient_ref,tenant_id,hospital_id,patient_actor_id)
 REFERENCES highpass_v3.consent_patient_ceremonies
 (ceremony_id,preparation_id,session_id,session_version,patient_ref,owner_tenant_id,source_hospital_id,patient_actor_id)
 DEFERRABLE INITIALLY DEFERRED,
 UNIQUE(event_id,ceremony_id,audit_session_id,trace_id,action,occurred_at),UNIQUE(ceremony_id)
);
ALTER TABLE highpass_v3.consent_patient_ceremonies ADD CONSTRAINT ceremony_creation_audit_required
 FOREIGN KEY(creation_event_id,ceremony_id,audit_session_id,trace_id,creation_action,issued_at)
 REFERENCES highpass_v3.consent_patient_ceremony_audit(event_id,ceremony_id,audit_session_id,trace_id,action,occurred_at)
 DEFERRABLE INITIALLY DEFERRED;

CREATE FUNCTION highpass_v3.require_patient_ceremony_assembly() RETURNS trigger
 LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $$
DECLARE c highpass_v3.consent_patient_ceremonies; p highpass_v3.consent_preparation_requests;
BEGIN
 SELECT * INTO c FROM highpass_v3.consent_patient_ceremonies WHERE ceremony_id=NEW.ceremony_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'V3_PATIENT_CEREMONY_ASSEMBLY_REQUIRED' USING ERRCODE='23514'; END IF;
 SELECT * INTO p FROM highpass_v3.consent_preparation_requests WHERE preparation_id=c.preparation_id;
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
DO $$ DECLARE object_name text;
BEGIN
 FOREACH object_name IN ARRAY ARRAY['consent_patient_ceremonies','consent_patient_ceremony_audit'] LOOP
  EXECUTE format('ALTER TABLE highpass_v3.%I ENABLE ROW LEVEL SECURITY',object_name);
  EXECUTE format('ALTER TABLE highpass_v3.%I FORCE ROW LEVEL SECURITY',object_name);
  EXECUTE format('REVOKE ALL ON highpass_v3.%I FROM PUBLIC',object_name);
  EXECUTE format('CREATE TRIGGER ceremony_immutable BEFORE UPDATE OR DELETE ON highpass_v3.%I FOR EACH ROW EXECUTE FUNCTION highpass_v3.reject_identity_audit_mutation()',object_name);
  EXECUTE format('CREATE CONSTRAINT TRIGGER ceremony_assembly_required AFTER INSERT ON highpass_v3.%I DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION highpass_v3.require_patient_ceremony_assembly()',object_name);
 END LOOP;
END $$;
REVOKE ALL ON FUNCTION highpass_v3.patient_consent_content_digest(uuid,text,bytea,text,timestamptz,timestamptz),
 highpass_v3.require_patient_ceremony_assembly() FROM PUBLIC;
-- No permissive policies, grants, SECURITY DEFINER, consumed flag or clinical state.
