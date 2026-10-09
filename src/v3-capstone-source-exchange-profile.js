/** Source REQUESTED Session prerequisite only; no consent, Grant or clinical access. */
const tables=Object.freeze(['exchange_sessions','exchange_creation_context','exchange_session_participants',
 'exchange_resource_scopes','exchange_write_results','exchange_audit_outbox']);
export function buildCapstoneSourceExchangeRehearsalSql({targetDatabase}={}){
 if(!['highpass_v3_capstone','highpass_v3_capstone_rehearsal'].includes(targetDatabase))throw Error('V3_EXCHANGE_PROFILE_TARGET_INVALID');
 const list=tables.map(name=>"'"+name+"'").join(',');
 return `BEGIN;
 SET LOCAL statement_timeout='3000ms';SET LOCAL lock_timeout='1000ms';
 DO $$ BEGIN
 IF current_database()<>'${targetDatabase}' OR NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname=current_user AND rolsuper)
 THEN RAISE EXCEPTION 'V3_EXCHANGE_OPERATOR_REQUIRED'; END IF;
 PERFORM pg_advisory_xact_lock(194716033);
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='hp_v3_app' AND rolcanlogin AND rolinherit
 AND NOT rolsuper AND NOT rolbypassrls AND NOT rolcreatedb AND NOT rolcreaterole AND NOT rolreplication)
 OR NOT pg_has_role('hp_v3_app','hp_v3_clinical_policy','MEMBER')
 OR pg_has_role('hp_v3_app','hp_v3_schema_owner','MEMBER')
 OR has_schema_privilege('hp_v3_app','highpass_v3','CREATE')
 OR EXISTS(SELECT 1 FROM pg_auth_members m JOIN pg_roles member ON member.oid=m.member JOIN pg_roles granted ON granted.oid=m.roleid
 WHERE member.rolname='hp_v3_app' AND granted.rolname<>'hp_v3_clinical_policy')
 THEN RAISE EXCEPTION 'V3_EXCHANGE_SAFE_ROLE_REQUIRED'; END IF;
 IF (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace JOIN pg_roles r ON r.oid=p.proowner
 WHERE n.nspname='highpass_v3' AND p.proname IN ('exchange_creator','exchange_canceller','exchange_expirer','valid_exchange_series','valid_exchange_actions')
 AND NOT p.prosecdef AND r.rolname='hp_v3_schema_owner')<>5
 THEN RAISE EXCEPTION 'V3_EXCHANGE_INVOKER_PREDICATES_REQUIRED'; END IF;
 IF EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='highpass_v3'
 AND p.proname IN ('exchange_creator','exchange_canceller','exchange_expirer','valid_exchange_series','valid_exchange_actions')
 AND has_function_privilege('hp_v3_app',p.oid,'EXECUTE'))
 THEN RAISE EXCEPTION 'V3_EXCHANGE_PRISTINE_FUNCTION_GRANTS_REQUIRED'; END IF;
 IF (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_roles r ON r.oid=c.relowner
 WHERE n.nspname='highpass_v3' AND c.relname IN (${list}) AND c.relkind='r'
 AND c.relrowsecurity AND c.relforcerowsecurity AND r.rolname='hp_v3_schema_owner')<>6
 OR EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='highpass_v3'
 AND c.relname IN (${list}) AND (has_table_privilege('hp_v3_app',c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
 OR has_any_column_privilege('hp_v3_app',c.oid,'SELECT,INSERT,UPDATE,REFERENCES')))
 THEN RAISE EXCEPTION 'V3_EXCHANGE_PRISTINE_FORCED_RLS_REQUIRED'; END IF;
 IF (SELECT count(*) FROM highpass_v3.principal_bindings)<>6
 OR NOT EXISTS(SELECT 1 FROM highpass_v3.principal_bindings WHERE actor_id='a3000000-1000-4000-8000-000000000001'
 AND tenant_id='a1000000-1000-4000-8000-000000000001' AND hospital_id='a2000000-1000-4000-8000-000000000001'
 AND role='HOSPITAL_ADMIN' AND status='ACTIVE' AND scopes=ARRAY['mapping:read','mapping:write'])
 THEN RAISE EXCEPTION 'V3_EXCHANGE_SOURCE_BASELINE_REQUIRED'; END IF;
 END $$;
 GRANT SELECT,INSERT ON ${tables.map(name=>'highpass_v3.'+name).join(',')} TO hp_v3_app;
 -- FOR SHARE only; existing WITH CHECK(false) forbids actual Session mutation.
 GRANT UPDATE(session_id) ON highpass_v3.exchange_sessions TO hp_v3_app;
 -- Existing restrictive audit policy plans this proof query even for CREATE/READ.
 GRANT SELECT(event_id,session_id,actor_id,to_version) ON highpass_v3.exchange_state_events TO hp_v3_app;
 GRANT EXECUTE ON FUNCTION highpass_v3.exchange_creator(uuid,uuid,uuid,uuid,text),
 -- Existing Session SELECT RLS also invokes this read predicate. No cancel table/state grants.
 highpass_v3.exchange_canceller(uuid,uuid,uuid,uuid,text),
 highpass_v3.exchange_expirer(uuid,uuid),
 highpass_v3.valid_exchange_series(text[]),highpass_v3.valid_exchange_actions(text[]) TO hp_v3_app;
 UPDATE highpass_v3.principal_bindings SET scopes=ARRAY['mapping:read','mapping:write','exchange:create','exchange:read']
 WHERE actor_id='a3000000-1000-4000-8000-000000000001';
 SET LOCAL ROLE hp_v3_app;
 SELECT json_build_object('profilePrivileges',
 ${tables.map(name=>`has_table_privilege(current_user,'highpass_v3.${name}','SELECT') AND has_table_privilege(current_user,'highpass_v3.${name}','INSERT')`).join(' AND ')}
 AND has_column_privilege(current_user,'highpass_v3.exchange_sessions','session_id','UPDATE'),
 'destructiveDenied',${tables.map(name=>`NOT has_table_privilege(current_user,'highpass_v3.${name}','DELETE,TRUNCATE')`).join(' AND ')}
 AND NOT has_column_privilege(current_user,'highpass_v3.exchange_sessions','state','UPDATE'),
 'consentDenied',NOT has_table_privilege(current_user,'highpass_v3.consent_content_versions','SELECT,INSERT,UPDATE,DELETE'),
 'preauthSeparation',NOT has_table_privilege(current_user,'highpass_v3.preauth_security_events','SELECT,INSERT'),
 'unboundSessionVisibility',(SELECT count(*)=0 FROM highpass_v3.exchange_sessions));
 RESET ROLE;
 SELECT json_build_object('sourceOnlyScopes',
 (SELECT count(*)=1 FROM highpass_v3.principal_bindings WHERE 'exchange:create'=ANY(scopes) OR 'exchange:read'=ANY(scopes)),
 'sourceExactScopes',EXISTS(SELECT 1 FROM highpass_v3.principal_bindings WHERE actor_id='a3000000-1000-4000-8000-000000000001'
 AND scopes=ARRAY['mapping:read','mapping:write','exchange:create','exchange:read']));
 ROLLBACK;`;
}
/** Explicit operator activation; caller must first stage version2 authority separately. */
export function buildCapstoneSourceExchangeActivationSql(options){
 const sql=buildCapstoneSourceExchangeRehearsalSql(options);
 // Fail in-transaction rather than commit a broadened or partial source directory.
 const assertion=`DO $$ BEGIN
 IF (SELECT count(*) FROM highpass_v3.principal_bindings WHERE 'exchange:create'=ANY(scopes) OR 'exchange:read'=ANY(scopes))<>1
 OR NOT EXISTS(SELECT 1 FROM highpass_v3.principal_bindings WHERE actor_id='a3000000-1000-4000-8000-000000000001'
 AND scopes=ARRAY['mapping:read','mapping:write','exchange:create','exchange:read'])
 THEN RAISE EXCEPTION 'V3_EXCHANGE_ACTIVATION_SCOPE_MISMATCH'; END IF;
 END $$;COMMIT;`;
 return sql.slice(0,-'ROLLBACK;'.length)+assertion;
}
/** Fix an already-applied source profile's restrictive-audit read dependency only. */
export function buildCapstoneSourceExchangeAuditDependencySql({targetDatabase,mode='REHEARSAL'}={}){
 if(!['highpass_v3_capstone','highpass_v3_capstone_rehearsal'].includes(targetDatabase)||!['REHEARSAL','ACTIVATE'].includes(mode))throw Error('V3_EXCHANGE_PROFILE_TARGET_INVALID');
 return `BEGIN;SET LOCAL statement_timeout='3000ms';SET LOCAL lock_timeout='1000ms';
 DO $$ BEGIN
 IF current_database()<>'${targetDatabase}' OR NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname=current_user AND rolsuper)
 THEN RAISE EXCEPTION 'V3_EXCHANGE_OPERATOR_REQUIRED'; END IF;
 PERFORM pg_advisory_xact_lock(194716033);
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='hp_v3_app' AND rolcanlogin AND NOT rolsuper AND NOT rolbypassrls
 AND NOT rolcreatedb AND NOT rolcreaterole AND NOT rolreplication)
 OR pg_has_role('hp_v3_app','hp_v3_schema_owner','MEMBER')
 OR NOT has_table_privilege('hp_v3_app','highpass_v3.exchange_audit_outbox','INSERT')
 OR has_any_column_privilege('hp_v3_app','highpass_v3.exchange_state_events','INSERT,UPDATE,REFERENCES')
 OR has_function_privilege('hp_v3_app','highpass_v3.exchange_expirer(uuid,uuid)','EXECUTE')
 OR EXISTS(SELECT 1 FROM pg_attribute WHERE attrelid='highpass_v3.exchange_state_events'::regclass AND attnum>0 AND NOT attisdropped
 AND attname NOT IN ('event_id','session_id','actor_id','to_version') AND has_column_privilege('hp_v3_app',attrelid,attname,'SELECT'))
 OR has_table_privilege('hp_v3_app','highpass_v3.exchange_state_events','INSERT,UPDATE,DELETE,TRUNCATE,TRIGGER')
 OR NOT EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_roles r ON r.oid=c.relowner
 WHERE n.nspname='highpass_v3' AND c.relname='exchange_state_events' AND c.relrowsecurity AND c.relforcerowsecurity
 AND r.rolname='hp_v3_schema_owner')
 OR NOT EXISTS(SELECT 1 FROM highpass_v3.principal_bindings WHERE actor_id='a3000000-1000-4000-8000-000000000001'
 AND scopes=ARRAY['mapping:read','mapping:write','exchange:create','exchange:read'] AND status='ACTIVE')
 THEN RAISE EXCEPTION 'V3_EXCHANGE_AUDIT_DEPENDENCY_BASELINE_REQUIRED'; END IF;
 END $$;
 GRANT SELECT(event_id,session_id,actor_id,to_version) ON highpass_v3.exchange_state_events TO hp_v3_app;
 -- Expiry read policy shares this predicate; no expiry-policy role or state write.
 GRANT EXECUTE ON FUNCTION highpass_v3.exchange_expirer(uuid,uuid) TO hp_v3_app;
 SET LOCAL ROLE hp_v3_app;
 SELECT json_build_object('proofColumnsReadable',has_column_privilege(current_user,'highpass_v3.exchange_state_events','event_id','SELECT')
 AND has_column_privilege(current_user,'highpass_v3.exchange_state_events','session_id','SELECT')
 AND has_column_privilege(current_user,'highpass_v3.exchange_state_events','actor_id','SELECT')
 AND has_column_privilege(current_user,'highpass_v3.exchange_state_events','to_version','SELECT'),
 'eventMutationDenied',NOT has_table_privilege(current_user,'highpass_v3.exchange_state_events','INSERT,UPDATE,DELETE,TRUNCATE'),
 'unboundProofVisibility',(SELECT count(event_id)=0 FROM highpass_v3.exchange_state_events),
 'expiryPredicateReadable',has_function_privilege(current_user,'highpass_v3.exchange_expirer(uuid,uuid)','EXECUTE'));
 RESET ROLE;${mode==='ACTIVATE'?'COMMIT;':'ROLLBACK;'}`;
}
