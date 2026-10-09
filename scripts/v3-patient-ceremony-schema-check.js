import {spawnSync} from 'node:child_process';
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {randomUUID,randomBytes,createHash} from 'node:crypto';
import path from 'node:path';
import {startOwnedPostgresFixture,removeOwnedPostgresFixture,observeOwnedFixtureAbsence} from './test-support/owned-postgres-start.js';
import {checkPatientApprovalProjection} from './test-support/patient-approval-projection-fixture.js';

// Only an exact-name, owned disposable fixture with random loopback port. Never runtime DB.
const name=`hp-v3-ceremony-${randomUUID()}`,owner=randomUUID(),label='highpass.validation.ceremony-schema';
const migrationNames=['006_highpass_v3_identity.sql','007_highpass_v3_identity_transactions.sql',
 '008_highpass_v3_patient_ref_registration.sql','009_highpass_v3_identity_idempotency.sql','010_highpass_v3_mapping_review.sql',
 '011_highpass_v3_exchange_foundation.sql','012_highpass_v3_exchange_create_authority.sql','013_highpass_v3_exchange_read_audit.sql',
 '014_highpass_v3_exchange_requested_actions.sql','015_highpass_v3_exchange_cancel_events.sql','016_highpass_v3_expiry_principal.sql',
 '017_highpass_v3_exchange_expiry_events.sql','018_highpass_v3_pending_preparation_foundation.sql','019_highpass_v3_pending_source_projection.sql',
 '020_highpass_v3_pending_write_authority.sql','021_highpass_v3_pending_network_audit.sql','022_highpass_v3_preauth_security_events.sql',
 '023_highpass_v3_patient_ceremony_foundation.sql','024_highpass_v3_patient_approval_projection.sql'];
const sources=[...migrationNames.map(f=>`db/migrations/${f}`),'scripts/v3-patient-ceremony-schema-check.js',
 'docs/architecture/highpass-v3-patient-ceremony-persistence-adr.md','scripts/test-support/owned-postgres-start.js',
 'scripts/test-support/patient-approval-projection-fixture.js','src/v3-patient-approval-projection.js',
 'src/v3-principal-registry.js','src/v3-tenant-transaction.js','src/v3-exchange-session-contract.js','src/auth.js',
 'test/v3-patient-approval-projection.test.js'];
sources.push('db/migrations/025_highpass_v3_patient_challenge_issuance.sql','src/v3-patient-challenge-issuance.js',
 'scripts/test-support/patient-challenge-issuance-fixture.js','test/v3-patient-challenge-issuance.test.js',
 'docs/api/highpass-v3-patient-challenge-issuance-contract.md');
sources.push('db/migrations/026_highpass_v3_patient_consent_decisions.sql','src/v3-patient-consent-decision-service.js',
 'src/v3-patient-consent-command.js','scripts/test-support/patient-consent-decision-fixture.js',
 'docs/api/highpass-v3-patient-consent-decision-persistence-contract.md','test/v3-patient-consent-decision-service.test.js',
 'scripts/test-support/patient-decision-deadline-fixture.js','scripts/test-support/patient-decision-mutation-fixture.js',
 'scripts/test-support/patient-decision-parent-fixture.js','scripts/test-support/patient-decision-cancel-service-fixture.js',
 'src/v3-exchange-cancel-service.js','src/v3-exchange-cancel-contract.js','src/v3-exchange-audit.js',
 'scripts/test-support/patient-decision-isolation-fixture.js','scripts/test-support/patient-multisession-fixture.js',
 'scripts/test-support/patient-expiry-contention-fixture.js','src/v3-exchange-expiry-service.js','src/v3-exchange-expiry-contract.js',
 'scripts/test-support/patient-create-pending-fixture.js','src/v3-exchange-session-service.js','src/v3-pending-service.js',
 'src/v3-pending-projection.js','src/v3-consent-pending-contract.js','src/v3-pending-audit.js',
 'src/v3-pending-network-audit.js','src/v3-pending-network-context.js');
sources.push('db/migrations/027_highpass_v3_consent_lifecycle.sql','scripts/test-support/consent-lifecycle-schema-fixture.js',
 'src/v3-patient-consent-withdraw-command.js','src/v3-patient-consent-withdraw-projection.js');
sources.push('db/migrations/028_highpass_v3_withdrawal_outcomes.sql','src/v3-patient-consent-withdraw-service.js',
 'scripts/test-support/consent-withdraw-service-fixture.js','scripts/test-support/withdrawal-isolation-fixture.js',
 'scripts/test-support/withdrawal-institution-races-fixture.js','scripts/test-support/withdrawal-expiry-contention-fixture.js','test/v3-patient-consent-withdraw-service.test.js',
 'test/v3-patient-consent-withdraw-command.test.js','test/v3-patient-consent-withdraw-projection.test.js');
sources.push('src/v3-consent-expiry-command.js','test/v3-consent-expiry-command.test.js','scripts/test-support/consent-expiry-principal-fixture.js');
sources.push('src/v3-consent-expiry-transactions.js','test/v3-consent-expiry-transactions.test.js');
sources.push('db/migrations/029_highpass_v3_consent_expiry_batches.sql','src/v3-consent-expiry-service.js',
 'test/v3-consent-expiry-service.test.js','scripts/test-support/consent-expiry-service-fixture.js',
 'docs/api/highpass-v3-consent-expiry-service-contract.md');
