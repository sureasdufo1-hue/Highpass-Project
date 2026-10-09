import {spawnSync} from 'node:child_process';
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {randomUUID,randomBytes,createHash} from 'node:crypto';
import path from 'node:path';
import {readCapstoneV3MigrationBundle,capstoneV3PolicyRoles,buildCapstoneV3BootstrapSql} from '../src/v3-capstone-migration-bundle.js';
import {startOwnedPostgresFixture,removeOwnedPostgresFixture,observeOwnedFixtureAbsence} from './test-support/owned-postgres-start.js';
import {buildCapstoneIdentityGrantsSql} from '../src/v3-capstone-identity-grants.js';
import {validateCapstoneSyntheticRegistry,buildCapstoneSyntheticRegistrySql} from '../src/v3-capstone-synthetic-registry.js';

// Offline, network-none, owned disposable PostgreSQL only. Never a cloud deploy.
const name='hp-v3-deploy-'+randomUUID(),owner=randomUUID(),label='highpass.validation.migration-rehearsal';
const target='highpass_v3_capstone_rehearsal',password=randomBytes(32).toString('hex');
const results=[],began=Date.now();let started=false,summary,dumpObservation,sqlFailureObservation,cleanup='NOT VERIFIED';
const sources=['src/v3-capstone-migration-bundle.js','config/capstone-v3-migrations-20261009.json',
 'scripts/v3-capstone-migration-rehearsal.js','scripts/test-support/owned-postgres-start.js','src/v3-capstone-identity-grants.js',
 'src/v3-capstone-synthetic-registry.js','config/capstone-v3-synthetic-registry-20261009.json'];
const hash=()=>Object.fromEntries(sources.map(file=>[file,createHash('sha256').update(readFileSync(file)).digest('hex')]));
const initial=hash();
const docker=(args,timeout=15000,input,maxBuffer=262144)=>spawnSync('docker',args,{input,encoding:'utf8',timeout,windowsHide:true,maxBuffer});
const sql=(body,db=target)=>docker(['exec','-i',name,'psql','-X','-qAt','-v','ON_ERROR_STOP=1','-v','VERBOSITY=verbose','-U','postgres','-d',db],60000,
 "SET statement_timeout='3000ms';SET lock_timeout='1000ms';\n"+body);
function check(name,pass){results.push({name,result:pass?'PASS':'FAIL'});if(!pass)throw Error('MIGRATION_REHEARSAL_ASSERTION_FAILED');}
function ok(name,body,expected='',db=target){const r=sql(body,db);const pass=r.status===0&&r.stdout.trim()===expected;
 if(!pass)sqlFailureObservation={exitCode:r.status??null,errorCode:r.error?.code??null,signal:r.signal??null,
 sqlState:r.stderr?.match(/ERROR:\s+([0-9A-Z]{5}):/)?.[1]??null,outputBytes:Buffer.byteLength(r.stdout??''),stderrBytes:Buffer.byteLength(r.stderr??'')};
 check(name,pass);}
function deny(name,body,code){const r=sql(body);check(name,r.status===3&&r.stderr.match(/ERROR:\s+([0-9A-Z]{5}):/)?.[1]===code);}
const policyNames=capstoneV3PolicyRoles.map(name=>"'"+name+"'").join(',');
const absence=`SELECT count(*) FROM pg_namespace WHERE nspname='highpass_v3'; SELECT count(*) FROM pg_roles WHERE rolname IN (${policyNames});`;
const guard=`DO $$ BEGIN
 IF current_database()<>'${target}' THEN RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='TARGET_NOT_OWNED'; END IF;
 PERFORM pg_advisory_xact_lock(194716031);
 IF EXISTS(SELECT 1 FROM pg_namespace WHERE nspname='highpass_v3')
 OR EXISTS(SELECT 1 FROM pg_roles WHERE rolname IN (${policyNames}))
 THEN RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='TARGET_COLLISION'; END IF;
 END $$;`;
