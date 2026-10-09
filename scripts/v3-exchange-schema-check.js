import {spawnSync} from 'node:child_process';
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {randomUUID,randomBytes,createHash} from 'node:crypto';
import path from 'node:path';

// Disposable network-isolated fixture only; never reads a running project's DB.
const name=`hp-v3-exchange-${randomUUID()}`,owner=randomUUID(),label='highpass.validation.exchange-schema';
 const began=Date.now(),results=[];let launched=false,attempted=false,failed=false,summary,cleanup='NOT VERIFIED';
const files=['006_highpass_v3_identity.sql','007_highpass_v3_identity_transactions.sql','008_highpass_v3_patient_ref_registration.sql',
 '009_highpass_v3_identity_idempotency.sql','010_highpass_v3_mapping_review.sql','011_highpass_v3_exchange_foundation.sql'].map(x=>'db/migrations/'+x);
const sources=[...files,'scripts/v3-exchange-schema-check.js'];
const hash=()=>Object.fromEntries(sources.map(f=>[f,createHash('sha256').update(readFileSync(f)).digest('hex')]));
const initialHashes=hash();
const [ta,tb,ha,hb,aa,ab,patientActor,otherActor,pa,pb,other,sa,sb,sp]=Array.from({length:14},()=>randomUUID());
function docker(args,input,timeout=15000){return spawnSync('docker',args,{input,encoding:'utf8',timeout,windowsHide:true,maxBuffer:1024*1024});}
function sql(body){return docker(['exec','-i',name,'psql','-U','postgres','-d','postgres','-X','-qAt','-v','ON_ERROR_STOP=1','-v','VERBOSITY=verbose'],
 `SET statement_timeout='5s'; SET lock_timeout='3s';\n${body}`);}
function check(name,condition){results.push({name,result:condition?'PASS':'FAIL'});if(!condition)throw Error('SCHEMA_ASSERTION_FAILED');}
function ok(name,body,expected=''){const r=sql(body);check(name,r.status===0&&r.stdout.trim()===expected);}
function deny(name,body,state){const r=sql(body),observed=r.stderr.match(/ERROR:\s+([0-9A-Z]{5}):/)?.[1];
 results.push({name,result:r.status===3&&observed===state?'PASS':'FAIL',exitCode:r.status,sqlState:observed??null});
 if(r.status!==3||observed!==state)throw Error('SCHEMA_ASSERTION_FAILED');}
function scoped(tenant,hospital,actor,body){return `BEGIN; SET LOCAL ROLE hp_exchange_test; SET LOCAL app.tenant_id='${tenant}';
 SET LOCAL app.hospital_id='${hospital}'; SET LOCAL app.actor_id='${actor}'; ${body} COMMIT;`;}
function assembly(id,{tenant=ta,hospital=ha,targetTenant=tb,targetHospital=hb,patient=pa,actor=aa,initiation='PROVIDER_INITIATED',omit='',scope="ARRAY['1.2.3.1']",targetStatus='INVITED'}={}){
 return `BEGIN;
 INSERT INTO highpass_v3.exchange_sessions(session_id,patient_ref,owner_tenant_id,source_hospital_id,target_tenant_id,target_hospital_id,requester_id,
 purpose,initiation_type,valid_until,resource_snapshot_digest,resource_count,audit_session_id,trace_id)
 VALUES('${id}','${patient}','${tenant}','${hospital}','${targetTenant}','${targetHospital}','${actor}','TREATMENT','${initiation}',
 statement_timestamp()+interval '1 hour',decode('${randomBytes(32).toString('hex')}','hex'),2,'${id}','synthetic_session_trace_001');
 ${omit==='participants'?'':`INSERT INTO highpass_v3.exchange_session_participants VALUES
 ('${id}','${patient}','${tenant}','${hospital}','SOURCE','ACTIVE'),('${id}','${patient}','${targetTenant}','${targetHospital}','DESTINATION','${targetStatus}');`}
 ${omit==='scopes'?'':`INSERT INTO highpass_v3.exchange_resource_scopes VALUES('${id}',1,'1.2.3',false,${scope}),('${id}',2,'1.2.4',true,NULL);`}
 ${omit==='audit'?'':`INSERT INTO highpass_v3.exchange_audit_outbox(event_id,session_id,tenant_id,hospital_id,actor_id,audit_session_id,trace_id,action,result,reason_code,session_version)
 VALUES('${randomUUID()}','${id}','${tenant}','${hospital}','${actor}','${id}','synthetic_session_trace_001','SESSION_CREATED','ALLOW','SESSION_REQUESTED',1);`}
 ${omit==='ledger'?'':`INSERT INTO highpass_v3.exchange_write_results SELECT '${tenant}','${hospital}','${actor}','SESSION_CREATE',
 decode('${randomBytes(32).toString('hex')}','hex'),decode('${randomBytes(32).toString('hex')}','hex'),session_id,'REQUESTED',1,created_at
 FROM highpass_v3.exchange_sessions WHERE session_id='${id}';`}
 COMMIT;`;}
