import {spawnSync} from 'node:child_process';
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {randomUUID,randomBytes,createHash} from 'node:crypto';
import {readCapstoneV3MigrationBundle,buildCapstoneV3BootstrapSql} from '../src/v3-capstone-migration-bundle.js';
import {buildCapstoneIdentityGrantsSql} from '../src/v3-capstone-identity-grants.js';
import {validateCapstoneSyntheticRegistry,buildCapstoneSyntheticRegistrySql} from '../src/v3-capstone-synthetic-registry.js';
import {buildCapstoneSourceExchangeActivationSql} from '../src/v3-capstone-source-exchange-profile.js';
import {startOwnedPostgresFixture,removeOwnedPostgresFixture} from './test-support/owned-postgres-start.js';
import {checkSessionPostgresHttp} from './test-support/v3-session-postgres-http-fixture.js';

// Local offline owned tmpfs PostgreSQL. No Azure connection, schema change or grant.
const target='highpass_v3_capstone_rehearsal',name='hp-v3-session-net-'+randomUUID(),owner=randomUUID();
const label='highpass.validation.session-network-schema',results=[],began=Date.now();let owned=false,diagnostic,cleanup='NOT VERIFIED';
const httpEnabled=process.argv.length===3&&process.argv[2]==='--http';
if(process.argv.length>2&&!httpEnabled)throw Error('REHEARSAL_ARGUMENT_INVALID');
const password=randomBytes(32).toString('hex');
const docker=(args,timeout=15000,input)=>spawnSync('docker',args,{input,encoding:'utf8',timeout,windowsHide:true,maxBuffer:262144});
const sql=(body,db=target)=>docker(['exec','-i',name,'psql','-X','-qAt','-v','ON_ERROR_STOP=1','-v','VERBOSITY=verbose','-U','postgres','-d',db],45000,
 "SET statement_timeout='3000ms';SET lock_timeout='1000ms';\n"+body);
function check(title,pass){results.push({name:title,status:pass?'PASS':'FAIL'});if(!pass)throw Error('SESSION_NETWORK_SCHEMA_ASSERTION_FAILED');}
function ok(title,body,expected='',db=target){const r=sql(body,db);if(r.status!==0)diagnostic={exitCode:r.status,sqlState:r.stderr?.match(/ERROR:\s+([0-9A-Z]{5}):/)?.[1]??null};
 check(title,r.status===0&&r.stdout.trim()===expected);}
function deny(title,body,expected){const r=sql(body);const code=r.stderr?.match(/ERROR:\s+([0-9A-Z]{5}):/)?.[1];
 if(r.status!==3||code!==expected)diagnostic={exitCode:r.status,sqlState:code??null};check(title,r.status===3&&code===expected);}
const a={tenant:'a1000000-1000-4000-8000-000000000001',hospital:'a2000000-1000-4000-8000-000000000001',actor:'a3000000-1000-4000-8000-000000000001'};
const context=(p=a)=>`SET ROLE hp_v3_app;BEGIN;SET LOCAL app.tenant_id='${p.tenant}';SET LOCAL app.hospital_id='${p.hospital}';SET LOCAL app.actor_id='${p.actor}';`;
const id=randomUUID(),audit=randomUUID(),trace='SYNTH_SESSION_SCHEMA_TRACE_001';
const domain=`INSERT INTO highpass_v3.exchange_audit_outbox(event_id,tenant_id,hospital_id,actor_id,audit_session_id,trace_id,action,result,reason_code)
 VALUES('${id}','${a.tenant}','${a.hospital}','${a.actor}','${audit}','${trace}','SESSION_DENIED','DENY','SESSION_NOT_FOUND');`;
function network(overrides={}){const v={id,tenant:a.tenant,hospital:a.hospital,actor:a.actor,audit,trace,ip:'127.0.0.1',mode:'CAPSTONE_IDENTITY_MTLS_SIGNED_PROXY',fp:"decode(repeat('ab',32),'hex')",time:'statement_timestamp()',...overrides};
 return `INSERT INTO highpass_v3.exchange_network_audit(event_id,tenant_id,hospital_id,actor_id,audit_session_id,trace_id,source_ip,ingress_mode,proxy_certificate_sha256,observed_at)
 VALUES('${v.id}','${v.tenant}','${v.hospital}','${v.actor}','${v.audit}','${v.trace}','${v.ip}','${v.mode}',${v.fp},${v.time});`;}