const hash=()=>Object.fromEntries(sources.map(f=>[f,createHash('sha256').update(readFileSync(f)).digest('hex')]));
const initial=hash(),began=Date.now(),results=[];
const [ta,tb,ha,hb,doctor,patientActor,patient,session,event,audit,preparation,prepEvent,prepAudit]=Array.from({length:13},()=>randomUUID());
const uid='1.2.410.900.1',series='1.2.410.900.1.1',trace='synthetic_ceremony_schema_001';
const digest=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const scopeDigest=digest([{studyInstanceUid:uid,seriesInstanceUids:[series]}]);
const clause='합성 환경: 기관 간 식별 연결은 영상 공유와 별도 선택입니다.';
const clauseHash=createHash('sha256').update(clause,'utf8').digest('hex');
const fixturePassword=randomBytes(32).toString('hex');
const context=actor=>`SET LOCAL app.tenant_id='${ta}';SET LOCAL app.hospital_id='${ha}';SET LOCAL app.actor_id='${actor}';`;
let attempted=false,failed=false,summary,cleanup='NOT VERIFIED',startupObservation=null,cleanupObservations=[];
function docker(args,input,timeout=15000){return spawnSync('docker',args,{input,encoding:'utf8',timeout,windowsHide:true,maxBuffer:1024*1024});}
const fixtureDocker=(args,timeout)=>docker(args,undefined,timeout);
function sql(body){return docker(['exec','-i',name,'psql','-U','postgres','-d','postgres','-X','-qAt',
 '-v','ON_ERROR_STOP=1','-v','VERBOSITY=verbose'],`SET statement_timeout='5s';SET lock_timeout='3s';\n${body}`);}