try{
 const image=docker(['image','inspect','postgres:16-alpine','--format','{{.Id}}']);if(image.status!==0)throw Error('POSTGRES_IMAGE_UNAVAILABLE');
 attempted=true;
 const launch=docker(['run','-d','--pull=never','--name',name,'--label',`${label}=${owner}`,'--network','none','--memory','256m',
  '--mount','type=tmpfs,destination=/var/lib/postgresql/data','-e',`POSTGRES_PASSWORD=${randomBytes(32).toString('hex')}`,'postgres:16-alpine'],undefined,20000);
 launched=launch.status===0;if(!launched)throw Error('POSTGRES_START_UNAVAILABLE');
 const deadline=Date.now()+60000;let ready=false;
 while(Date.now()<deadline){if(docker(['exec',name,'pg_isready','-h','127.0.0.1','-U','postgres','-t','2'],undefined,4000).status===0){ready=true;break;}await new Promise(r=>setTimeout(r,500));}
 if(!ready)throw Error('POSTGRES_READINESS_UNAVAILABLE');
 const migrations=files.map(f=>readFileSync(f,'utf8')).join('\n');
 ok('006 through 011 rollback leaves no v3 schema',`BEGIN;${migrations}ROLLBACK;SELECT count(*) FROM pg_namespace WHERE nspname='highpass_v3';`,'0');
 ok('006 through 011 apply only in disposable fixture',`BEGIN;${migrations}COMMIT;`);
 ok('restricted nonowner role grants only fixture access',`CREATE ROLE hp_exchange_test NOSUPERUSER NOBYPASSRLS;
 GRANT USAGE ON SCHEMA highpass_v3 TO hp_exchange_test; GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA highpass_v3 TO hp_exchange_test;
 GRANT EXECUTE ON FUNCTION highpass_v3.valid_exchange_series(text[]) TO hp_exchange_test;
 SELECT NOT rolsuper AND NOT rolbypassrls FROM pg_roles WHERE rolname='hp_exchange_test';`,'t');
 ok('synthetic registry and explicit source ownership fixture',`
 INSERT INTO highpass_v3.tenants VALUES('${ta}','SYNTH-A','SYNTHETIC A','ACTIVE'),('${tb}','SYNTH-B','SYNTHETIC B','ACTIVE');
 INSERT INTO highpass_v3.hospitals(hospital_id,tenant_id,code) VALUES('${ha}','${ta}','A'),('${hb}','${tb}','B');
 INSERT INTO highpass_v3.patient_refs(patient_ref) VALUES('${pa}'),('${pb}'),('${other}');
 INSERT INTO highpass_v3.principal_bindings(actor_id,tenant_id,hospital_id,role,scopes,patient_ref) VALUES
 ('${aa}','${ta}','${ha}','HOSPITAL_ADMIN',ARRAY['exchange:create','exchange:read','audit:read'],NULL),
 ('${ab}','${tb}','${hb}','HOSPITAL_ADMIN',ARRAY['exchange:create','exchange:read','audit:read'],NULL),
 ('${patientActor}','${ta}','${ha}','PATIENT',ARRAY['exchange:create','exchange:read'],'${pa}'),
 ('${otherActor}','${ta}','${ha}','PATIENT',ARRAY['exchange:create','exchange:read'],'${other}');
 UPDATE highpass_v3.patient_refs SET owner_tenant_id='${ta}',owner_hospital_id='${ha}',registered_by='${aa}' WHERE patient_ref IN ('${pa}','${other}');
 UPDATE highpass_v3.patient_refs SET owner_tenant_id='${tb}',owner_hospital_id='${hb}',registered_by='${ab}' WHERE patient_ref='${pb}';
 INSERT INTO highpass_v3.patient_ref_registrations SELECT patient_ref,owner_tenant_id,owner_hospital_id,registered_by FROM highpass_v3.patient_refs;`);
 ok('owner fixture assembles A, B and patient-requested sessions',assembly(sa)+assembly(sb,{tenant:tb,hospital:hb,targetTenant:ta,targetHospital:ha,patient:pb,actor:ab})+assembly(sp,{actor:patientActor,initiation:'PATIENT_INITIATED'}));
 ok('A sees only active-source sessions and their four scopes',scoped(ta,ha,aa,'SELECT count(*) FROM highpass_v3.exchange_sessions;SELECT count(*) FROM highpass_v3.exchange_resource_scopes;'),'2\n4');
 ok('B invited to A sessions sees only its own source session',scoped(tb,hb,ab,'SELECT count(*) FROM highpass_v3.exchange_sessions;SELECT count(*) FROM highpass_v3.exchange_session_participants;'),'1\n1');
 ok('patient sees bound reference only and no admin audit',scoped(ta,ha,patientActor,'SELECT count(*) FROM highpass_v3.exchange_sessions;SELECT count(*) FROM highpass_v3.exchange_audit_outbox;'),'2\n0');
 ok('other patient same hospital sees no sessions',scoped(ta,ha,otherActor,'SELECT count(*) FROM highpass_v3.exchange_sessions;'),'0');
 ok('no context exposes zero sessions/scopes/results',`BEGIN;SET LOCAL ROLE hp_exchange_test;
 SELECT count(*) FROM highpass_v3.exchange_sessions;SELECT count(*) FROM highpass_v3.exchange_resource_scopes;SELECT count(*) FROM highpass_v3.exchange_write_results;COMMIT;`,'0\n0\n0');
 ok('ledger is actor-scoped and audit is hospital-admin scoped',scoped(ta,ha,aa,'SELECT count(*) FROM highpass_v3.exchange_write_results;SELECT count(*) FROM highpass_v3.exchange_audit_outbox;'),'1\n2');
 for(const omit of ['participants','scopes','audit','ledger'])deny(`incomplete ${omit} assembly cannot commit`,assembly(randomUUID(),{omit}),'23514');
 deny('recipient activation is not implied by named target',assembly(randomUUID(),{targetStatus:'ACTIVE'}),'23514');
 deny('wrong patient binding cannot create patient initiation',assembly(randomUUID(),{actor:otherActor,initiation:'PATIENT_INITIATED'}),'23514');
 deny('foreign owned PatientRef cannot be source rebound',assembly(randomUUID(),{patient:pb}),'23503');
 deny('empty Series selection cannot expand to whole Study',assembly(randomUUID(),{scope:'ARRAY[]::text[]'}),'23514');
 deny('duplicate Series cannot create ambiguous snapshot',assembly(randomUUID(),{scope:"ARRAY['1.2.3.1','1.2.3.1']"}),'23514');
 deny('raw invalid UID cannot enter snapshot',assembly(randomUUID(),{scope:"ARRAY['not-a-dicom-uid']"}),'23514');
 deny('application session INSERT remains fail closed before repository',scoped(ta,ha,aa,assembly(randomUUID()).replace(/^BEGIN;/,'').replace(/COMMIT;$/,'')),'42501');
 deny('application destination promotion remains forbidden',scoped(tb,hb,ab,`INSERT INTO highpass_v3.exchange_session_participants VALUES('${sa}','${pa}','${tb}','${hb}','DESTINATION','INVITED');`),'42501');
 deny('owner cannot alter immutable snapshot',`UPDATE highpass_v3.exchange_resource_scopes SET whole_study=true,series_instance_uids=NULL WHERE session_id='${sa}';`,'42501');
 deny('owner cannot append a Study after snapshot sealing',`INSERT INTO highpass_v3.exchange_resource_scopes VALUES('${sa}',3,'1.2.5',true,NULL);`,'23514');
 deny('owner cannot erase audit',`DELETE FROM highpass_v3.exchange_audit_outbox WHERE session_id='${sa}';`,'42501');
 deny('owner cannot erase retry ledger',`DELETE FROM highpass_v3.exchange_write_results WHERE session_id='${sa}';`,'42501');
 deny('owner cannot silently authorize foundation session',`UPDATE highpass_v3.exchange_sessions SET state='AUTHORIZED' WHERE session_id='${sa}';`,'42501');
 ok('suspend source institution fixture',`UPDATE highpass_v3.hospitals SET status='SUSPENDED' WHERE hospital_id='${ha}';`);
 ok('suspended hospital cannot read session/audit/results',scoped(ta,ha,aa,'SELECT count(*) FROM highpass_v3.exchange_sessions;SELECT count(*) FROM highpass_v3.exchange_audit_outbox;SELECT count(*) FROM highpass_v3.exchange_write_results;'),'0\n0\n0');
 deny('suspended target denies owner fixture assembly',assembly(randomUUID(),{tenant:tb,hospital:hb,targetTenant:ta,targetHospital:ha,patient:pb,actor:ab}),'23514');
 ok('all failed assemblies rolled back without orphan rows','SELECT count(*) FROM highpass_v3.exchange_sessions;SELECT count(*) FROM highpass_v3.exchange_resource_scopes;SELECT count(*) FROM highpass_v3.exchange_write_results;','3\n6\n3');
 summary={result:'PASS',scope:'P0-05 SCHEMA/OWNER FIXTURE + NONOWNER READ RLS ONLY / NOT SESSION SERVICE OR HTTP',imageId:image.stdout.trim(),results,
  notVerified:['authenticated Session creation repository and write policies','finite policy expiry/current-state locks and target registry authority',
   'canonical snapshot hash generation','concurrent durable idempotency/lost commit ACK','recipient approval/activation and clinical access','Session HTTP/runtime HTTPS/mTLS','full audit chain delivery']};
}catch(error){failed=true;summary={result:results.some(r=>r.result==='FAIL')?'FAIL':'NOT VERIFIED',reason:
 ['POSTGRES_IMAGE_UNAVAILABLE','POSTGRES_START_UNAVAILABLE','POSTGRES_READINESS_UNAVAILABLE','SCHEMA_ASSERTION_FAILED'].includes(error.message)?error.message:'SCHEMA_OR_ENVIRONMENT_FAILURE',results};
}finally{
 if(attempted){const inspected=docker(['inspect',name,'--format',`{{index .Config.Labels "${label}"}}`]);
  const removed=inspected.status===0&&inspected.stdout.trim()===owner?docker(['rm','-f','-v',name],undefined,20000):{status:1};
  cleanup=removed.status===0?'PASS':'NOT VERIFIED';if(cleanup!=='PASS')failed=true;}
 summary={...summary,cleanup,durationMs:Date.now()-began,generatedAt:new Date().toISOString(),sourceHashes:hash(),nodeVersion:process.version};
 summary.sourceUnchanged=JSON.stringify(initialHashes)===JSON.stringify(summary.sourceHashes);if(!summary.sourceUnchanged){summary.result='NOT VERIFIED';failed=true;}
 const directory=path.join('evidence','generated',`hp-v3-exchange-schema-${new Date().toISOString().replace(/[:.]/g,'-')}-${randomUUID().slice(0,8)}`);
 mkdirSync(directory,{recursive:true});const sourcePath=path.join(directory,'schema-check.json').replaceAll('\\','/');
 writeFileSync(sourcePath,JSON.stringify(summary,null,2)+'\n');
 const repositorySha=spawnSync('git',['rev-parse','HEAD'],{encoding:'utf8',windowsHide:true,timeout:5000}).stdout.trim();
 const manifest={repositorySha,containsPersonalData:false,containsSecrets:false,evidence:[{evidenceId:'v3-exchange-schema',sourcePath,
  sha256:createHash('sha256').update(readFileSync(sourcePath)).digest('hex'),repositorySha,reviewStatus:'DRAFT',reviewer:'UNASSIGNED',containsPersonalData:false,containsSecrets:false}]};
 writeFileSync(path.join(directory,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
 console.log(JSON.stringify(summary,null,2));console.log(JSON.stringify({evidenceDirectory:directory.replaceAll('\\','/'),reviewStatus:'DRAFT',reviewer:'UNASSIGNED'}));
 process.exitCode=failed?1:0;
}