try{
 const manifest=JSON.parse(readFileSync('config/capstone-v3-migrations-20261009.json','utf8'));
 const bundle=readCapstoneV3MigrationBundle({root:process.cwd(),manifest});
 sources.push(...bundle.entries.map(entry=>'db/migrations/'+entry.file));
 Object.assign(initial,hash());
 const image=docker(['image','inspect','postgres:16-alpine','--format','{{.Id}}']);if(image.status!==0)throw Error('POSTGRES_IMAGE_UNAVAILABLE');
 const startup=startOwnedPostgresFixture({name,owner,label,password,mode:'none',docker});started=startup.owned;
 if(!started)throw Error('OWNED_POSTGRES_START_NOT_VERIFIED');
 let ready=false;const until=Date.now()+45000;
 while(Date.now()<until){if(docker(['exec',name,'pg_isready','-U','postgres','-t','2'],4000).status===0){ready=true;break;}
  await new Promise(resolve=>setTimeout(resolve,500));}
 if(!ready)throw Error('POSTGRES_READINESS_NOT_VERIFIED');
 ok('independent legacy sentinel is prepared only in owned fixture',
  "CREATE TABLE public.legacy_preservation_sentinel(value text PRIMARY KEY);INSERT INTO public.legacy_preservation_sentinel VALUES('SYNTHETIC_LEGACY_ONLY');",'', 'postgres');
 ok('previously absent separate target created without touching legacy database','CREATE DATABASE '+target+';','','postgres');
 const bootstrap=buildCapstoneV3BootstrapSql(bundle,{targetDatabase:target});
 ok('exact cloud bootstrap including owner and ledger rolls back atomically',bootstrap.slice(0,bootstrap.lastIndexOf('COMMIT;'))+'ROLLBACK;'+absence+
  "SELECT count(*) FROM pg_roles WHERE rolname='hp_v3_schema_owner';",'0\n0\n0');
 deny('cloud bootstrap failure before COMMIT rolls back DDL ledger and ownership',
  bootstrap.slice(0,bootstrap.lastIndexOf('COMMIT;'))+'SELECT 1/0;COMMIT;','22012');
 ok('failed atomic owner bootstrap leaves no schema policy or owner role',absence+"SELECT count(*) FROM pg_roles WHERE rolname='hp_v3_schema_owner';",'0\n0\n0');
 const statements=bundle.entries.map(entry=>entry.sql).join('\n');
 ok('exact25 frozen migration bundle rollback removes schema and cluster-global policy roles','BEGIN;'+guard+statements+'ROLLBACK;'+absence,'0\n0');
 deny('failure after role creation and partial DDL aborts whole migration transaction',
  'BEGIN;'+guard+bundle.entries.slice(0,20).map(entry=>entry.sql).join('\n')+'SELECT 1/0;COMMIT;','22012');
 ok('mid-batch failure leaves no partial schema or created policy roles',absence,'0\n0');
 ok('connection exit without COMMIT implicitly rolls back complete bundle','BEGIN;'+guard+statements);
 ok('uncommitted disconnected migration leaves no schema or roles',absence,'0\n0');
 ok('fixture-only existing policy role is prepared for collision test','CREATE ROLE hp_v3_clinical_policy NOLOGIN NOSUPERUSER NOBYPASSRLS;');
 deny('role collision fails before DDL instead of silently reusing existing role','BEGIN;'+guard+statements+'COMMIT;','P0001');
 ok('collision preserves pre-existing role and creates no schema',absence,'0\n1');
 ok('only fixture-created collision role removed','DROP ROLE hp_v3_clinical_policy;');
 const ledger=`CREATE TABLE highpass_v3.deployment_migrations(
  sequence integer PRIMARY KEY,file_name text NOT NULL UNIQUE,sha256 text NOT NULL CHECK(sha256~'^[a-f0-9]{64}$'),
  bundle_sha256 text NOT NULL CHECK(bundle_sha256~'^[a-f0-9]{64}$'),
  scope text NOT NULL CHECK(scope='CAPSTONE_SYNTHETIC_ONLY'),recorded_at timestamptz NOT NULL DEFAULT statement_timestamp());
  ALTER TABLE highpass_v3.deployment_migrations ENABLE ROW LEVEL SECURITY;
  ALTER TABLE highpass_v3.deployment_migrations FORCE ROW LEVEL SECURITY;
  REVOKE ALL ON highpass_v3.deployment_migrations FROM PUBLIC;
  CREATE TRIGGER deployment_migrations_immutable BEFORE UPDATE OR DELETE ON highpass_v3.deployment_migrations
   FOR EACH ROW EXECUTE FUNCTION highpass_v3.reject_identity_audit_mutation();
  INSERT INTO highpass_v3.deployment_migrations(sequence,file_name,sha256,bundle_sha256,scope) VALUES `+
  bundle.entries.map((entry,index)=>`(${index+1},'${entry.file}','${entry.sha256}','${bundle.digest}','CAPSTONE_SYNTHETIC_ONLY')`).join(',')+';';
 ok('full bundle and checksum ledger commit atomically','BEGIN;'+guard+statements+ledger+'COMMIT;');
 const observed=sql('SELECT file_name||\'|\'||sha256||\'|\'||bundle_sha256 FROM highpass_v3.deployment_migrations ORDER BY sequence;');
 check('installed ledger matches every frozen file digest and exact bundle order',observed.status===0
  &&observed.stdout.trim()===bundle.entries.map(entry=>entry.file+'|'+entry.sha256+'|'+bundle.digest).join('\n'));
 deny('same bundle rerun is collision not false idempotent success','BEGIN;'+guard+statements+'COMMIT;','P0001');
 ok('collision rerun preserves original ledger count','SELECT count(*) FROM highpass_v3.deployment_migrations;','25');
 deny('checksum ledger UPDATE denied even to migration administrator',"UPDATE highpass_v3.deployment_migrations SET scope='CAPSTONE_SYNTHETIC_ONLY';",'42501');
 deny('checksum ledger DELETE denied even to migration administrator','DELETE FROM highpass_v3.deployment_migrations;','42501');
 ok('all eight policy roles remain NOLOGIN non-superuser no-bypass',`SELECT count(*) FROM pg_roles WHERE rolname IN (${policyNames}) AND NOT rolcanlogin AND NOT rolsuper AND NOT rolbypassrls;`,'8');
 ok('dedicated NOLOGIN schema owner created in owned fixture only','CREATE ROLE hp_v3_schema_owner NOLOGIN NOSUPERUSER NOBYPASSRLS NOCREATEROLE NOCREATEDB NOREPLICATION;');
 ok('ownership transferred only for objects inside new v3 namespace',`BEGIN;
 DO $$ DECLARE item record; BEGIN
 FOR item IN SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='highpass_v3' AND c.relkind IN ('r','p')
 LOOP EXECUTE format('ALTER TABLE highpass_v3.%I OWNER TO hp_v3_schema_owner',item.relname); END LOOP;
 FOR item IN SELECT p.oid::regprocedure signature FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='highpass_v3'
 LOOP EXECUTE format('ALTER FUNCTION %s OWNER TO hp_v3_schema_owner',item.signature); END LOOP;
 END $$;
 ALTER SCHEMA highpass_v3 OWNER TO hp_v3_schema_owner;COMMIT;`);
 ok('all v3 table/function/schema ownership is dedicated NOLOGIN role',`SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname='highpass_v3' AND c.relkind IN ('r','p') AND c.relowner<>(SELECT oid FROM pg_roles WHERE rolname='hp_v3_schema_owner');
 SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='highpass_v3' AND p.proowner<>(SELECT oid FROM pg_roles WHERE rolname='hp_v3_schema_owner');
 SELECT count(*) FROM pg_namespace WHERE nspname='highpass_v3' AND nspowner<>(SELECT oid FROM pg_roles WHERE rolname='hp_v3_schema_owner');`,'0\n0\n0');
 // Dump text is intentionally larger than tiny psql status output. Retain a
 const registry=validateCapstoneSyntheticRegistry(JSON.parse(readFileSync('config/capstone-v3-synthetic-registry-20261009.json','utf8')));
 const seed=buildCapstoneSyntheticRegistrySql(registry,{targetDatabase:target});
 const registryCounts='SELECT count(*) FROM highpass_v3.tenants;SELECT count(*) FROM highpass_v3.hospitals;SELECT count(*) FROM highpass_v3.principal_bindings;';
 ok('exact synthetic directory seed rollback leaves no authority records',seed.slice(0,seed.lastIndexOf('COMMIT;'))+'ROLLBACK;'+registryCounts,'0\n0\n0');
 deny('synthetic directory mid-write failure rolls back all6 principal bindings',seed.slice(0,seed.lastIndexOf('COMMIT;'))+'SELECT 1/0;COMMIT;','22012');
 ok('failed registry enrollment preserves empty authority tables',registryCounts,'0\n0\n0');
 ok('synthetic A B directory and six minimal principals commit atomically',seed+registryCounts,'2\n2\n6');
 deny('existing registry is not silently overwritten or privilege-upserted',seed,'P0001');
 ok('directory preparation grants no patient mapping or patient consent',
  "SELECT count(*) FROM highpass_v3.patient_refs;SELECT count(*) FROM highpass_v3.patient_mappings;SELECT count(*) FROM highpass_v3.principal_bindings WHERE role='PATIENT';",'0\n0\n0');
 // Export includes the newly registered synthetic directory, never real identity.
 // finite2MiB bound only here; never store or print the raw synthetic dump.
 const dump=docker(['exec',name,'pg_dump','-U','postgres','-d',target,'--no-owner','--no-privileges'],20000,undefined,2*1024*1024);
 dumpObservation={exitCode:dump.status??null,errorCode:dump.error?.code??null,signal:dump.signal??null,
  outputBytes:Buffer.byteLength(dump.stdout??''),stderrBytes:Buffer.byteLength(dump.stderr??'')};
 check('owned schema and synthetic checksum ledger exported by bounded pg_dump in memory only',dump.status===0&&dump.stdout.length>0);
 const restoreTarget='highpass_v3_restore_rehearsal';
 ok('restore rehearsal uses a previously absent independent owned database','CREATE DATABASE '+restoreTarget+';','','postgres');
 ok('actual pg_dump snapshot restores with existing cluster policy roles',dump.stdout,'',restoreTarget);
 ok('restored immutable ledger matches complete frozen bundle',
  'SELECT file_name||\'|\'||sha256||\'|\'||bundle_sha256 FROM highpass_v3.deployment_migrations ORDER BY sequence;',
  bundle.entries.map(entry=>entry.file+'|'+entry.sha256+'|'+bundle.digest).join('\n'),restoreTarget);
 const deleteRestored=sql('DELETE FROM highpass_v3.deployment_migrations;',restoreTarget);
 check('restored checksum ledger retains immutable deletion trigger',deleteRestored.status===3
  &&deleteRestored.stderr.match(/ERROR:\s+([0-9A-Z]{5}):/)?.[1]==='42501');
 ok('legacy database sentinel and namespace remain unchanged after v3 apply',"SELECT value FROM public.legacy_preservation_sentinel;SELECT count(*) FROM pg_namespace WHERE nspname='highpass_v3';",'SYNTHETIC_LEGACY_ONLY\n0','postgres');
 const grants=buildCapstoneIdentityGrantsSql({targetDatabase:target});
 deny('profile refuses missing runtime logins before any grant',grants,'P0001');
 ok('three credential-free test logins created only in owned network-none fixture',
  'CREATE ROLE hp_v3_app LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION;'+
  'CREATE ROLE hp_v3_identity_preauth_writer LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION;'+
  'CREATE ROLE hp_v3_identity_preauth_reader LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION;');
 ok('runtime grant transaction rollback preserves pristine roles',grants.slice(0,grants.lastIndexOf('COMMIT;'))+
  "ROLLBACK;SELECT count(*) FROM pg_auth_members WHERE member=(SELECT oid FROM pg_roles WHERE rolname='hp_v3_app');",'0');
 ok('named Identity-only nonowner grant profile commits',grants);
 deny('reusing nonpristine role is refused without widening existing grants',grants,'P0001');
 ok('clinical named Identity reads permitted but no context leaks no rows',
  'SET ROLE hp_v3_app;SELECT count(*) FROM highpass_v3.patient_mappings;','0');
 const tenant='22222222-2222-4222-8222-222222222222',hospital='33333333-3333-4333-8333-333333333333',actor='44444444-4444-4444-8444-444444444444';
 ok('explicit synthetic directory seed is fixture-only and not patient approval',
  `INSERT INTO highpass_v3.tenants(tenant_id,code,display_name) VALUES('${tenant}','SYNTH-GRANTS','SYNTHETIC GRANT FIXTURE');
   INSERT INTO highpass_v3.hospitals(hospital_id,tenant_id,code) VALUES('${hospital}','${tenant}','SYNTH-GRANTS');
   INSERT INTO highpass_v3.principal_bindings(actor_id,tenant_id,hospital_id,role,scopes)
   VALUES('${actor}','${tenant}','${hospital}','HOSPITAL_ADMIN',ARRAY['mapping:read','mapping:write']);`);
 const context=`SET ROLE hp_v3_app;BEGIN;SET LOCAL app.tenant_id='${tenant}';SET LOCAL app.hospital_id='${hospital}';SET LOCAL app.actor_id='${actor}';`;
 ok('nonowner clinical principal and directory FOR SHARE works with named lock columns',context+
  `SELECT p.actor_id FROM highpass_v3.principal_bindings p JOIN highpass_v3.tenants t USING(tenant_id)
   JOIN highpass_v3.hospitals h ON h.hospital_id=p.hospital_id AND h.tenant_id=p.tenant_id
   WHERE p.actor_id='${actor}' FOR SHARE OF p,t,h;ROLLBACK;`,actor);
 deny('lock permission does not permit tenant status mutation',context+"UPDATE highpass_v3.tenants SET status='REVOKED';COMMIT;",'42501');
 ok('owner ref registration and safe audit append work under actual nonowner grants',context+
  `INSERT INTO highpass_v3.patient_refs(patient_ref,owner_tenant_id,owner_hospital_id,registered_by)
   VALUES('55555555-5555-4555-8555-555555555555','${tenant}','${hospital}','${actor}');
   INSERT INTO highpass_v3.patient_ref_registrations(patient_ref,tenant_id,hospital_id,registered_by)
   VALUES('55555555-5555-4555-8555-555555555555','${tenant}','${hospital}','${actor}');
   INSERT INTO highpass_v3.identity_audit_outbox(event_id,tenant_id,hospital_id,actor_id,audit_session_id,trace_id,action,result,reason_code,patient_ref)
   VALUES('66666666-6666-4666-8666-666666666666','${tenant}','${hospital}','${actor}',
   '77777777-7777-4777-8777-777777777777','SYNTH_GRANT_TRACE_001','PATIENT_REF_CREATED','ALLOW','PATIENT_REF_REGISTERED','55555555-5555-4555-8555-555555555555');COMMIT;`);
 deny('clinical cannot read deployment ledger','SET ROLE hp_v3_app;SELECT * FROM highpass_v3.deployment_migrations;','42501');
 deny('clinical cannot enter Exchange domain','SET ROLE hp_v3_app;SELECT * FROM highpass_v3.exchange_sessions;','42501');
 deny('clinical cannot read actorless security stream','SET ROLE hp_v3_app;SELECT * FROM highpass_v3.preauth_security_events;','42501');
 deny('publisher cannot read its appended records','SET ROLE hp_v3_identity_preauth_writer;SELECT * FROM highpass_v3.preauth_security_events;','42501');
 ok('publisher can append permitted denial and separate reader sees it',
  "SET ROLE hp_v3_identity_preauth_writer;INSERT INTO highpass_v3.preauth_security_events(event_id,observed_at,scope,stage,reason_code,result,source_kind)"+
  " VALUES('11111111-1111-4111-8111-111111111111',statement_timestamp(),'CAPSTONE_SYNTHETIC_ONLY','INGRESS','INGRESS_REJECTED','DENY','IMMEDIATE_SOCKET');"+
  'RESET ROLE;SET ROLE hp_v3_identity_preauth_reader;SELECT count(*) FROM highpass_v3.preauth_security_events;','1');
 deny('reader cannot append','SET ROLE hp_v3_identity_preauth_reader;INSERT INTO highpass_v3.preauth_security_events DEFAULT VALUES;','42501');
 deny('publisher cannot delete immutable security records','SET ROLE hp_v3_identity_preauth_writer;DELETE FROM highpass_v3.preauth_security_events;','42501');
 deny('reader cannot see clinical patient refs','SET ROLE hp_v3_identity_preauth_reader;SELECT * FROM highpass_v3.patient_refs;','42501');
 summary={result:'PASS',scope:'OWNED NETWORK-NONE PG16 FULL DDL BUNDLE OWNERSHIP AND IDENTITY GRANTS REHEARSAL ONLY',imageId:image.stdout.trim(),bundleSha256:bundle.digest,
  migrationCount:bundle.entries.length,backupSha256:createHash('sha256').update(dump.stdout).digest('hex'),backupStored:false,
  restoreScope:'owned schema plus synthetic ledger; existing global policy roles; no owner/ACL restoration claim',
  results,notVerified:['cloud migration/backup/restore','runtime enrollment and least-privilege login grants','service activation','combined business-flow authorization after deployment','distributed MVP']};
}catch(error){summary={result:results.some(row=>row.result==='FAIL')?'FAIL':'NOT VERIFIED',reason:
 ['MIGRATION_REHEARSAL_ASSERTION_FAILED','POSTGRES_IMAGE_UNAVAILABLE','OWNED_POSTGRES_START_NOT_VERIFIED','POSTGRES_READINESS_NOT_VERIFIED','V3_MIGRATION_MANIFEST_NOT_VERIFIED'].includes(error.message)
 ?error.message:'MIGRATION_REHEARSAL_NOT_VERIFIED',results};}
