-- Metadata only, no patient records, credentials, migration or enrollment.
BEGIN READ ONLY;
SET LOCAL statement_timeout = '3000ms';
SET LOCAL lock_timeout = '1000ms';
SELECT json_build_object(
 'transactionReadOnly',current_setting('transaction_read_only'),
 'database',current_database(),
 'inspectionRole',current_user,
 'serverMajor',current_setting('server_version_num')::int / 10000,
 'targetDatabasePresent',EXISTS(SELECT 1 FROM pg_database WHERE datname='highpass_v3_capstone'),
 'v3SchemaPresent',EXISTS(SELECT 1 FROM pg_namespace WHERE nspname='highpass_v3'),
 'identityTables',COALESCE((SELECT json_agg(json_build_object(
  'name',c.relname,'rls',c.relrowsecurity,'forceRls',c.relforcerowsecurity) ORDER BY c.relname)
  FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='highpass_v3' AND c.relkind='r'
   AND c.relname IN ('tenants','hospitals','principal_bindings','patient_refs','patient_ref_registrations',
    'patient_mappings','identity_write_results','identity_audit_outbox','identity_network_audit','preauth_security_events')),'[]'::json),
 'v3TableCount',(SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
   WHERE n.nspname='highpass_v3' AND c.relkind='r'),
 'roles',COALESCE((SELECT json_agg(json_build_object(
  'name',r.rolname,'login',r.rolcanlogin,'superuser',r.rolsuper,'bypassRls',r.rolbypassrls,
  'createRole',r.rolcreaterole,'createDb',r.rolcreatedb,'replication',r.rolreplication) ORDER BY r.rolname)
  FROM pg_roles r WHERE r.rolname IN ('hipass_app','hp_v3_app','hp_v3_owner','hp_v3_clinical_policy','hp_v3_pending_policy',
   'hp_v3_preauth_publisher_policy','hp_v3_preauth_reader_policy',
   'hp_v3_identity_preauth_writer','hp_v3_identity_preauth_reader','hp_v3_schema_owner',
   'hp_v3_expiry_policy','hp_v3_consent_approval_policy','hp_v3_consent_withdraw_policy','hp_v3_consent_expiry_policy')),'[]'::json)
);
ROLLBACK;