const files=['scripts/v3-session-network-schema-rehearsal.js','db/migrations/032_highpass_v3_exchange_network_audit.sql',
 'src/v3-capstone-migration-bundle.js','config/capstone-v3-migrations-20261009.json','src/v3-capstone-identity-grants.js',
 'src/v3-capstone-source-exchange-profile.js','src/v3-capstone-synthetic-registry.js','config/capstone-v3-synthetic-registry-20261009.json','scripts/test-support/owned-postgres-start.js'];
const hashes=()=>Object.fromEntries(files.map(f=>[f,createHash('sha256').update(readFileSync(f)).digest('hex')]));let initial;
try{
 const bundle=readCapstoneV3MigrationBundle({root:process.cwd(),manifest:JSON.parse(readFileSync(files[3],'utf8'))});
 files.push(...bundle.entries.map(e=>'db/migrations/'+e.file));initial=hashes();
 check('existing PostgreSQL image available without download',docker(['image','inspect','postgres:16-alpine','--format','{{.Id}}']).status===0);
 if(httpEnabled)files.push('scripts/test-support/v3-session-postgres-http-fixture.js',
  'src/v3-exchange-session-service.js','src/v3-exchange-read-service.js','src/v3-exchange-http-handler.js',
  'src/v3-exchange-network-audit.js','src/v3-exchange-audit.js','src/v3-identity-runtime-router.js',
  'src/v3-identity-secure-edge.js','src/v3-identity-network-context.js','src/v3-preauth-security-events.js');
 initial=hashes();
 const startup=startOwnedPostgresFixture({name,owner,label,password,mode:httpEnabled?'published':'none',docker});owned=startup.owned;
 check('only independently owned fixture started',owned&&startup.running);
 let ready=false;const until=Date.now()+45000;
 while(Date.now()<until){if(docker(['exec',name,'pg_isready','-U','postgres','-t','2'],4000).status===0){ready=true;break;}await new Promise(r=>setTimeout(r,500));}
 check('finite PostgreSQL readiness',ready);
 ok('separate fixture target created','CREATE DATABASE '+target+';','','postgres');
 ok('frozen baseline25 migrations applied only to fixture',buildCapstoneV3BootstrapSql(bundle,{targetDatabase:target}));
 const registry=validateCapstoneSyntheticRegistry(JSON.parse(readFileSync('config/capstone-v3-synthetic-registry-20261009.json','utf8')));
 ok('six synthetic principals enrolled',buildCapstoneSyntheticRegistrySql(registry,{targetDatabase:target}));
 ok('fixture safe roles created without credentials',['hp_v3_app','hp_v3_identity_preauth_writer','hp_v3_identity_preauth_reader'].map(r=>`CREATE ROLE ${r} LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION;`).join(''));
 ok('exact Identity role profile applied',buildCapstoneIdentityGrantsSql({targetDatabase:target}));
 const profile=buildCapstoneSourceExchangeActivationSql({targetDatabase:target});
 const r=sql(profile);check('exact source Session profile applied',r.status===0);
 const migration=readFileSync('db/migrations/032_highpass_v3_exchange_network_audit.sql','utf8');
 ok('schema32 rollback removes complete table and tuple constraint','BEGIN;SET LOCAL ROLE hp_v3_schema_owner;'+migration+
  "ROLLBACK;SELECT to_regclass('highpass_v3.exchange_network_audit') IS NULL;SELECT count(*) FROM pg_constraint WHERE conname='exchange_audit_network_tuple';",'t\n0');
 ok('schema32 applied under NOLOGIN owner only in fixture','BEGIN;SET LOCAL ROLE hp_v3_schema_owner;'+migration+'COMMIT;');
 ok('no grants implicitly created',"SELECT has_table_privilege('hp_v3_app','highpass_v3.exchange_network_audit','SELECT,INSERT,UPDATE,DELETE');",'f');
 ok('minimal network audit grants prepared only in fixture',`GRANT SELECT ON highpass_v3.exchange_network_audit TO hp_v3_app;
 GRANT INSERT(event_id,tenant_id,hospital_id,actor_id,audit_session_id,trace_id,source_ip,ingress_mode,proxy_certificate_sha256,observed_at)
 ON highpass_v3.exchange_network_audit TO hp_v3_app;`);
 ok('actual nonowner paired DENY inserts without audit read scope',context()+domain+network()+'COMMIT;');
 ok('requester cannot read network audit despite SQL SELECT grant',context()+'SELECT count(*) FROM highpass_v3.exchange_network_audit;ROLLBACK;','0');
 ok('no-context app sees no rows','SET ROLE hp_v3_app;SELECT count(*) FROM highpass_v3.exchange_network_audit;','0');
 for(const [title,overrides,code] of [['missing domain event',{id:randomUUID()},'23503'],['wrong correlation',{trace:'SYNTH_OTHER_TRACE_001'},'23503'],
   ['foreign tenant',{tenant:randomUUID()},'42501'],['wrong actor',{actor:randomUUID()},'42501'],['IP subnet',{ip:'127.0.0.1/24'},'23514'],
   ['wrong mode',{mode:'UNTRUSTED'},'23514'],['short fingerprint',{fp:"decode(repeat('ab',31),'hex')"},'23514'],
   ['stale provenance',{time:"statement_timestamp()-interval '11 seconds'"},'23514'],['infinite timestamp',{time:"'infinity'::timestamptz"},'23514']]){
  // Fresh event per negative test: existing primary-key collision must not mask
  // the specific RLS/FK/check constraint being verified.
  const negativeId=randomUUID();
  const parent=title==='missing domain event'?'':domain.replaceAll(id,negativeId);
  deny('network rejects '+title,context()+parent+network({...overrides,id:negativeId})+'COMMIT;',code);
 }
 deny('network update privilege absent',context()+"UPDATE highpass_v3.exchange_network_audit SET source_ip='127.0.0.2';COMMIT;",'42501');
 deny('network deletion privilege absent',context()+'DELETE FROM highpass_v3.exchange_network_audit;COMMIT;','42501');
 deny('immutable trigger rejects privileged update',"UPDATE highpass_v3.exchange_network_audit SET source_ip='127.0.0.2';",'42501');
 const second=randomUUID();deny('failed second write rolls back first domain INSERT',context()+domain.replaceAll(id,second)+network({id:second,trace:'SYNTH_OTHER_TRACE_001'})+'COMMIT;','23503');
 ok('failed pair leaves neither event',`SELECT count(*) FROM highpass_v3.exchange_audit_outbox WHERE event_id='${second}';SELECT count(*) FROM highpass_v3.exchange_network_audit WHERE event_id='${second}';`,'0\n0');
 ok('suspend source institution only in fixture',`UPDATE highpass_v3.hospitals SET status='SUSPENDED' WHERE hospital_id='${a.hospital}';`);
 deny('suspended institution cannot append network provenance',context()+network()+'COMMIT;','42501');
 ok('restore source institution only in fixture',`UPDATE highpass_v3.hospitals SET status='ACTIVE' WHERE hospital_id='${a.hospital}';`);
 ok('FORCE RLS and NOLOGIN owner retained',"SELECT c.relrowsecurity AND c.relforcerowsecurity AND r.rolname='hp_v3_schema_owner' AND NOT r.rolcanlogin FROM pg_class c JOIN pg_roles r ON r.oid=c.relowner WHERE c.oid='highpass_v3.exchange_network_audit'::regclass;",'t');
 if(httpEnabled){
  const port=docker(['port',name,'5432/tcp']);
  if(port.status!==0||!/^127\.0\.0\.1:[0-9]+$/.test(port.stdout.trim()))throw Error('LOOPBACK_FIXTURE_PORT_REQUIRED');
  await checkSessionPostgresHttp({port:Number(port.stdout.trim().split(':')[1]),password,target,registry,check});
 }
 check('source hashes unchanged',JSON.stringify(initial)===JSON.stringify(hashes()));
}catch(error){results.push({name:'execution',status:'FAIL',reason:error.message});}
finally{if(owned){const removed=removeOwnedPostgresFixture({name,owner,label,docker});cleanup=removed.absent?'PASS':'NOT VERIFIED';}}
const status=results.every(r=>r.status==='PASS')&&cleanup==='PASS'?'PASS':'FAIL';
const directory='artifacts/azure/v3-session-network-schema-local-'+new Date().toISOString().replaceAll(':','-');mkdirSync(directory,{recursive:true});
const result={status,review:'DRAFT / UNASSIGNED',scope:httpEnabled?'LOCAL OWNED POSTGRESQL + MTLS HTTP ONLY':'LOCAL OWNED OFFLINE POSTGRESQL ONLY',results,cleanup,durationMs:Date.now()-began,
 sourceHashes:initial,diagnostic,azureApply:'NOT EXECUTED',wholeMvp:'NOT ACHIEVED'};
writeFileSync(directory+'/result.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({...result,evidence:directory+'/result.json'},null,2));process.exitCode=status==='PASS'?0:1;
