import {spawnSync} from 'node:child_process';
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {randomUUID,randomBytes,createHash} from 'node:crypto';
import path from 'node:path';

// Owned disposable fixture only. No runtime DB, credentials or external PACS.
const name=`hp-v3-pending-${randomUUID()}`,owner=randomUUID(),label='highpass.validation.pending-schema';
const migrationNames=['006_highpass_v3_identity.sql','007_highpass_v3_identity_transactions.sql',
 '008_highpass_v3_patient_ref_registration.sql','009_highpass_v3_identity_idempotency.sql','010_highpass_v3_mapping_review.sql',
 '011_highpass_v3_exchange_foundation.sql','012_highpass_v3_exchange_create_authority.sql','013_highpass_v3_exchange_read_audit.sql',
 '014_highpass_v3_exchange_requested_actions.sql','015_highpass_v3_exchange_cancel_events.sql',
 '016_highpass_v3_expiry_principal.sql','017_highpass_v3_exchange_expiry_events.sql','018_highpass_v3_pending_preparation_foundation.sql',
 '019_highpass_v3_pending_source_projection.sql'];
const sources=[...migrationNames.map(f=>`db/migrations/${f}`),'scripts/v3-pending-schema-check.js'];
const hash=()=>Object.fromEntries(sources.map(f=>[f,createHash('sha256').update(readFileSync(f)).digest('hex')]));
const initial=hash(),began=Date.now(),results=[];
let attempted=false,failed=false,summary,cleanup='NOT VERIFIED';
const [ta,tb,ha,hb,actor,otherActor,patient,session,event,audit]=Array.from({length:10},()=>randomUUID());
const trace='synthetic_pending_schema_001',uid='1.2.410.900.1',series='1.2.410.900.1.1';
const resources=[{studyInstanceUid:uid,seriesInstanceUids:[series]}];
const digest=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
function docker(args,input,timeout=15000){return spawnSync('docker',args,{input,encoding:'utf8',timeout,windowsHide:true,maxBuffer:1024*1024});}
function sql(body){return docker(['exec','-i',name,'psql','-U','postgres','-d','postgres','-X','-qAt','-v','ON_ERROR_STOP=1','-v','VERBOSITY=verbose'],
 `SET statement_timeout='5s';SET lock_timeout='3s';\n${body}`);}
function ok(test,body,expected=''){const r=sql(body),pass=r.status===0&&r.stdout.trim()===expected;
 results.push({name:test,result:pass?'PASS':'FAIL',exitCode:r.status});if(!pass)throw Error('SCHEMA_ASSERTION_FAILED');}
function deny(test,body,state){const r=sql(body),observed=r.stderr.match(/ERROR:\s+([0-9A-Z]{5}):/)?.[1],pass=r.status===3&&observed===state;
 results.push({name:test,result:pass?'PASS':'FAIL',exitCode:r.status,sqlState:observed??null});if(!pass)throw Error('SCHEMA_ASSERTION_FAILED');}
