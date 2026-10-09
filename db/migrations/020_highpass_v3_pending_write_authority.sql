-- Internal immutable preparation writes only. No approval/Grant/runtime enrollment.
CREATE FUNCTION highpass_v3.pending_actor_context(tenant uuid,hospital uuid,actor uuid) RETURNS boolean
 LANGUAGE sql STABLE SECURITY INVOKER SET search_path=pg_catalog AS $$
 SELECT tenant=nullif(current_setting('app.tenant_id',true),'')::uuid
 AND hospital=nullif(current_setting('app.hospital_id',true),'')::uuid
 AND actor=nullif(current_setting('app.actor_id',true),'')::uuid
 AND EXISTS(SELECT 1 FROM highpass_v3.principal_bindings p
  JOIN highpass_v3.tenants t ON t.tenant_id=p.tenant_id
  JOIN highpass_v3.hospitals h ON h.tenant_id=p.tenant_id AND h.hospital_id=p.hospital_id
  WHERE p.actor_id=actor AND p.tenant_id=tenant AND p.hospital_id=hospital
   AND p.status='ACTIVE' AND t.status='ACTIVE' AND h.status='ACTIVE'
   AND p.role IN ('PATIENT','DOCTOR','HOSPITAL_ADMIN') AND 'consent:write'=ANY(p.scopes))
$$;
CREATE POLICY pending_request_read ON highpass_v3.consent_preparation_requests FOR SELECT TO hp_v3_pending_policy USING
 (highpass_v3.pending_actor_context(owner_tenant_id,source_hospital_id,actor_id)
  AND EXISTS(SELECT 1 FROM highpass_v3.exchange_creation_context c WHERE c.session_id=consent_preparation_requests.session_id
   AND c.patient_ref=consent_preparation_requests.patient_ref));
CREATE POLICY pending_request_insert ON highpass_v3.consent_preparation_requests FOR INSERT TO hp_v3_pending_policy WITH CHECK
 (highpass_v3.pending_actor_context(owner_tenant_id,source_hospital_id,actor_id)
  AND state='PENDING' AND evidence_status='UNVERIFIED' AND created_at=statement_timestamp()
  AND valid_from>=clock_timestamp() AND valid_until>clock_timestamp()
  AND EXISTS(SELECT 1 FROM highpass_v3.exchange_sessions s WHERE s.session_id=consent_preparation_requests.session_id
   AND s.version=session_version AND s.state='REQUESTED' AND s.purpose=consent_preparation_requests.purpose
   AND s.valid_from<=consent_preparation_requests.valid_from AND s.valid_until>=consent_preparation_requests.valid_until));
CREATE POLICY pending_scope_read ON highpass_v3.consent_preparation_scopes FOR SELECT TO hp_v3_pending_policy USING
 (EXISTS(SELECT 1 FROM highpass_v3.consent_preparation_requests r WHERE r.preparation_id=consent_preparation_scopes.preparation_id));
CREATE POLICY pending_scope_insert ON highpass_v3.consent_preparation_scopes FOR INSERT TO hp_v3_pending_policy WITH CHECK
 (EXISTS(SELECT 1 FROM highpass_v3.consent_preparation_requests r WHERE r.preparation_id=consent_preparation_scopes.preparation_id));
CREATE POLICY pending_action_read ON highpass_v3.consent_preparation_actions FOR SELECT TO hp_v3_pending_policy USING
 (EXISTS(SELECT 1 FROM highpass_v3.consent_preparation_requests r WHERE r.preparation_id=consent_preparation_actions.preparation_id));
CREATE POLICY pending_action_insert ON highpass_v3.consent_preparation_actions FOR INSERT TO hp_v3_pending_policy WITH CHECK
 (EXISTS(SELECT 1 FROM highpass_v3.consent_preparation_requests r WHERE r.preparation_id=consent_preparation_actions.preparation_id));
CREATE POLICY pending_result_read ON highpass_v3.consent_preparation_results FOR SELECT TO hp_v3_pending_policy USING
 (highpass_v3.pending_actor_context(tenant_id,hospital_id,actor_id));
CREATE POLICY pending_result_insert ON highpass_v3.consent_preparation_results FOR INSERT TO hp_v3_pending_policy WITH CHECK
 (highpass_v3.pending_actor_context(tenant_id,hospital_id,actor_id)
  AND EXISTS(SELECT 1 FROM highpass_v3.consent_preparation_requests r WHERE r.preparation_id=consent_preparation_results.preparation_id
   AND r.session_id=consent_preparation_results.session_id AND r.session_version=response_session_version
   AND r.created_at=response_created_at AND r.actor_id=consent_preparation_results.actor_id
   AND r.owner_tenant_id=tenant_id AND r.source_hospital_id=hospital_id));
CREATE POLICY pending_audit_read ON highpass_v3.consent_preparation_audit_outbox FOR SELECT TO hp_v3_pending_policy USING
 (highpass_v3.pending_actor_context(tenant_id,hospital_id,actor_id));
CREATE POLICY pending_audit_insert ON highpass_v3.consent_preparation_audit_outbox FOR INSERT TO hp_v3_pending_policy WITH CHECK
 (highpass_v3.pending_actor_context(tenant_id,hospital_id,actor_id)
  AND ((action='PREPARATION_DENIED' AND result='DENY' AND preparation_id IS NULL AND session_id IS NULL AND session_version IS NULL)
   OR (action IN ('PREPARATION_CREATED','PREPARATION_REPLAYED') AND result='ALLOW' AND session_version IS NOT NULL
    AND EXISTS(SELECT 1 FROM highpass_v3.consent_preparation_requests r JOIN highpass_v3.exchange_sessions s ON s.session_id=r.session_id
     WHERE r.preparation_id=consent_preparation_audit_outbox.preparation_id AND r.session_id=consent_preparation_audit_outbox.session_id
      AND r.session_version=consent_preparation_audit_outbox.session_version AND r.actor_id=consent_preparation_audit_outbox.actor_id
      AND r.valid_until>clock_timestamp() AND s.valid_until>clock_timestamp() AND s.state='REQUESTED' AND s.version=r.session_version))));
REVOKE ALL ON FUNCTION highpass_v3.pending_actor_context(uuid,uuid,uuid) FROM PUBLIC;
-- No UPDATE/DELETE policies. Immutable triggers/deferred assembly and composite
-- FKs remain mandatory even for a credential with granted INSERT columns.
