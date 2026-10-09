-- Patient-only internal READ/LOCK projection. No ceremony INSERT, runtime grants
-- or public read route; private synthetic reauth and audit remain service gates.
CREATE FUNCTION highpass_v3.approval_patient_context(tenant uuid,hospital uuid,patient uuid) RETURNS boolean
 LANGUAGE sql STABLE SECURITY INVOKER SET search_path=pg_catalog AS $$
 SELECT tenant=nullif(current_setting('app.tenant_id',true),'')::uuid
 AND hospital=nullif(current_setting('app.hospital_id',true),'')::uuid
 AND EXISTS(SELECT 1 FROM highpass_v3.principal_bindings p
  JOIN highpass_v3.tenants t ON t.tenant_id=p.tenant_id
  JOIN highpass_v3.hospitals h ON h.tenant_id=p.tenant_id AND h.hospital_id=p.hospital_id
  WHERE p.actor_id=nullif(current_setting('app.actor_id',true),'')::uuid
   AND p.tenant_id=tenant AND p.hospital_id=hospital AND p.patient_ref=patient
   AND p.role='PATIENT' AND 'consent:approve'=ANY(p.scopes)
   AND p.status='ACTIVE' AND t.status='ACTIVE' AND h.status='ACTIVE')
$$;
CREATE POLICY approval_preparation_read ON highpass_v3.consent_preparation_requests FOR SELECT TO hp_v3_consent_approval_policy USING
 (highpass_v3.approval_patient_context(owner_tenant_id,source_hospital_id,patient_ref));
CREATE POLICY approval_scope_read ON highpass_v3.consent_preparation_scopes FOR SELECT TO hp_v3_consent_approval_policy USING
 (EXISTS(SELECT 1 FROM highpass_v3.consent_preparation_requests p WHERE p.preparation_id=consent_preparation_scopes.preparation_id));
CREATE POLICY approval_action_read ON highpass_v3.consent_preparation_actions FOR SELECT TO hp_v3_consent_approval_policy USING
 (EXISTS(SELECT 1 FROM highpass_v3.consent_preparation_requests p WHERE p.preparation_id=consent_preparation_actions.preparation_id));
-- Root is the immutable preparation with direct patient predicate. It does not
-- read Session/participants, avoiding parent-child policy recursion.
CREATE POLICY approval_session_read ON highpass_v3.exchange_sessions FOR SELECT TO hp_v3_consent_approval_policy USING
 (EXISTS(SELECT 1 FROM highpass_v3.consent_preparation_requests p WHERE p.session_id=exchange_sessions.session_id
  AND p.patient_ref=exchange_sessions.patient_ref AND p.owner_tenant_id=exchange_sessions.owner_tenant_id
  AND p.source_hospital_id=exchange_sessions.source_hospital_id));
CREATE POLICY approval_session_lock ON highpass_v3.exchange_sessions FOR UPDATE TO hp_v3_consent_approval_policy USING
 (EXISTS(SELECT 1 FROM highpass_v3.consent_preparation_requests p WHERE p.session_id=exchange_sessions.session_id
  AND p.patient_ref=exchange_sessions.patient_ref AND p.owner_tenant_id=exchange_sessions.owner_tenant_id
  AND p.source_hospital_id=exchange_sessions.source_hospital_id)) WITH CHECK(false);
CREATE POLICY approval_ref_read ON highpass_v3.patient_refs FOR SELECT TO hp_v3_consent_approval_policy USING
 (deleted_at IS NULL AND highpass_v3.approval_patient_context(owner_tenant_id,owner_hospital_id,patient_ref));
CREATE POLICY approval_ref_lock ON highpass_v3.patient_refs FOR UPDATE TO hp_v3_consent_approval_policy USING
 (deleted_at IS NULL AND highpass_v3.approval_patient_context(owner_tenant_id,owner_hospital_id,patient_ref)) WITH CHECK(false);
CREATE POLICY approval_source_participant ON highpass_v3.exchange_session_participants FOR SELECT TO hp_v3_consent_approval_policy USING
 (participant_role='SOURCE' AND status='ACTIVE' AND highpass_v3.approval_patient_context(tenant_id,hospital_id,patient_ref)
  AND EXISTS(SELECT 1 FROM highpass_v3.consent_preparation_requests p WHERE p.session_id=exchange_session_participants.session_id
   AND p.patient_ref=exchange_session_participants.patient_ref));
CREATE FUNCTION highpass_v3.approval_directory_caller() RETURNS boolean
 LANGUAGE sql STABLE SECURITY INVOKER SET search_path=pg_catalog AS $$
 SELECT EXISTS(SELECT 1 FROM highpass_v3.principal_bindings p
  WHERE p.actor_id=nullif(current_setting('app.actor_id',true),'')::uuid
   AND p.tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid
   AND p.hospital_id=nullif(current_setting('app.hospital_id',true),'')::uuid
   AND p.status='ACTIVE' AND p.role='PATIENT' AND p.patient_ref IS NOT NULL AND 'consent:approve'=ANY(p.scopes))
$$;
CREATE POLICY approval_directory_hospital ON highpass_v3.hospitals FOR SELECT TO hp_v3_consent_approval_policy USING
 (hospital_id=nullif(current_setting('app.approval_target_hospital',true),'')::uuid AND highpass_v3.approval_directory_caller());
CREATE POLICY approval_directory_tenant ON highpass_v3.tenants FOR SELECT TO hp_v3_consent_approval_policy USING
 (tenant_id=nullif(current_setting('app.approval_target_tenant',true),'')::uuid AND highpass_v3.approval_directory_caller());
CREATE POLICY approval_directory_hospital_lock ON highpass_v3.hospitals FOR UPDATE TO hp_v3_consent_approval_policy USING
 (hospital_id=nullif(current_setting('app.approval_target_hospital',true),'')::uuid AND highpass_v3.approval_directory_caller()) WITH CHECK(false);
CREATE POLICY approval_directory_tenant_lock ON highpass_v3.tenants FOR UPDATE TO hp_v3_consent_approval_policy USING
 (tenant_id=nullif(current_setting('app.approval_target_tenant',true),'')::uuid AND highpass_v3.approval_directory_caller()) WITH CHECK(false);
REVOKE ALL ON FUNCTION highpass_v3.approval_patient_context(uuid,uuid,uuid),highpass_v3.approval_directory_caller() FROM PUBLIC;
-- Settings choose only registry metadata, not identity/approval/Grant authority.
-- Helper must bind them from an immutable own-patient preparation and locked parent.
-- Historical immutable preparation is readable internally; current eligibility
-- (parent state/version/expiry, ref and target) must be checked before any action.
