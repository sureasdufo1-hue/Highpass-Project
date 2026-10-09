// Fresh owned tmpfs SQL only. No existing VM/cloud database, volume or identity writes.
import {spawn} from 'node:child_process';
import {randomBytes} from 'node:crypto';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import pg from 'pg';
import {PostgresStore} from '../src/postgres-store.js';
import {HipassService} from '../src/services.js';
import {registerPhantomCatalog,PHANTOM_DATASET_ID} from '../src/capstone-phantom-catalog.js';
import {preparePatientDatabase} from './lib/patient-database-preparation.js';
import {registerPatientPhantom} from './lib/patient-phantom-registration.js';
const runId=randomBytes(6).toString('hex'),name='hp-patient-registration-'+runId,password=randomBytes(32).toString('hex');
const checks=[],start=Date.now();let admin,store,ownedId,cleanup=false,phase='owned-database';
const docker=args=>new Promise((resolve,reject)=>{
  const child=spawn('docker',args,{env:{...process.env,POSTGRES_PASSWORD:password},windowsHide:true,stdio:['ignore','pipe','pipe']});let output='',done=false;
  const finish=error=>{if(done)return;done=true;clearTimeout(timer);error?reject(error):resolve(output.trim());};
  const timer=setTimeout(()=>{child.kill();finish(new Error('DOCKER_TIMEOUT'));},30000);
  child.stdout.on('data',chunk=>{output+=chunk;if(output.length>1048576){child.kill();finish(new Error('DOCKER_OUTPUT_LIMIT'));}});
  child.stderr.resume();child.on('error',finish);child.on('close',code=>finish(code===0?undefined:new Error('DOCKER_FAILED')));
});
try{
  const image=await docker(['inspect','hipass-postgres','--format','{{.Image}}']);assert.match(image,/^sha256:[a-f0-9]{64}$/);
  ownedId=await docker(['run','--rm','-d','--name',name,'--label','highpass.purpose=isolated-patient-registration','--tmpfs','/var/lib/postgresql/data:rw,size=256m','-e','POSTGRES_PASSWORD','-p','127.0.0.1::5432',image]);
  const port=Number(await docker(['inspect',ownedId,'--format','{{(index (index .NetworkSettings.Ports "5432/tcp") 0).HostPort}}']));
  const deadline=Date.now()+45000;
  while(!admin && Date.now()<deadline){
    const c=new pg.Client({host:'127.0.0.1',port,user:'postgres',password,database:'postgres',connectionTimeoutMillis:1500,statement_timeout:5000,query_timeout:6000});c.on('error',()=>{});
    try{await c.connect();await c.query('SELECT 1');admin=c;}catch{await c.end().catch(()=>{});await new Promise(r=>setTimeout(r,200));}
  }
  assert.ok(admin,'DATABASE_READINESS_TIMEOUT');
  const uri=`postgresql://postgres:${password}@127.0.0.1:${port}/postgres`;
  store=new PostgresStore(uri);await store.load();
  const service=new HipassService(store);
  await registerPhantomCatalog({service,principal:{role:'SECURITY_ADMIN',hospitalId:'HOSP-A',actorId:'synthetic-source-admin'},input:{datasetId:PHANTOM_DATASET_ID},env:{HIPASS_CAPSTONE_PHANTOM_CATALOG:'1',HIPASS_CAPSTONE_MOCK_IDP:'1',HIPASS_CONTROL_PLANE_ONLY:'1',HIPASS_STORE:'postgres',NODE_ENV:'production',AUTH_MODE:'TEST'}});
  assert.equal(service.verifyAuditIntegrity().ok,true);await store.close();store=undefined;
  await preparePatientDatabase(admin,{password:randomBytes(32).toString('hex'),apply:true});
  const counts=async()=> (await admin.query('SELECT (SELECT count(*)::int FROM capstone_patient_accounts) AS accounts,(SELECT count(*)::int FROM capstone_patient_ownership_refs) AS refs,(SELECT count(*)::int FROM audit_logs) AS audit')).rows[0];
  const baseline=await counts();
  phase='active-writer';
  const writerDdl=(await admin.query("SELECT format('CREATE ROLE hipass_app LOGIN PASSWORD %L',$1::text) AS statement",[password])).rows[0].statement;await admin.query(writerDdl);
  const writer=new pg.Client({host:'127.0.0.1',port,user:'hipass_app',password,database:'postgres',connectionTimeoutMillis:1500,query_timeout:6000});writer.on('error',()=>{});
  try{await writer.connect();await assert.rejects(registerPatientPhantom(admin,{datasetId:PHANTOM_DATASET_ID,apply:true}),/WRITERS_MUST_STOP/);assert.deepEqual(await counts(),baseline);}
  finally{await writer.end();}
  checks.push('CONNECTED_APP_WRITER_DENIED_NO_SIDE_EFFECT');
  phase='rollback-only';assert.equal((await registerPatientPhantom(admin,{datasetId:PHANTOM_DATASET_ID})).applied,false);assert.deepEqual(await counts(),baseline);
  checks.push('REAL_SQL_PREFLIGHT_NO_ACCOUNT_REF_OR_AUDIT_CHANGE');
  phase='catalog-negative';
  await admin.query("UPDATE imaging_series SET instance_count=11 WHERE series_instance_uid='1.2.826.0.1.3680043.10.5432.20261009.1.1'");
  await assert.rejects(registerPatientPhantom(admin,{datasetId:PHANTOM_DATASET_ID,apply:true}),/CATALOG_MISMATCH/);assert.deepEqual(await counts(),baseline);
  await admin.query("UPDATE imaging_series SET instance_count=12 WHERE series_instance_uid='1.2.826.0.1.3680043.10.5432.20261009.1.1'");
  checks.push('CATALOG_MISMATCH_DENIED_NO_AUTHORITY_OR_AUDIT_SIDE_EFFECT');
  phase='series-parent-negative';
  await admin.query("UPDATE imaging_series SET study_instance_uid='1.2.826.0.1.3680043.10.5432.20261009.2' WHERE series_instance_uid='1.2.826.0.1.3680043.10.5432.20261009.1.1'");
  await assert.rejects(registerPatientPhantom(admin,{datasetId:PHANTOM_DATASET_ID,apply:true}),/CATALOG_MISMATCH/);assert.deepEqual(await counts(),baseline);
  await admin.query("UPDATE imaging_series SET study_instance_uid='1.2.826.0.1.3680043.10.5432.20261009.1' WHERE series_instance_uid='1.2.826.0.1.3680043.10.5432.20261009.1.1'");
  checks.push('WRONG_SERIES_PARENT_DENIED_NO_AUTHORITY_OR_AUDIT_SIDE_EFFECT');
  phase='audit-failure';
  const failedClient={query:(text,values)=>text.includes('INSERT INTO audit_logs')?Promise.reject(new Error('SIMULATED_AUDIT_FAILURE')):admin.query(text,values)};
  await assert.rejects(registerPatientPhantom(failedClient,{datasetId:PHANTOM_DATASET_ID,apply:true}),/SIMULATED_AUDIT_FAILURE/);assert.deepEqual(await counts(),baseline);
  checks.push('REAL_SQL_ACCOUNT_AND_TWO_REFS_ROLLBACK_ON_AUDIT_FAILURE');
  phase='explicit-registration';
  assert.equal((await registerPatientPhantom(admin,{datasetId:PHANTOM_DATASET_ID,apply:true})).applied,true);
  assert.deepEqual(await counts(),{accounts:baseline.accounts+1,refs:baseline.refs+2,audit:baseline.audit+1});
  const registered=await counts();await assert.rejects(registerPatientPhantom(admin,{datasetId:PHANTOM_DATASET_ID,apply:true}),/EXISTING_STATE_PRESERVED/);assert.deepEqual(await counts(),registered);
  checks.push('ONE_ACCOUNT_TWO_REFS_ONE_AUDIT_COMMITTED_REAPPLY_DENIED');
  phase='audit-reload';
  const audit=await PostgresStore.prototype.readTable.call({client:admin},'auditLogs');
  assert.equal(HipassService.prototype.verifyAuditIntegrity.call({store:{get:()=>audit}}).ok,true);
  checks.push('PERSISTED_LEGACY_HASH_CHAIN_VALID');
}catch(error){process.exitCode=1;checks.push('FAIL:'+phase+':'+(/^[A-Z_]+$/.test(error.message)?error.message:error.code??error.name));}
finally{
  await store?.close().catch(()=>{process.exitCode=1;});await admin?.end().catch(()=>{process.exitCode=1;});
  if(ownedId)try{
    const row=JSON.parse(await docker(['inspect',ownedId]))[0];assert.equal(row.Name,'/'+name);assert.equal(row.Config.Labels['highpass.purpose'],'isolated-patient-registration');assert.equal(row.Mounts.length,0);assert.equal(row.HostConfig.AutoRemove,true);
    await docker(['stop','--timeout','3',ownedId]);
    // --rm deletion may finish after docker stop acknowledges termination.
    const deadline=Date.now()+10000;
    while(Date.now()<deadline){if(await docker(['ps','-aq','--filter','name=^'+name+'$'])===''){cleanup=true;break;}await new Promise(resolve=>setTimeout(resolve,200));}
    assert.equal(cleanup,true);
  }catch{process.exitCode=1;checks.push('OWNED_CLEANUP_NOT_VERIFIED');}
  const result={status:process.exitCode?'FAIL':'PASS',review:'DRAFT / UNASSIGNED',scope:'isolated synthetic SQL registration only; no actual PACS, Vault, browser or public deployment test',checks,cleanup,elapsedMs:Date.now()-start};
  const directory='artifacts/workstation/'+name;await mkdir(directory,{recursive:true});await writeFile(directory+'/result.json',JSON.stringify(result,null,2));console.log(JSON.stringify({...result,evidence:directory+'/result.json'}));
}