finally{
 if(started){const removed=removeOwnedPostgresFixture({name,owner,label,docker});
  const followup=!removed.absent&&removed.owned?await observeOwnedFixtureAbsence({name,owner,label,docker}):null;
  cleanup=removed.absent||followup?.absent?'PASS':'NOT VERIFIED';}
 if(cleanup!=='PASS'&&summary.result==='PASS')summary.result='NOT VERIFIED';
 summary={...summary,dumpObservation,sqlFailureObservation,cleanup,durationMs:Date.now()-began,generatedAt:new Date().toISOString(),sourceHashes:hash()};
 summary.sourceUnchanged=JSON.stringify(initial)===JSON.stringify(summary.sourceHashes);if(!summary.sourceUnchanged)summary.result='NOT VERIFIED';
 const directory=path.join('evidence','generated','hp-v3-migration-'+new Date().toISOString().replace(/[:.]/g,'-')+'-'+randomUUID().slice(0,8));
 mkdirSync(directory,{recursive:true});const sourcePath=path.join(directory,'rehearsal.json').replaceAll('\\','/');writeFileSync(sourcePath,JSON.stringify(summary,null,2)+'\n');
 const repositorySha=spawnSync('git',['rev-parse','HEAD'],{encoding:'utf8',timeout:5000,windowsHide:true}).stdout.trim();
 const manifest={repositorySha,containsSecrets:false,containsPersonalData:false,evidence:[{evidenceId:'v3-capstone-migration-rehearsal',sourcePath,
  sha256:createHash('sha256').update(readFileSync(sourcePath)).digest('hex'),repositorySha,reviewStatus:'DRAFT',reviewer:'UNASSIGNED',containsSecrets:false,containsPersonalData:false}]};
 writeFileSync(path.join(directory,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
 console.log(JSON.stringify(summary,null,2));console.log(JSON.stringify({evidenceDirectory:directory.replaceAll('\\','/')}));
 process.exitCode=summary.result==='PASS'?0:1;
}