function ok(test,body,expected=''){
 const r=sql(body),pass=r.status===0&&r.stdout.trim()===expected;
 results.push({name:test,result:pass?'PASS':'FAIL',exitCode:r.status});if(!pass)throw Error('SCHEMA_ASSERTION_FAILED');
}
function deny(test,body,state){
 const r=sql(body),observed=r.stderr.match(/ERROR:\s+([0-9A-Z]{5}):/)?.[1],pass=r.status===3&&observed===state;
 results.push({name:test,result:pass?'PASS':'FAIL',exitCode:r.status,sqlState:observed??null});if(!pass)throw Error('SCHEMA_ASSERTION_FAILED');
}
function assembly(id,{omitAudit=false,before='',nonce=randomBytes(32).toString('hex'),content,clauseDigest=clauseHash,
 actor=patientActor,sessionVersion=1,linkFrom='p.valid_from',linkUntil='p.valid_until',
 issued='statement_timestamp()',expires="statement_timestamp()+interval '2 minutes'",
 reauth="statement_timestamp()-interval '1 second'",age=300000,assurance='SIGNED_SYNTHETIC_REAUTH_ONLY',
 auditPatient=patient,auditTrace=trace,role=''}={}){
 const e=randomUUID(),a=randomUUID();
 const computed=`highpass_v3.patient_consent_content_digest(p.preparation_id,'synthetic-link-v1',decode('${clauseDigest}','hex'),
  'PATIENT_IDENTITY_LINK',${linkFrom},${linkUntil})`;
 return `BEGIN;${context(actor)}${role}${before}
 INSERT INTO highpass_v3.consent_patient_ceremonies(ceremony_id,preparation_id,session_id,session_version,patient_ref,
 owner_tenant_id,source_hospital_id,target_tenant_id,target_hospital_id,patient_actor_id,nonce_hash,content_digest,
 link_clause_version,link_clause_text,link_clause_digest,link_purpose,link_valid_from,link_valid_until,
 assurance_kind,reauthenticated_at,max_reauth_age_ms,issued_at,expires_at,creation_event_id,audit_session_id,trace_id)
 SELECT '${id}',p.preparation_id,p.session_id,${sessionVersion},p.patient_ref,p.owner_tenant_id,p.source_hospital_id,
 p.target_tenant_id,p.target_hospital_id,'${actor}',decode('${nonce}','hex'),${content??computed},
 'synthetic-link-v1','${clause}',decode('${clauseDigest}','hex'),'PATIENT_IDENTITY_LINK',${linkFrom},${linkUntil},
 '${assurance}',${reauth},${age},${issued},${expires},'${e}','${a}','${trace}'
 FROM highpass_v3.consent_preparation_requests p WHERE p.preparation_id='${preparation}';
 ${omitAudit?'':`INSERT INTO highpass_v3.consent_patient_ceremony_audit
 SELECT creation_event_id,ceremony_id,preparation_id,session_id,session_version,'${auditPatient}',owner_tenant_id,
 source_hospital_id,patient_actor_id,audit_session_id,'${auditTrace}','CEREMONY_CREATED','RECORDED','SYNTHETIC_CHALLENGE_ONLY',issued_at
 FROM highpass_v3.consent_patient_ceremonies WHERE ceremony_id='${id}';`}
 COMMIT;`;
}
try{
 const image=docker(['image','inspect','postgres:16-alpine','--format','{{.Id}}']);
 if(image.status!==0)throw Error('POSTGRES_IMAGE_UNAVAILABLE');
 attempted=true;
 startupObservation=startOwnedPostgresFixture({name,owner,label,password:fixturePassword,mode:'published',docker:fixtureDocker});
 if(!startupObservation.owned)throw Error('POSTGRES_START_UNAVAILABLE');
 const deadline=Date.now()+45000;let ready=false;
 while(Date.now()<deadline){
  if(docker(['exec',name,'pg_isready','-h','127.0.0.1','-U','postgres','-t','2'],undefined,4000).status===0){ready=true;break;}
  await new Promise(resolve=>setTimeout(resolve,500));
 }
 if(!ready)throw Error('POSTGRES_READINESS_UNAVAILABLE');
 const migrations=migrationNames.map(f=>readFileSync(`db/migrations/${f}`,'utf8')).join('\n');
 ok('006..024 transaction rollback removes schema and new role',`BEGIN;${migrations}ROLLBACK;
 SELECT count(*) FROM pg_namespace WHERE nspname='highpass_v3';
 SELECT count(*) FROM pg_roles WHERE rolname='hp_v3_consent_approval_policy';`,'0\n0');
 ok('006..024 apply only to owned disposable fixture',`BEGIN;${migrations}COMMIT;`);
 ok('approval capability is separate NOLOGIN and nonadmin',`SELECT NOT rolcanlogin AND NOT rolsuper AND NOT rolbypassrls
 AND NOT rolcreatedb AND NOT rolcreaterole
 AND NOT pg_has_role('hp_v3_consent_approval_policy','hp_v3_clinical_policy','MEMBER')
 AND NOT pg_has_role('hp_v3_consent_approval_policy','hp_v3_pending_policy','MEMBER')
 AND NOT pg_has_role('hp_v3_consent_approval_policy','hp_v3_expiry_policy','MEMBER')
 FROM pg_roles WHERE rolname='hp_v3_consent_approval_policy';`,'t');
 ok('two new tables force RLS without admission policies or raw nonce column',`SELECT count(*) FROM pg_class c
 JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='highpass_v3'
 AND c.relname IN ('consent_patient_ceremonies','consent_patient_ceremony_audit') AND c.relrowsecurity AND c.relforcerowsecurity;
 SELECT count(*) FROM pg_policy p JOIN pg_class c ON c.oid=p.polrelid WHERE c.relname LIKE 'consent_patient_ceremon%';
 SELECT count(*) FROM information_schema.columns WHERE table_schema='highpass_v3'
 AND table_name='consent_patient_ceremonies' AND column_name IN ('nonce','raw_nonce','token','secret');`,'2\n0\n0');
 ok('seed synthetic doctor preparation and separate patient principal',`
 INSERT INTO highpass_v3.tenants VALUES('${ta}','SYNTH-A','SYNTHETIC A','ACTIVE'),('${tb}','SYNTH-B','SYNTHETIC B','ACTIVE');
 INSERT INTO highpass_v3.hospitals(hospital_id,tenant_id,code) VALUES('${ha}','${ta}','A'),('${hb}','${tb}','B');
 INSERT INTO highpass_v3.patient_refs(patient_ref) VALUES('${patient}');
 INSERT INTO highpass_v3.principal_bindings(actor_id,tenant_id,hospital_id,role,scopes,patient_ref) VALUES
 ('${doctor}','${ta}','${ha}','HOSPITAL_ADMIN',ARRAY['exchange:create','consent:write'],NULL),
 ('${patientActor}','${ta}','${ha}','PATIENT',ARRAY['consent:approve'],'${patient}');
 UPDATE highpass_v3.patient_refs SET owner_tenant_id='${ta}',owner_hospital_id='${ha}',registered_by='${doctor}' WHERE patient_ref='${patient}';
 INSERT INTO highpass_v3.patient_ref_registrations SELECT patient_ref,owner_tenant_id,owner_hospital_id,registered_by FROM highpass_v3.patient_refs;
 BEGIN;${context(doctor)}
 INSERT INTO highpass_v3.exchange_sessions(session_id,patient_ref,owner_tenant_id,source_hospital_id,target_tenant_id,target_hospital_id,
 requester_id,purpose,initiation_type,valid_until,resource_snapshot_digest,resource_count,audit_session_id,trace_id,requested_actions)
 VALUES('${session}','${patient}','${ta}','${ha}','${tb}','${hb}','${doctor}','TREATMENT','PROVIDER_INITIATED',
 statement_timestamp()+interval '1 hour',decode('${scopeDigest}','hex'),1,'${audit}','${trace}',ARRAY['study:view']);
 INSERT INTO highpass_v3.exchange_audit_outbox(event_id,session_id,tenant_id,hospital_id,actor_id,audit_session_id,trace_id,action,result,reason_code,session_version)
 VALUES('${event}','${session}','${ta}','${ha}','${doctor}','${audit}','${trace}','SESSION_CREATED','ALLOW','SESSION_REQUESTED',1);
 INSERT INTO highpass_v3.exchange_creation_context VALUES('${session}','${patient}','${ta}','${ha}','${doctor}','PROVIDER_INITIATED',
 '${tb}','${hb}','${event}','${audit}','${trace}','SESSION_CREATED');
 INSERT INTO highpass_v3.exchange_session_participants VALUES('${session}','${patient}','${ta}','${ha}','SOURCE','ACTIVE'),
 ('${session}','${patient}','${tb}','${hb}','DESTINATION','INVITED');
 INSERT INTO highpass_v3.exchange_resource_scopes VALUES('${session}',1,'${uid}',false,ARRAY['${series}']);
 INSERT INTO highpass_v3.exchange_write_results VALUES('${ta}','${ha}','${doctor}','SESSION_CREATE',decode('${'11'.repeat(32)}','hex'),
 decode('${'12'.repeat(32)}','hex'),'${session}','REQUESTED',1,(SELECT created_at FROM highpass_v3.exchange_sessions WHERE session_id='${session}'));COMMIT;
 BEGIN;${context(doctor)}
 INSERT INTO highpass_v3.consent_preparation_requests(preparation_id,session_id,session_version,patient_ref,owner_tenant_id,source_hospital_id,
 target_tenant_id,target_hospital_id,actor_id,purpose,valid_from,valid_until,policy_version,submitted_evidence_commitment,
 resource_snapshot_digest,resource_count,action_count,creation_event_id,audit_session_id,trace_id)
 VALUES('${preparation}','${session}',1,'${patient}','${ta}','${ha}','${tb}','${hb}','${doctor}','TREATMENT',
 statement_timestamp()+interval '1 minute',statement_timestamp()+interval '4 minutes','demo-v1',decode('${'21'.repeat(32)}','hex'),
 decode('${scopeDigest}','hex'),1,1,'${prepEvent}','${prepAudit}','${trace}');
 INSERT INTO highpass_v3.consent_preparation_scopes VALUES('${preparation}',1,'${uid}',false,ARRAY['${series}']);
 INSERT INTO highpass_v3.consent_preparation_actions VALUES('${preparation}',1,'study:view');
 INSERT INTO highpass_v3.consent_preparation_audit_outbox
 SELECT '${prepEvent}',owner_tenant_id,source_hospital_id,actor_id,session_id,session_version,preparation_id,audit_session_id,trace_id,
 'PREPARATION_CREATED','ALLOW','PENDING_UNVERIFIED',created_at FROM highpass_v3.consent_preparation_requests WHERE preparation_id='${preparation}';
 INSERT INTO highpass_v3.consent_preparation_results
 SELECT owner_tenant_id,source_hospital_id,actor_id,'CONSENT_PREPARE',decode('${'31'.repeat(32)}','hex'),decode('${'32'.repeat(32)}','hex'),
 preparation_id,session_id,session_version,state,evidence_status,created_at FROM highpass_v3.consent_preparation_requests WHERE preparation_id='${preparation}';COMMIT;`);
 const ceremony=randomUUID(),nonce=randomBytes(32).toString('hex');
 ok('owner-only complete challenge plus exact audit commits',assembly(ceremony,{nonce}));
 ok('creation is challenge-only with correct Unicode clause hash',`SELECT assurance_kind,encode(link_clause_digest,'hex')='${clauseHash}'
 FROM highpass_v3.consent_patient_ceremonies WHERE ceremony_id='${ceremony}';`,'SIGNED_SYNTHETIC_REAUTH_ONLY|t');
 deny('missing required creation audit rolls back',assembly(randomUUID(),{omitAudit:true}),'23503');
 deny('swapped audit patient fails composite FK',assembly(randomUUID(),{auditPatient:randomUUID()}),'23503');
 deny('swapped audit correlation fails composite FK',assembly(randomUUID(),{auditTrace:'synthetic_wrong_trace_001'}),'23503');
 deny('nonce hash reuse fails uniqueness',assembly(randomUUID(),{nonce}),'23505');
 deny('short nonce hash is rejected',assembly(randomUUID(),{nonce:'ff'}),'23514');
 deny('submitted commitment is not displayed content approval digest',assembly(randomUUID(),{content:"p.submitted_evidence_commitment"}),'23514');
 deny('forged clause hash fails UTF8 integrity constraint',assembly(randomUUID(),{clauseDigest:'00'.repeat(32)}),'23514');
 deny('expanded identity link window fails assembly',assembly(randomUUID(),{linkUntil:"p.valid_until+interval '1 minute'"}),'23514');
 deny('future reauthentication fails',assembly(randomUUID(),{reauth:"statement_timestamp()+interval '1 minute'"}),'23514');
 deny('old reauthentication fails',assembly(randomUUID(),{reauth:"statement_timestamp()-interval '6 minutes'"}),'23514');
 deny('challenge exceeding five minute lifetime fails',assembly(randomUUID(),{expires:"statement_timestamp()+interval '6 minutes'"}),'23514');
 deny('expired challenge fails assembly',assembly(randomUUID(),{issued:"statement_timestamp()-interval '2 minutes'",
 reauth:"statement_timestamp()-interval '3 minutes'",expires:"statement_timestamp()-interval '1 minute'"}),'23514');
 deny('challenge beyond preparation deadline is rejected',assembly(randomUUID(),{expires:"p.valid_until+interval '1 second'"}),'23514');
 deny('unapproved real-MFA assurance label cannot replace synthetic reauth',assembly(randomUUID(),{assurance:'REAL_MFA_VERIFIED'}),'23514');
 deny('different session version fails fixed parent contract',assembly(randomUUID(),{sessionVersion:2}),'23514');
 deny('administrator cannot act as patient even with source context',assembly(randomUUID(),{actor:doctor}),'23514');
 deny('patient without approval scope fails',assembly(randomUUID(),{before:
  `UPDATE highpass_v3.principal_bindings SET scopes=ARRAY['consent:write'] WHERE actor_id='${patientActor}';`}),'23514');
 deny('foreign patient binding fails',assembly(randomUUID(),{before:
  `INSERT INTO highpass_v3.patient_refs(patient_ref) VALUES('${randomUUID()}');
   UPDATE highpass_v3.principal_bindings SET patient_ref=(SELECT patient_ref FROM highpass_v3.patient_refs WHERE patient_ref<>'${patient}' LIMIT 1) WHERE actor_id='${patientActor}';`}),'23514');
 for(const [test,before] of [
  ['revoked patient',`UPDATE highpass_v3.principal_bindings SET status='REVOKED' WHERE actor_id='${patientActor}';`],
  ['suspended source',`UPDATE highpass_v3.hospitals SET status='SUSPENDED' WHERE hospital_id='${ha}';`],
  ['suspended destination',`UPDATE highpass_v3.hospitals SET status='SUSPENDED' WHERE hospital_id='${hb}';`],
  ['deleted reference',`UPDATE highpass_v3.patient_refs SET deleted_at=clock_timestamp() WHERE patient_ref='${patient}';`]]){
  deny(`${test} fails ceremony assembly`,assembly(randomUUID(),{before}),'23514');
 }
 ok('display digest changes with clause version or finite window',`SELECT
 highpass_v3.patient_consent_content_digest(preparation_id,'synthetic-link-v2',link_clause_digest,link_purpose,link_valid_from,link_valid_until)<>content_digest,
 highpass_v3.patient_consent_content_digest(preparation_id,link_clause_version,link_clause_digest,link_purpose,link_valid_from,link_valid_until-interval '1 second')<>content_digest
 FROM highpass_v3.consent_patient_ceremonies WHERE ceremony_id='${ceremony}';`,'t|t');
 ok('canonical timestamp serialization is timezone independent',`SET timezone='Asia/Seoul';SELECT
 highpass_v3.patient_consent_content_digest(preparation_id,link_clause_version,link_clause_digest,link_purpose,link_valid_from,link_valid_until)=content_digest
 FROM highpass_v3.consent_patient_ceremonies WHERE ceremony_id='${ceremony}';`,'t');
 deny('owner cannot mutate challenge digest',`UPDATE highpass_v3.consent_patient_ceremonies SET content_digest=decode('${'00'.repeat(32)}','hex');`,'42501');
 deny('owner cannot delete audit',`DELETE FROM highpass_v3.consent_patient_ceremony_audit;`,'42501');
 ok('create limited nonowner fixture role with direct table privileges but no RLS admission',`
 CREATE ROLE hp_ceremony_schema_test NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;
 GRANT hp_v3_consent_approval_policy TO hp_ceremony_schema_test;
 GRANT USAGE ON SCHEMA highpass_v3 TO hp_ceremony_schema_test;
 GRANT SELECT,INSERT ON highpass_v3.consent_patient_ceremonies,highpass_v3.consent_patient_ceremony_audit TO hp_ceremony_schema_test;`);
 ok('nonowner default-deny hides patient challenge and audit',`BEGIN;${context(patientActor)}SET LOCAL ROLE hp_ceremony_schema_test;
 SELECT count(*) FROM highpass_v3.consent_patient_ceremonies;SELECT count(*) FROM highpass_v3.consent_patient_ceremony_audit;COMMIT;`,'0\n0');
 deny('nonowner default-deny rejects even copied existing audit INSERT',`BEGIN;${context(patientActor)}
 CREATE TEMP TABLE synthetic_audit_copy AS SELECT * FROM highpass_v3.consent_patient_ceremony_audit;
 GRANT SELECT ON synthetic_audit_copy TO hp_ceremony_schema_test;SET LOCAL ROLE hp_ceremony_schema_test;
 INSERT INTO highpass_v3.consent_patient_ceremony_audit SELECT * FROM synthetic_audit_copy;COMMIT;`,'42501');
 deny('nonowner has no digest function execution grant',`BEGIN;${context(patientActor)}SET LOCAL ROLE hp_ceremony_schema_test;
 SELECT highpass_v3.patient_consent_content_digest('${preparation}','synthetic-link-v1',decode('${clauseHash}','hex'),
 'PATIENT_IDENTITY_LINK',statement_timestamp(),statement_timestamp()+interval '1 minute');COMMIT;`,'42501');
 ok('all failed attempts rolled back; preparation/session/recipient unchanged',`SELECT count(*) FROM highpass_v3.consent_patient_ceremonies;
 SELECT count(*) FROM highpass_v3.consent_patient_ceremony_audit;
 SELECT state,evidence_status FROM highpass_v3.consent_preparation_requests;
 SELECT state,version FROM highpass_v3.exchange_sessions;
 SELECT status FROM highpass_v3.exchange_session_participants WHERE participant_role='DESTINATION';`,'1\n1\nPENDING|UNVERIFIED\nREQUESTED|1\nINVITED');
 ok('024 grants minimal read/lock columns only inside owned fixture',`
 GRANT SELECT(actor_id,tenant_id,hospital_id,role,scopes,status,patient_ref,service_purpose) ON highpass_v3.principal_bindings TO hp_ceremony_schema_test;
 GRANT SELECT(tenant_id,status) ON highpass_v3.tenants TO hp_ceremony_schema_test;
 GRANT SELECT(hospital_id,tenant_id,status) ON highpass_v3.hospitals TO hp_ceremony_schema_test;
 GRANT UPDATE(status) ON highpass_v3.principal_bindings,highpass_v3.tenants,highpass_v3.hospitals TO hp_ceremony_schema_test;
 GRANT SELECT(preparation_id,session_id,session_version,patient_ref,owner_tenant_id,source_hospital_id,target_tenant_id,target_hospital_id,
 state,evidence_status,purpose,valid_from,valid_until,policy_version,resource_count,action_count)
 ON highpass_v3.consent_preparation_requests TO hp_ceremony_schema_test;
 GRANT SELECT(preparation_id,ordinal,study_instance_uid,whole_study,series_instance_uids) ON highpass_v3.consent_preparation_scopes TO hp_ceremony_schema_test;
 GRANT SELECT(preparation_id,ordinal,action) ON highpass_v3.consent_preparation_actions TO hp_ceremony_schema_test;
 GRANT SELECT(session_id,patient_ref,owner_tenant_id,source_hospital_id,state,version,valid_from,valid_until)
 ON highpass_v3.exchange_sessions TO hp_ceremony_schema_test;
 GRANT UPDATE(session_id) ON highpass_v3.exchange_sessions TO hp_ceremony_schema_test;
 GRANT SELECT(patient_ref,owner_tenant_id,owner_hospital_id,deleted_at) ON highpass_v3.patient_refs TO hp_ceremony_schema_test;
 GRANT UPDATE(patient_ref) ON highpass_v3.patient_refs TO hp_ceremony_schema_test;
 GRANT SELECT(session_id,patient_ref,tenant_id,hospital_id,participant_role,status) ON highpass_v3.exchange_session_participants TO hp_ceremony_schema_test;
 GRANT EXECUTE ON FUNCTION highpass_v3.approval_patient_context(uuid,uuid,uuid),highpass_v3.approval_directory_caller(),
 highpass_v3.clinical_principal_context(),highpass_v3.patient_consent_content_digest(uuid,text,bytea,text,timestamptz,timestamptz)
 TO hp_ceremony_schema_test;`);
 const projection=body=>`BEGIN;${context(patientActor)}SET LOCAL ROLE hp_ceremony_schema_test;${body}COMMIT;`;
 ok('024 correct patient reads doctor-created immutable preparation and scoped children',projection(`
 SELECT preparation_id FROM highpass_v3.consent_preparation_requests;
 SELECT study_instance_uid FROM highpass_v3.consent_preparation_scopes;
 SELECT action FROM highpass_v3.consent_preparation_actions;`),`${preparation}\n${uid}\nstudy:view`);
 ok('024 correct patient locks source Session and own reference with minimal columns',projection(`
 SELECT session_id FROM highpass_v3.exchange_sessions WHERE session_id='${session}' FOR SHARE;
 SELECT patient_ref FROM highpass_v3.patient_refs WHERE patient_ref='${patient}' FOR SHARE;`),`${session}\n${patient}`);
 ok('024 patient sees SOURCE only, never invited recipient participant',projection(
  'SELECT participant_role FROM highpass_v3.exchange_session_participants;'),'SOURCE');
 ok('024 source registry principal tenant hospital are lockable',projection(`
 SELECT p.actor_id FROM highpass_v3.principal_bindings p JOIN highpass_v3.tenants t ON t.tenant_id=p.tenant_id
 JOIN highpass_v3.hospitals h ON h.hospital_id=p.hospital_id AND h.tenant_id=p.tenant_id
 WHERE p.actor_id='${patientActor}' FOR SHARE OF p,t,h;`),patientActor);
 ok('024 caller-selected target registry supports hospital then tenant SHARE',projection(`
 SET LOCAL app.approval_target_hospital='${hb}';SET LOCAL app.approval_target_tenant='${tb}';
 SELECT hospital_id FROM highpass_v3.hospitals WHERE hospital_id='${hb}' AND status='ACTIVE' FOR SHARE;
 SELECT tenant_id FROM highpass_v3.tenants WHERE tenant_id='${tb}' AND status='ACTIVE' FOR SHARE;`),`${hb}\n${tb}`);
 ok('024 SQL digest reads only admitted immutable fields and canonical children',projection(`
 SELECT octet_length(highpass_v3.patient_consent_content_digest(preparation_id,'synthetic-link-v1',decode('${clauseHash}','hex'),
 'PATIENT_IDENTITY_LINK',valid_from,valid_until)) FROM highpass_v3.consent_preparation_requests;`),'32');
 deny('024 patient cannot read submitted staging evidence commitment',projection(
  'SELECT submitted_evidence_commitment FROM highpass_v3.consent_preparation_requests;'),'42501');
 deny('024 patient cannot read preparation creator audit',projection('SELECT event_id FROM highpass_v3.consent_preparation_audit_outbox;'),'42501');
 deny('024 patient cannot read Mapping',projection('SELECT mapping_id FROM highpass_v3.patient_mappings;'),'42501');
 deny('024 lock privilege does not allow actual Session update',projection(
  `UPDATE highpass_v3.exchange_sessions SET session_id=session_id WHERE session_id='${session}';`),'42501');
 deny('024 lock privilege does not allow actual reference update',projection(
  `UPDATE highpass_v3.patient_refs SET patient_ref=patient_ref WHERE patient_ref='${patient}';`),'42501');
 deny('024 directory lock cannot suspend hospital',projection(`SET LOCAL app.approval_target_hospital='${hb}';
  UPDATE highpass_v3.hospitals SET status='SUSPENDED' WHERE hospital_id='${hb}';`),'42501');
 const hidden='SELECT count(*) FROM highpass_v3.consent_preparation_requests;SELECT count(*) FROM highpass_v3.exchange_sessions;';
 ok('024 no authenticated context reveals no preparation or Session',projection(`RESET app.actor_id;${hidden}`),'0\n0');
 ok('024 foreign tenant context reveals no preparation or Session',projection(`SET LOCAL app.tenant_id='${tb}';${hidden}`),'0\n0');
 ok('024 admin with approval scope still cannot replace patient',`BEGIN;${context(doctor)}
 UPDATE highpass_v3.principal_bindings SET scopes=ARRAY['consent:approve'] WHERE actor_id='${doctor}';
 SET LOCAL ROLE hp_ceremony_schema_test;${hidden}ROLLBACK;`,'0\n0');
 const wrongPatient=randomUUID();
 ok('024 foreign patient cannot read preparation or Session',`BEGIN;${context(patientActor)}
 INSERT INTO highpass_v3.patient_refs(patient_ref) VALUES('${wrongPatient}');
 UPDATE highpass_v3.principal_bindings SET patient_ref='${wrongPatient}' WHERE actor_id='${patientActor}';
 SET LOCAL ROLE hp_ceremony_schema_test;${hidden}ROLLBACK;`,'0\n0');
 for(const [test,mutation] of [
  ['missing approval scope',`UPDATE highpass_v3.principal_bindings SET scopes=ARRAY['consent:write'] WHERE actor_id='${patientActor}';`],
  ['revoked patient',`UPDATE highpass_v3.principal_bindings SET status='REVOKED' WHERE actor_id='${patientActor}';`],
  ['suspended source',`UPDATE highpass_v3.hospitals SET status='SUSPENDED' WHERE hospital_id='${ha}';`]]){
  ok(`024 ${test} reveals no preparation or Session`,`BEGIN;${context(patientActor)}${mutation}
   SET LOCAL ROLE hp_ceremony_schema_test;${hidden}ROLLBACK;`,'0\n0');
 }
 ok('024 deleted reference is not eligible for SHARE/read',`BEGIN;${context(patientActor)}
 UPDATE highpass_v3.patient_refs SET deleted_at=clock_timestamp() WHERE patient_ref='${patient}';
 SET LOCAL ROLE hp_ceremony_schema_test;SELECT count(*) FROM highpass_v3.patient_refs;ROLLBACK;`,'0');
 ok('024 suspended target fails active directory read while history remains immutable',`BEGIN;${context(patientActor)}
 UPDATE highpass_v3.hospitals SET status='SUSPENDED' WHERE hospital_id='${hb}';
 SET LOCAL ROLE hp_ceremony_schema_test;SET LOCAL app.approval_target_hospital='${hb}';
 SELECT count(*) FROM highpass_v3.hospitals WHERE hospital_id='${hb}' AND status='ACTIVE';ROLLBACK;`,'0');
 ok('024 no ceremony write admission or patient approval side effect',projection(`
 SELECT count(*) FROM highpass_v3.consent_patient_ceremonies;
 SELECT state,evidence_status FROM highpass_v3.consent_preparation_requests;
 SELECT state,version FROM highpass_v3.exchange_sessions;`),'0\nPENDING|UNVERIFIED\nREQUESTED|1');
 const portResult=docker(['port',name,'5432/tcp']);
 const portMatch=portResult.status===0?portResult.stdout.trim().match(/^127\.0\.0\.1:(\d+)$/):null;
 if(!portMatch)throw Error('POSTGRES_PORT_UNAVAILABLE');
 const issuanceMigration=readFileSync('db/migrations/025_highpass_v3_patient_challenge_issuance.sql','utf8');
 ok('025 transaction rollback preserves default-deny and no receipt table',`BEGIN;${issuanceMigration}ROLLBACK;
  SELECT count(*) FROM information_schema.tables WHERE table_schema='highpass_v3' AND table_name='consent_patient_challenge_results';`,'0');
 ok('025 applies only after historical schema tests inside owned fixture',`BEGIN;${issuanceMigration}COMMIT;`);
 const decisionMigration=readFileSync('db/migrations/026_highpass_v3_patient_consent_decisions.sql','utf8');
 ok('026 transaction rollback removes new decision content tables',`BEGIN;${decisionMigration}ROLLBACK;
  SELECT count(*) FROM information_schema.tables WHERE table_schema='highpass_v3' AND table_name='consent_content_versions';`,'0');
 ok('026 applies only inside owned synthetic fixture',`BEGIN;${decisionMigration}COMMIT;`);
 ok('026 all seven decision tables force RLS and contain no raw secret columns',`SELECT count(*) FROM pg_class c
  JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='highpass_v3' AND c.relname IN
  ('consent_content_versions','consent_content_scopes','consent_content_actions','consent_state_events',
  'consent_decision_audit','consent_patient_decisions','consent_patient_decision_results') AND c.relrowsecurity AND c.relforcerowsecurity;
  SELECT count(*) FROM information_schema.columns WHERE table_schema='highpass_v3' AND table_name IN
  ('consent_content_versions','consent_content_scopes','consent_content_actions','consent_state_events',
  'consent_decision_audit','consent_patient_decisions','consent_patient_decision_results') AND column_name IN ('nonce','raw_nonce','token','secret');`,'7\n0');
 await checkPatientApprovalProjection({base:{host:'127.0.0.1',port:Number(portMatch[1]),user:'postgres',password:fixturePassword,
  database:'postgres',connectionTimeoutMillis:3000,query_timeout:5000,statement_timeout:4000,options:'-c lock_timeout=3000'},
  record:{actorId:patientActor,tenantId:ta,hospitalId:ha,patientRefId:patient},preparationId:preparation,sessionId:session,targetHospitalId:hb,clause,
  check(test,pass){results.push({name:test,result:pass?'PASS':'FAIL'});if(!pass)throw Error('SCHEMA_ASSERTION_FAILED');}});
 summary={result:'PASS',scope:'INITIAL CONSENT + TERMINAL DDL + PRIVATE WITHDRAWAL SERVICE / SYNTHETIC ONLY / NO CLINICAL AUTHORITY',imageId:image.stdout.trim(),results,
  notVerified:[
   'complete RLS cross-patient/tenant matrix for decision tables and all immutable mutation paths',
   'actual D6 approval/withdraw/cancel/expiry/institution lock-contention witness matrix',
   'decision challenge/reauth/parent expiry at COMMIT boundary',
   'HTTP/HTTPS/UI','complete withdrawal/expiry races, registered foreign patient matrix and replacement content versions',
   'AuthorizationDecision/Grant/clinical access','real MFA/IdP/KMS/PACS']};
}catch(error){
 failed=true;summary={result:results.some(r=>r.result==='FAIL')?'FAIL':'NOT VERIFIED',reason:
  ['POSTGRES_IMAGE_UNAVAILABLE','POSTGRES_START_UNAVAILABLE','POSTGRES_READINESS_UNAVAILABLE','SCHEMA_ASSERTION_FAILED'].includes(error.message)
   ?error.message:'SCHEMA_OR_ENVIRONMENT_FAILURE',results};
}finally{
 if(attempted){
  const removal=removeOwnedPostgresFixture({name,owner,label,docker:fixtureDocker});
  const followup=!removal.absent&&removal.owned?await observeOwnedFixtureAbsence({name,owner,label,docker:fixtureDocker}):null;
  cleanup=removal.absent||followup?.absent?'PASS':'NOT VERIFIED';
  cleanupObservations=[...removal.observations,...(followup?.observations??[])];
  results.push({name:'owned fixture removal and independent exact-name absence observation',result:cleanup});
 }
 if(cleanup!=='PASS'){failed=true;if(summary.result==='PASS')summary.result='NOT VERIFIED';}
 summary={...summary,startupObservation,cleanupObservations,cleanup,durationMs:Date.now()-began,generatedAt:new Date().toISOString(),sourceHashes:hash(),nodeVersion:process.version};
 summary.sourceUnchanged=JSON.stringify(initial)===JSON.stringify(summary.sourceHashes);
 if(!summary.sourceUnchanged){summary.result='NOT VERIFIED';failed=true;}
 const directory=path.join('evidence','generated',`hp-v3-ceremony-schema-${new Date().toISOString().replace(/[:.]/g,'-')}-${randomUUID().slice(0,8)}`);
 mkdirSync(directory,{recursive:true});const sourcePath=path.join(directory,'schema-check.json').replaceAll('\\','/');
 writeFileSync(sourcePath,JSON.stringify(summary,null,2)+'\n');
 const repositorySha=spawnSync('git',['rev-parse','HEAD'],{encoding:'utf8',windowsHide:true,timeout:5000}).stdout.trim();
 const manifest={repositorySha,containsPersonalData:false,containsSecrets:false,evidence:[{evidenceId:'v3-patient-ceremony-schema',sourcePath,
  sha256:createHash('sha256').update(readFileSync(sourcePath)).digest('hex'),repositorySha,
  reviewStatus:'DRAFT',reviewer:'UNASSIGNED',containsPersonalData:false,containsSecrets:false}]};
 writeFileSync(path.join(directory,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
 console.log(JSON.stringify(summary,null,2));console.log(JSON.stringify({evidenceDirectory:directory.replaceAll('\\','/'),reviewStatus:'DRAFT',reviewer:'UNASSIGNED'}));
 process.exitCode=failed?1:0;
}
