-- Dedicated source-scoped maintenance enrollment. No expiry transition yet.
ALTER TABLE highpass_v3.principal_bindings DROP CONSTRAINT principal_bindings_role_check,
 ADD COLUMN service_purpose text,
 ADD CONSTRAINT principal_role_valid CHECK(role IN ('PATIENT','DOCTOR','HOSPITAL_ADMIN','SECURITY_ADMIN','PLATFORM_ADMIN','INTERNAL_SERVICE')),
 ADD CONSTRAINT principal_service_purpose CHECK
 (CASE WHEN role='INTERNAL_SERVICE' THEN service_purpose IS NOT DISTINCT FROM 'SESSION_EXPIRY'
    AND patient_ref IS NULL AND scopes IS NOT DISTINCT FROM ARRAY['exchange:expire']::text[]
  ELSE service_purpose IS NULL AND array_position(scopes,'exchange:expire') IS NULL
    AND array_position(scopes,NULL) IS NULL END);

-- Prevent existing permissive clinical policies from being used by maintenance.
-- Registry health/principal-self tables are intentionally excluded from this guard.
CREATE FUNCTION highpass_v3.clinical_principal_context() RETURNS boolean
 LANGUAGE sql STABLE SECURITY INVOKER SET search_path=pg_catalog AS $$
 SELECT EXISTS(SELECT 1 FROM highpass_v3.principal_bindings p
  WHERE p.actor_id=nullif(current_setting('app.actor_id',true),'')::uuid
   AND p.tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid
   AND p.hospital_id=nullif(current_setting('app.hospital_id',true),'')::uuid
   AND p.status='ACTIVE' AND p.role<>'INTERNAL_SERVICE')
$$;
DO $$ DECLARE relation_name text;
BEGIN
 FOREACH relation_name IN ARRAY ARRAY['patient_refs','patient_mappings','identity_audit_outbox','identity_write_results',
  'patient_ref_registrations','exchange_session_participants','exchange_resource_scopes','exchange_write_results',
  'exchange_creation_context','exchange_cancel_results'] LOOP
  EXECUTE format('CREATE POLICY clinical_only_context ON highpass_v3.%I AS RESTRICTIVE FOR ALL USING (highpass_v3.clinical_principal_context()) WITH CHECK (highpass_v3.clinical_principal_context())',relation_name);
 END LOOP;
END $$;
REVOKE ALL ON FUNCTION highpass_v3.clinical_principal_context() FROM PUBLIC;
