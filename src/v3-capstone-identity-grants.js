/** Fixed Identity-only deployment profile. No credentials, enrollment or activation. */
export const capstoneIdentityLoginRoles=Object.freeze(['hp_v3_app','hp_v3_identity_preauth_writer','hp_v3_identity_preauth_reader']);
export function buildCapstoneIdentityGrantsSql({targetDatabase}={}){
 if(!['highpass_v3_capstone','highpass_v3_capstone_rehearsal'].includes(targetDatabase))throw Error('V3_GRANT_TARGET_INVALID');
 const names=capstoneIdentityLoginRoles.map(role=>`'${role}'`).join(',');
 return `BEGIN;
 SET LOCAL statement_timeout='3000ms';SET LOCAL lock_timeout='1000ms';
 DO $$ DECLARE item record; BEGIN
 IF current_database()<>'${targetDatabase}' OR NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname=current_user AND rolsuper)
 THEN RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='V3_GRANT_ADMIN_TARGET_REQUIRED'; END IF;
 PERFORM pg_advisory_xact_lock(194716031);
 IF (SELECT count(*) FROM pg_roles WHERE rolname IN (${names}) AND rolcanlogin AND NOT rolsuper AND NOT rolbypassrls
 AND NOT rolcreatedb AND NOT rolcreaterole AND NOT rolreplication AND rolinherit)<>3
 THEN RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='V3_GRANT_SAFE_LOGINS_REQUIRED'; END IF;
 FOR item IN SELECT oid,rolname FROM pg_roles WHERE rolname IN (${names}) LOOP
 IF EXISTS(SELECT 1 FROM pg_auth_members WHERE member=item.oid)
 OR has_schema_privilege(item.oid,'highpass_v3','USAGE,CREATE')
 OR EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='highpass_v3'
 AND c.relkind IN ('r','p') AND (c.relowner=item.oid OR has_table_privilege(item.oid,c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
 OR has_any_column_privilege(item.oid,c.oid,'SELECT,INSERT,UPDATE,REFERENCES')))
 OR EXISTS(SELECT 1 FROM pg_namespace WHERE nspowner=item.oid)
 OR EXISTS(SELECT 1 FROM pg_class WHERE relowner=item.oid)
 OR EXISTS(SELECT 1 FROM pg_proc WHERE proowner=item.oid)
 THEN RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='V3_GRANT_ROLE_NOT_PRISTINE'; END IF;
 END LOOP;
 IF NOT EXISTS(SELECT 1 FROM pg_namespace n JOIN pg_roles r ON r.oid=n.nspowner
 WHERE n.nspname='highpass_v3' AND r.rolname='hp_v3_schema_owner' AND NOT r.rolcanlogin AND NOT r.rolsuper AND NOT r.rolbypassrls)
 THEN RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='V3_GRANT_OWNER_REQUIRED'; END IF;
 END $$;
 GRANT CONNECT ON DATABASE ${targetDatabase} TO hp_v3_app,hp_v3_identity_preauth_writer,hp_v3_identity_preauth_reader;
 GRANT hp_v3_clinical_policy TO hp_v3_app;
 GRANT hp_v3_preauth_publisher_policy TO hp_v3_identity_preauth_writer;
 GRANT hp_v3_preauth_reader_policy TO hp_v3_identity_preauth_reader;
 GRANT USAGE ON SCHEMA highpass_v3 TO hp_v3_app;
 -- Restrictive Identity policies invoke this exact clinical-context predicate.
 GRANT EXECUTE ON FUNCTION highpass_v3.clinical_principal_context(),highpass_v3.exchange_directory_caller() TO hp_v3_app;
 GRANT SELECT ON highpass_v3.tenants,highpass_v3.hospitals,highpass_v3.principal_bindings,
 highpass_v3.patient_refs,highpass_v3.patient_ref_registrations,highpass_v3.patient_mappings,
 highpass_v3.identity_write_results,highpass_v3.identity_audit_outbox,highpass_v3.identity_network_audit TO hp_v3_app;
 -- Lock-only columns: existing RLS WITH CHECK(false) still forbids directory mutation.
 GRANT UPDATE(status) ON highpass_v3.tenants,highpass_v3.hospitals,highpass_v3.principal_bindings TO hp_v3_app;
 GRANT UPDATE(patient_ref) ON highpass_v3.patient_refs TO hp_v3_app;
 GRANT UPDATE(version,updated_at,status,evidence_digest,verified_by,verified_at) ON highpass_v3.patient_mappings TO hp_v3_app;
 GRANT INSERT ON highpass_v3.patient_refs,highpass_v3.patient_ref_registrations,highpass_v3.patient_mappings,
 highpass_v3.identity_write_results,highpass_v3.identity_audit_outbox TO hp_v3_app;
 GRANT INSERT(event_id,tenant_id,hospital_id,actor_id,audit_session_id,trace_id,source_ip,ingress_mode,proxy_certificate_sha256,observed_at)
 ON highpass_v3.identity_network_audit TO hp_v3_app;
 COMMIT;`;
}