const context=`SET LOCAL app.tenant_id='${ta}';SET LOCAL app.hospital_id='${ha}';SET LOCAL app.actor_id='${actor}';`;
function assembly(id,{omit='',whole=false,study=uid,selected=series,action='study:view',hashOverride,actorId=actor,state='PENDING',evidence='UNVERIFIED'}={}){
 const e=randomUUID(),a=randomUUID(),scope=whole?[{studyInstanceUid:study}]:[{studyInstanceUid:study,seriesInstanceUids:[selected]}];
 return `BEGIN;${context}
 INSERT INTO highpass_v3.consent_preparation_requests(preparation_id,session_id,session_version,patient_ref,owner_tenant_id,source_hospital_id,
 target_tenant_id,target_hospital_id,actor_id,state,evidence_status,purpose,valid_from,valid_until,policy_version,
 submitted_evidence_commitment,resource_snapshot_digest,resource_count,action_count,creation_event_id,audit_session_id,trace_id)
 VALUES('${id}','${session}',1,'${patient}','${ta}','${ha}','${tb}','${hb}','${actorId}','${state}','${evidence}','TREATMENT',
 statement_timestamp()+interval '1 minute',statement_timestamp()+interval '30 minutes','demo-v1',decode('${'21'.repeat(32)}','hex'),
 decode('${hashOverride??digest(scope)}','hex'),1,1,'${e}','${a}','${trace}');
 ${omit==='scopes'?'':`INSERT INTO highpass_v3.consent_preparation_scopes VALUES('${id}',1,'${study}',${whole},${whole?'NULL':`ARRAY['${selected}']`});`}
 ${omit==='actions'?'':`INSERT INTO highpass_v3.consent_preparation_actions VALUES('${id}',1,'${action}');`}
 ${omit==='audit'?'':`INSERT INTO highpass_v3.consent_preparation_audit_outbox
 SELECT '${e}',owner_tenant_id,source_hospital_id,actor_id,session_id,session_version,preparation_id,audit_session_id,trace_id,
 'PREPARATION_CREATED','ALLOW','PENDING_UNVERIFIED',created_at FROM highpass_v3.consent_preparation_requests WHERE preparation_id='${id}';`}
 ${omit==='ledger'?'':`INSERT INTO highpass_v3.consent_preparation_results
 SELECT owner_tenant_id,source_hospital_id,actor_id,'CONSENT_PREPARE',decode('${randomBytes(32).toString('hex')}','hex'),
 decode('${'31'.repeat(32)}','hex'),preparation_id,session_id,session_version,state,evidence_status,created_at
 FROM highpass_v3.consent_preparation_requests WHERE preparation_id='${id}';`}
 COMMIT;`;
}
try{
 const image=docker(['image','inspect','postgres:16-alpine','--format','{{.Id}}']);
 if(image.status!==0)throw Error('POSTGRES_IMAGE_UNAVAILABLE');
 attempted=true;
 const launch=docker(['run','-d','--pull=never','--network','none','--name',name,'--label',`${label}=${owner}`,
  '--memory','256m','--mount','type=tmpfs,destination=/var/lib/postgresql/data','-e',`POSTGRES_PASSWORD=${randomBytes(32).toString('hex')}`,'postgres:16-alpine'],undefined,45000);
 if(launch.status!==0)throw Error('POSTGRES_START_UNAVAILABLE');
 const deadline=Date.now()+60000;let ready=false;
 while(Date.now()<deadline){if(docker(['exec',name,'pg_isready','-h','127.0.0.1','-U','postgres','-t','2'],undefined,4000).status===0){ready=true;break;}
  await new Promise(resolve=>setTimeout(resolve,500));}
 if(!ready)throw Error('POSTGRES_READINESS_UNAVAILABLE');
 const migrations=migrationNames.map(f=>readFileSync(`db/migrations/${f}`,'utf8')).join('\n');
 ok('006..019 rollback leaves no schema or policy role',`BEGIN;${migrations}ROLLBACK;
 SELECT count(*) FROM pg_namespace WHERE nspname='highpass_v3';SELECT count(*) FROM pg_roles WHERE rolname='hp_v3_pending_policy';`,'0\n0');
 ok('006..019 apply only to owned disposable fixture',`BEGIN;${migrations}COMMIT;`);
 ok('pending capability is NOLOGIN nonadmin and not a clinical member',`SELECT NOT rolcanlogin AND NOT rolsuper AND NOT rolbypassrls
 AND NOT pg_has_role('hp_v3_pending_policy','hp_v3_clinical_policy','MEMBER')
 AND NOT pg_has_role('hp_v3_pending_policy','hp_v3_expiry_policy','MEMBER') FROM pg_roles WHERE rolname='hp_v3_pending_policy';`,'t');
 ok('five new tables force RLS and have no admission policies',`SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname='highpass_v3' AND c.relname LIKE 'consent_preparation_%' AND c.relkind='r' AND c.relrowsecurity AND c.relforcerowsecurity;
 SELECT count(*) FROM pg_policy p JOIN pg_class c ON c.oid=p.polrelid WHERE c.relname LIKE 'consent_preparation_%';`,'5\n0');
 ok('seed synthetic source actors and owned reference',`
 INSERT INTO highpass_v3.tenants VALUES('${ta}','SYNTH-A','SYNTHETIC A','ACTIVE'),('${tb}','SYNTH-B','SYNTHETIC B','ACTIVE');
 INSERT INTO highpass_v3.hospitals(hospital_id,tenant_id,code) VALUES('${ha}','${ta}','A'),('${hb}','${tb}','B');
 INSERT INTO highpass_v3.patient_refs(patient_ref) VALUES('${patient}');
 INSERT INTO highpass_v3.principal_bindings(actor_id,tenant_id,hospital_id,role,scopes) VALUES
 ('${actor}','${ta}','${ha}','HOSPITAL_ADMIN',ARRAY['exchange:create','consent:write']),
 ('${otherActor}','${ta}','${ha}','DOCTOR',ARRAY['consent:write']);
 UPDATE highpass_v3.patient_refs SET owner_tenant_id='${ta}',owner_hospital_id='${ha}',registered_by='${actor}' WHERE patient_ref='${patient}';
 INSERT INTO highpass_v3.patient_ref_registrations SELECT patient_ref,owner_tenant_id,owner_hospital_id,registered_by FROM highpass_v3.patient_refs;
 BEGIN;${context}
 INSERT INTO highpass_v3.exchange_sessions(session_id,patient_ref,owner_tenant_id,source_hospital_id,target_tenant_id,target_hospital_id,requester_id,
 purpose,initiation_type,valid_until,resource_snapshot_digest,resource_count,audit_session_id,trace_id,requested_actions)
 VALUES('${session}','${patient}','${ta}','${ha}','${tb}','${hb}','${actor}','TREATMENT','PROVIDER_INITIATED',statement_timestamp()+interval '1 hour',
 decode('${digest(resources)}','hex'),1,'${audit}','${trace}',ARRAY['study:view']);
 INSERT INTO highpass_v3.exchange_audit_outbox(event_id,session_id,tenant_id,hospital_id,actor_id,audit_session_id,trace_id,action,result,reason_code,session_version)
 VALUES('${event}','${session}','${ta}','${ha}','${actor}','${audit}','${trace}','SESSION_CREATED','ALLOW','SESSION_REQUESTED',1);
 INSERT INTO highpass_v3.exchange_creation_context VALUES('${session}','${patient}','${ta}','${ha}','${actor}','PROVIDER_INITIATED','${tb}','${hb}','${event}','${audit}','${trace}','SESSION_CREATED');
 INSERT INTO highpass_v3.exchange_session_participants VALUES('${session}','${patient}','${ta}','${ha}','SOURCE','ACTIVE'),('${session}','${patient}','${tb}','${hb}','DESTINATION','INVITED');
 INSERT INTO highpass_v3.exchange_resource_scopes VALUES('${session}',1,'${uid}',false,ARRAY['${series}']);
 INSERT INTO highpass_v3.exchange_write_results VALUES('${ta}','${ha}','${actor}','SESSION_CREATE',decode('${'11'.repeat(32)}','hex'),decode('${'12'.repeat(32)}','hex'),'${session}','REQUESTED',1,
 (SELECT created_at FROM highpass_v3.exchange_sessions WHERE session_id='${session}'));COMMIT;`);
 const prepared=randomUUID();
 ok('owner-only complete PENDING assembly commits without consent or grant',assembly(prepared));
 ok('SQL resource digest equals canonical JS digest',`SELECT encode(highpass_v3.pending_scope_digest('${prepared}'),'hex');`,digest(resources));
 for(const omit of ['scopes','actions','ledger'])deny(`missing ${omit} rolls back complete request`,assembly(randomUUID(),{omit}),'23514');
 deny('missing typed audit fails deferred FK',assembly(randomUUID(),{omit:'audit'}),'23503');
 deny('tampered resource digest fails commit',assembly(randomUUID(),{hashOverride:'00'.repeat(32)}),'23514');
 deny('whole Study expansion fails commit',assembly(randomUUID(),{whole:true}),'23514');
 deny('foreign Study fails commit',assembly(randomUUID(),{study:'1.2.999'}),'23514');
 deny('foreign Series fails commit',assembly(randomUUID(),{selected:'1.2.999.1'}),'23514');
 deny('action expansion fails commit',assembly(randomUUID(),{action:'study:download'}),'23514');
 deny('ACTIVE is not a preparation state',assembly(randomUUID(),{state:'ACTIVE'}),'23514');
 deny('verified evidence cannot be asserted',assembly(randomUUID(),{evidence:'VERIFIED'}),'23514');
 deny('different persisted actor cannot borrow current source authority',assembly(randomUUID(),{actorId:otherActor}),'23514');
 ok('nonowner fixture receives table privileges but no policy bypass',`CREATE ROLE hp_pending_schema_test NOSUPERUSER NOBYPASSRLS;
 GRANT hp_v3_pending_policy TO hp_pending_schema_test;GRANT USAGE ON SCHEMA highpass_v3 TO hp_pending_schema_test;
 GRANT SELECT,INSERT,UPDATE,DELETE ON highpass_v3.consent_preparation_requests,highpass_v3.consent_preparation_scopes,
 highpass_v3.consent_preparation_actions,highpass_v3.consent_preparation_audit_outbox,highpass_v3.consent_preparation_results TO hp_pending_schema_test;`);
 ok('even explicitly privileged source nonowner sees no staging rows',`BEGIN;${context}SET LOCAL ROLE hp_pending_schema_test;
 SELECT count(*) FROM highpass_v3.consent_preparation_requests;SELECT count(*) FROM highpass_v3.consent_preparation_results;COMMIT;`,'0\n0');
 deny('nonowner staging INSERT remains fail closed before authority gate',assembly(randomUUID()).replace('BEGIN;',`BEGIN;SET LOCAL ROLE hp_pending_schema_test;`),'42501');
 deny('owner cannot mutate prepared request',`UPDATE highpass_v3.consent_preparation_requests SET policy_version='demo-v2' WHERE preparation_id='${prepared}';`,'42501');
 deny('owner cannot erase safe audit',`DELETE FROM highpass_v3.consent_preparation_audit_outbox WHERE preparation_id='${prepared}';`,'42501');
 deny('late appended scope cannot expand sealed assembly',`BEGIN;${context}INSERT INTO highpass_v3.consent_preparation_scopes VALUES('${prepared}',2,'1.2.900',true,NULL);COMMIT;`,'23514');
 ok('suspend target fixture only',`UPDATE highpass_v3.hospitals SET status='SUSPENDED' WHERE hospital_id='${hb}';`);
 deny('suspended target fails staging assembly',assembly(randomUUID()),'23514');
 ok('failed assemblies leave exactly one preparation and unchanged REQUESTED Session',`
 SELECT count(*) FROM highpass_v3.consent_preparation_requests;SELECT count(*) FROM highpass_v3.consent_preparation_scopes;
 SELECT count(*) FROM highpass_v3.consent_preparation_actions;SELECT count(*) FROM highpass_v3.consent_preparation_results;
 SELECT state||':'||version FROM highpass_v3.exchange_sessions;`,'1\n1\n1\n1\nREQUESTED:1');
 ok('restore target and enroll consent-only source fixture',`UPDATE highpass_v3.hospitals SET status='ACTIVE' WHERE hospital_id='${hb}';
 UPDATE highpass_v3.principal_bindings SET scopes=ARRAY['consent:write'] WHERE actor_id='${actor}';
 CREATE ROLE hp_pending_projection_test NOSUPERUSER NOBYPASSRLS;GRANT hp_v3_pending_policy TO hp_pending_projection_test;
 GRANT USAGE ON SCHEMA highpass_v3 TO hp_pending_projection_test;
 GRANT SELECT(actor_id,tenant_id,hospital_id,role,scopes,status,patient_ref,service_purpose) ON highpass_v3.principal_bindings TO hp_pending_projection_test;
 GRANT SELECT(tenant_id,status) ON highpass_v3.tenants TO hp_pending_projection_test;
 GRANT SELECT(hospital_id,tenant_id,status) ON highpass_v3.hospitals TO hp_pending_projection_test;
 GRANT UPDATE(status) ON highpass_v3.principal_bindings,highpass_v3.tenants,highpass_v3.hospitals TO hp_pending_projection_test;
 GRANT SELECT(session_id,patient_ref,owner_tenant_id,source_hospital_id,requester_id) ON highpass_v3.exchange_creation_context TO hp_pending_projection_test;
 GRANT SELECT(session_id,patient_ref,owner_tenant_id,source_hospital_id,target_tenant_id,target_hospital_id,requester_id,purpose,state,version,
 valid_from,valid_until,resource_snapshot_digest,resource_count,requested_actions) ON highpass_v3.exchange_sessions TO hp_pending_projection_test;
 GRANT UPDATE(session_id) ON highpass_v3.exchange_sessions TO hp_pending_projection_test;
 GRANT SELECT(patient_ref,owner_tenant_id,owner_hospital_id,deleted_at) ON highpass_v3.patient_refs TO hp_pending_projection_test;
 GRANT UPDATE(patient_ref) ON highpass_v3.patient_refs TO hp_pending_projection_test;
 GRANT SELECT(session_id,patient_ref,tenant_id,hospital_id,participant_role,status) ON highpass_v3.exchange_session_participants TO hp_pending_projection_test;
 GRANT SELECT(session_id,ordinal,study_instance_uid,whole_study,series_instance_uids) ON highpass_v3.exchange_resource_scopes TO hp_pending_projection_test;
 GRANT EXECUTE ON FUNCTION highpass_v3.pending_source_actor(uuid,uuid,uuid,uuid),highpass_v3.pending_directory_caller(),highpass_v3.clinical_principal_context() TO hp_pending_projection_test;`);
 const projection=body=>`BEGIN;${context}SET LOCAL ROLE hp_pending_projection_test;${body}COMMIT;`;
 ok('consent-only source minimal columns support actual Session/ref FOR SHARE',projection(`SELECT session_id FROM highpass_v3.exchange_sessions WHERE session_id='${session}' FOR SHARE;
 SELECT patient_ref FROM highpass_v3.patient_refs WHERE patient_ref='${patient}' FOR SHARE;`),`${session}\n${patient}`);
 ok('immutable source participant and canonical scope visible without Mapping',projection(`SELECT participant_role FROM highpass_v3.exchange_session_participants;
 SELECT study_instance_uid FROM highpass_v3.exchange_resource_scopes;`),`SOURCE\n${uid}`);
 deny('Mapping SELECT has no grant',projection('SELECT mapping_id FROM highpass_v3.patient_mappings;'),'42501');
 deny('unneeded source trace column has no grant',projection('SELECT trace_id FROM highpass_v3.exchange_sessions;'),'42501');
 deny('Session lock privilege cannot update even id to itself',projection(`UPDATE highpass_v3.exchange_sessions SET session_id=session_id WHERE session_id='${session}';`),'42501');
 deny('reference lock privilege cannot update',projection(`UPDATE highpass_v3.patient_refs SET patient_ref=patient_ref WHERE patient_ref='${patient}';`),'42501');
 ok('no context exposes no pending source Session',`BEGIN;SET LOCAL ROLE hp_pending_projection_test;SELECT count(session_id) FROM highpass_v3.exchange_sessions;COMMIT;`,'0');
 ok('different requester doctor sees no source Session',projection(`SET LOCAL app.actor_id='${otherActor}';SELECT count(session_id) FROM highpass_v3.exchange_sessions;`),'0');
 ok('own requester doctor sees source Session',`UPDATE highpass_v3.principal_bindings SET role='DOCTOR' WHERE actor_id='${actor}';`);
 ok('own doctor consent-only path remains visible',projection('SELECT count(session_id) FROM highpass_v3.exchange_sessions;'),'1');
 ok('bind source patient fixture',`UPDATE highpass_v3.principal_bindings SET role='PATIENT',patient_ref='${patient}' WHERE actor_id='${actor}';`);
 ok('bound patient sees source Session and owned ref',projection('SELECT count(session_id) FROM highpass_v3.exchange_sessions;SELECT count(patient_ref) FROM highpass_v3.patient_refs;'),'1\n1');
 const wrongPatient=randomUUID();
 ok('bind different synthetic patient',`INSERT INTO highpass_v3.patient_refs(patient_ref) VALUES('${wrongPatient}');
 UPDATE highpass_v3.principal_bindings SET patient_ref='${wrongPatient}' WHERE actor_id='${actor}';`);
 ok('wrong patient cannot see source Session or ref',projection('SELECT count(session_id) FROM highpass_v3.exchange_sessions;SELECT count(patient_ref) FROM highpass_v3.patient_refs;'),'0\n0');
 ok('restore admin and revoke source principal',`UPDATE highpass_v3.principal_bindings SET role='HOSPITAL_ADMIN',patient_ref=NULL,status='REVOKED' WHERE actor_id='${actor}';`);
 ok('revoked principal sees no Session',projection('SELECT count(session_id) FROM highpass_v3.exchange_sessions;'),'0');
 ok('restore actor and suspend source',`UPDATE highpass_v3.principal_bindings SET status='ACTIVE' WHERE actor_id='${actor}';UPDATE highpass_v3.hospitals SET status='SUSPENDED' WHERE hospital_id='${ha}';`);
 ok('suspended source sees no Session',projection('SELECT count(session_id) FROM highpass_v3.exchange_sessions;'),'0');
 ok('restore source and lock server-selected target',`UPDATE highpass_v3.hospitals SET status='ACTIVE' WHERE hospital_id='${ha}';`);
 ok('target selected registry can lock without exchange:create',projection(`SET LOCAL app.pending_target_hospital='${hb}';SET LOCAL app.pending_target_tenant='${tb}';
 SELECT h.hospital_id FROM highpass_v3.hospitals h JOIN highpass_v3.tenants t USING(tenant_id) WHERE h.hospital_id='${hb}' FOR SHARE OF h,t;`),hb);
 deny('target lock policy cannot change status',projection(`SET LOCAL app.pending_target_hospital='${hb}';UPDATE highpass_v3.hospitals SET status='SUSPENDED' WHERE hospital_id='${hb}';`),'42501');
 ok('deleted owned ref denies even source admin',`UPDATE highpass_v3.patient_refs SET deleted_at=clock_timestamp() WHERE patient_ref='${patient}';`);
 ok('deleted ref is unavailable under pending policy',projection('SELECT count(patient_ref) FROM highpass_v3.patient_refs;'),'0');
 summary={result:'PASS',scope:'PENDING SCHEMA / OWNER ASSEMBLY + NONOWNER MINIMUM-COLUMN READ LOCK RLS ONLY',imageId:image.stdout.trim(),results,
  notVerified:['complete nonowner preparation write authorization','nonowner prepare service','atomic domain DENY audit',
   'concurrent retry and original receipt','lost ACK/storage faults','cancel/expiry/suspension races','HTTP/HTTPS/mTLS','patient approval/Grant/clinical access']};
}catch(error){failed=true;summary={result:results.some(r=>r.result==='FAIL')?'FAIL':'NOT VERIFIED',reason:
 ['POSTGRES_IMAGE_UNAVAILABLE','POSTGRES_START_UNAVAILABLE','POSTGRES_READINESS_UNAVAILABLE','SCHEMA_ASSERTION_FAILED'].includes(error.message)?error.message:'SCHEMA_OR_ENVIRONMENT_FAILURE',results};
}finally{
 if(attempted){const inspected=docker(['inspect',name,'--format',`{{index .Config.Labels "${label}"}}`]);
  const removed=inspected.status===0&&inspected.stdout.trim()===owner?docker(['rm','-f','-v',name],undefined,20000):{status:1};
  cleanup=removed.status===0?'PASS':'NOT VERIFIED';if(cleanup!=='PASS')failed=true;}
 summary={...summary,cleanup,durationMs:Date.now()-began,generatedAt:new Date().toISOString(),sourceHashes:hash(),nodeVersion:process.version};
 summary.sourceUnchanged=JSON.stringify(initial)===JSON.stringify(summary.sourceHashes);if(!summary.sourceUnchanged){summary.result='NOT VERIFIED';failed=true;}
 const directory=path.join('evidence','generated',`hp-v3-pending-schema-${new Date().toISOString().replace(/[:.]/g,'-')}-${randomUUID().slice(0,8)}`);
 mkdirSync(directory,{recursive:true});const sourcePath=path.join(directory,'schema-check.json').replaceAll('\\','/');
 writeFileSync(sourcePath,JSON.stringify(summary,null,2)+'\n');
 const repositorySha=spawnSync('git',['rev-parse','HEAD'],{encoding:'utf8',windowsHide:true,timeout:5000}).stdout.trim();
 const manifest={repositorySha,containsPersonalData:false,containsSecrets:false,evidence:[{evidenceId:'v3-pending-schema',sourcePath,
  sha256:createHash('sha256').update(readFileSync(sourcePath)).digest('hex'),repositorySha,reviewStatus:'DRAFT',reviewer:'UNASSIGNED',containsPersonalData:false,containsSecrets:false}]};
 writeFileSync(path.join(directory,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
 console.log(JSON.stringify(summary,null,2));console.log(JSON.stringify({evidenceDirectory:directory.replaceAll('\\','/'),reviewStatus:'DRAFT',reviewer:'UNASSIGNED'}));
 process.exitCode=failed?1:0;
}
