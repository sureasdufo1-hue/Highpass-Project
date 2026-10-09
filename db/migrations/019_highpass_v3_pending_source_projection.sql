-- Read/lock authority ONLY. No staging INSERT policy, grants or runtime enrollment.
-- Avoid evaluating legacy Mapping/exchange:create/read policies in a pending pool.
DO $$ DECLARE policy_row record;
BEGIN
 FOR policy_row IN SELECT c.relname,p.polname FROM pg_policy p JOIN pg_class c ON c.oid=p.polrelid
  JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='highpass_v3' AND p.polpermissive
  AND (c.relname IN ('patient_refs','exchange_creation_context','exchange_session_participants','exchange_resource_scopes')
   OR p.polname IN ('exchange_directory_hospital','exchange_directory_tenant','exchange_directory_hospital_lock','exchange_directory_tenant_lock')) LOOP
  EXECUTE format('ALTER POLICY %I ON highpass_v3.%I TO hp_v3_clinical_policy',policy_row.polname,policy_row.relname);
 END LOOP;
END $$;
CREATE POLICY pending_root_read ON highpass_v3.exchange_creation_context FOR SELECT TO hp_v3_pending_policy USING
 (highpass_v3.pending_source_actor(owner_tenant_id,source_hospital_id,requester_id,patient_ref));
CREATE POLICY pending_session_read ON highpass_v3.exchange_sessions FOR SELECT TO hp_v3_pending_policy USING
 (EXISTS(SELECT 1 FROM highpass_v3.exchange_creation_context c WHERE c.session_id=exchange_sessions.session_id));
CREATE POLICY pending_session_lock ON highpass_v3.exchange_sessions FOR UPDATE TO hp_v3_pending_policy USING
 (EXISTS(SELECT 1 FROM highpass_v3.exchange_creation_context c WHERE c.session_id=exchange_sessions.session_id)) WITH CHECK(false);
CREATE POLICY pending_ref_read ON highpass_v3.patient_refs FOR SELECT TO hp_v3_pending_policy USING
 (deleted_at IS NULL AND owner_tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid
  AND owner_hospital_id=nullif(current_setting('app.hospital_id',true),'')::uuid
  AND EXISTS(SELECT 1 FROM highpass_v3.exchange_creation_context c WHERE c.patient_ref=patient_refs.patient_ref
   AND c.owner_tenant_id=patient_refs.owner_tenant_id AND c.source_hospital_id=patient_refs.owner_hospital_id));
CREATE POLICY pending_ref_lock ON highpass_v3.patient_refs FOR UPDATE TO hp_v3_pending_policy USING
 (deleted_at IS NULL AND owner_tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid
  AND owner_hospital_id=nullif(current_setting('app.hospital_id',true),'')::uuid
  AND EXISTS(SELECT 1 FROM highpass_v3.exchange_creation_context c WHERE c.patient_ref=patient_refs.patient_ref
   AND c.owner_tenant_id=patient_refs.owner_tenant_id AND c.source_hospital_id=patient_refs.owner_hospital_id)) WITH CHECK(false);
CREATE POLICY pending_participant_read ON highpass_v3.exchange_session_participants FOR SELECT TO hp_v3_pending_policy USING
 (participant_role='SOURCE' AND status='ACTIVE' AND tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid
  AND hospital_id=nullif(current_setting('app.hospital_id',true),'')::uuid
  AND EXISTS(SELECT 1 FROM highpass_v3.exchange_creation_context c WHERE c.session_id=exchange_session_participants.session_id
   AND c.patient_ref=exchange_session_participants.patient_ref));
CREATE POLICY pending_scope_read ON highpass_v3.exchange_resource_scopes FOR SELECT TO hp_v3_pending_policy USING
 (EXISTS(SELECT 1 FROM highpass_v3.exchange_sessions s WHERE s.session_id=exchange_resource_scopes.session_id));
CREATE FUNCTION highpass_v3.pending_directory_caller() RETURNS boolean
 LANGUAGE sql STABLE SECURITY INVOKER SET search_path=pg_catalog AS $$
 SELECT EXISTS(SELECT 1 FROM highpass_v3.principal_bindings p
  WHERE p.actor_id=nullif(current_setting('app.actor_id',true),'')::uuid
   AND p.tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid
   AND p.hospital_id=nullif(current_setting('app.hospital_id',true),'')::uuid
   AND p.status='ACTIVE'
   AND p.role IN ('PATIENT','DOCTOR','HOSPITAL_ADMIN') AND 'consent:write'=ANY(p.scopes))
$$;
CREATE POLICY pending_directory_hospital ON highpass_v3.hospitals FOR SELECT TO hp_v3_pending_policy USING
 (hospital_id=nullif(current_setting('app.pending_target_hospital',true),'')::uuid AND highpass_v3.pending_directory_caller());
CREATE POLICY pending_directory_tenant ON highpass_v3.tenants FOR SELECT TO hp_v3_pending_policy USING
 (tenant_id=nullif(current_setting('app.pending_target_tenant',true),'')::uuid AND highpass_v3.pending_directory_caller());
CREATE POLICY pending_directory_hospital_lock ON highpass_v3.hospitals FOR UPDATE TO hp_v3_pending_policy USING
 (hospital_id=nullif(current_setting('app.pending_target_hospital',true),'')::uuid AND highpass_v3.pending_directory_caller()) WITH CHECK(false);
CREATE POLICY pending_directory_tenant_lock ON highpass_v3.tenants FOR UPDATE TO hp_v3_pending_policy USING
 (tenant_id=nullif(current_setting('app.pending_target_tenant',true),'')::uuid AND highpass_v3.pending_directory_caller()) WITH CHECK(false);
REVOKE ALL ON FUNCTION highpass_v3.pending_directory_caller() FROM PUBLIC;
-- Directory settings select NONPATIENT registry metadata only; service sets them
-- from a locked source Session. They are never approval/membership authority.
