// Generated isolated Compose fixture; never points at a deployed project/secret.
import {execFileSync} from 'node:child_process';
import {mkdtemp,writeFile,unlink,rmdir,mkdir,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {randomBytes} from 'node:crypto';
import assert from 'node:assert/strict';

const project='hp-patient-startup-'+randomBytes(6).toString('hex');
const image=process.env.HIPASS_PATIENT_STARTUP_IMAGE??'highpass-platform-mvp:capstone-patient-startup-20261009';
const files=[],checks=[];let directory,env,override,stage='preflight',cleanup=false,imageId;
const start=Date.now();
const docker=(args,options={})=>execFileSync('docker',args,{encoding:'utf8',timeout:60000,stdio:['pipe','pipe','pipe'],...options}).trim();
const compose=(args,patient=false)=>docker(['compose','--project-name',project,'-f','infra/azure/capstone-control.compose.yml',
  '-f','infra/azure/capstone-patient-preparation.compose.yml',...(patient?['-f','infra/azure/capstone-control-patient.compose.yml']:[]),
  '-f',override,'--profile','patient-preparation',...args],{env});
const write=async(name,value)=>{const file=path.join(directory,name);await writeFile(file,value,{mode:0o600});files.push(file);return file;};
// Fixture catalog only: reuse the approved fixed synthetic operator, never SQL
// metadata/ownership seeding. This is not an HTTP authentication/browser test.
const catalogFixture=`import {readFileSync} from 'node:fs';
import {PostgresStore} from './src/postgres-store.js';import {HipassService} from './src/services.js';
import {registerPhantomCatalog,PHANTOM_DATASET_ID} from './src/capstone-phantom-catalog.js';
let store;try{const password=readFileSync('/run/secrets/app-password','utf8').trim();
store=new PostgresStore('postgresql://hipass_app:'+encodeURIComponent(password)+'@postgres:5432/hipass');await store.load();
const service=new HipassService(store);const result=await registerPhantomCatalog({service,
principal:{role:'SECURITY_ADMIN',hospitalId:'HOSP-A',actorId:'synthetic-compose-catalog-operator'},input:{datasetId:PHANTOM_DATASET_ID},
env:{HIPASS_CAPSTONE_PHANTOM_CATALOG:'1',HIPASS_CAPSTONE_MOCK_IDP:'1',HIPASS_CONTROL_PLANE_ONLY:'1',HIPASS_STORE:'postgres',NODE_ENV:'production',AUTH_MODE:'TEST'}});
if(!result.registrationCommitAcknowledged||!service.verifyAuditIntegrity().ok)throw new Error();
console.log('FIXED_SYNTHETIC_CATALOG=PASS');}catch{console.error('FIXED_SYNTHETIC_CATALOG=FAIL');process.exitCode=1;}finally{await store?.close();}`;
const registrationSnapshot=`import {readFileSync} from 'node:fs';import pg from 'pg';
import {PostgresStore} from './src/postgres-store.js';import {HipassService} from './src/services.js';
let client;try{client=new pg.Client({host:'postgres',database:'hipass',user:'hipass_bootstrap',
password:readFileSync(process.env.CAPSTONE_ADMIN_PASSWORD_FILE,'utf8').trim(),connectionTimeoutMillis:5000,query_timeout:6000,statement_timeout:5000});
client.on('error',()=>{});await client.connect();await client.query('BEGIN READ ONLY');
const counts=(await client.query("SELECT (SELECT count(*)::int FROM capstone_patient_accounts) AS accounts,(SELECT count(*)::int FROM capstone_patient_ownership_refs) AS refs,(SELECT count(*)::int FROM audit_logs) AS audit")).rows[0];
const logs=await PostgresStore.prototype.readTable.call({client},'auditLogs');
const auditValid=HipassService.prototype.verifyAuditIntegrity.call({store:{get:()=>logs}}).ok;
const linked=(await client.query("SELECT count(*)::int AS n FROM capstone_patient_ownership_refs r JOIN capstone_patient_accounts a USING(subject,patient_id) WHERE a.subject='synthetic-phantom-account' AND a.patient_id='HP-TEST-PHANTOM-001' AND a.status='ACTIVE' AND a.evidence_kind='CAPSTONE_MOCK_IDP' AND r.status='ACTIVE' AND r.version=1 AND r.source_hospital_id='HOSP-A' AND r.study_instance_uid IN ('1.2.826.0.1.3680043.10.5432.20261009.1','1.2.826.0.1.3680043.10.5432.20261009.2')")).rows[0].n;
await client.query('ROLLBACK');console.log(JSON.stringify({...counts,auditValid,linkedRefs:linked}));
}catch{console.error('PATIENT_FIXTURE_SNAPSHOT=FAIL');process.exitCode=1;}finally{await client?.end();}`;
const snapshot=()=>JSON.parse(compose(['run','--rm','--no-deps','patient-prepare','--input-type=module','-e',registrationSnapshot]));
try{
  const postgres=docker(['inspect','hipass-postgres','--format','{{.Image}}']);
  imageId=docker(['image','inspect',image,'--format','{{.Id}}']);
  assert.match(postgres,/^sha256:[a-f0-9]{64}$/);assert.match(imageId,/^sha256:[a-f0-9]{64}$/);
  directory=await mkdtemp(path.join(tmpdir(),project+'-'));
  assert.equal(path.dirname(directory),path.resolve(tmpdir()));
  for(const name of ['admin-password','app-password','token-secret','test-auth-secret','ingress-secret','data-plane-secret',
    'patient-authority-password','patient-a-service-secret','patient-b-service-secret'])await write(name,randomBytes(32).toString('hex'));
  override=await write('compose.json',JSON.stringify({services:{control:{restart:'no'},postgres:{restart:'no'},
    'patient-catalog-fixture':{profiles:['patient-preparation'],image:imageId,command:['--input-type=module','-e',catalogFixture],
      volumes:[directory.replaceAll('\\','/')+'/app-password:/run/secrets/app-password:ro'],networks:['db_private'],restart:'no'}}}));
  env={...process.env,HIPASS_POSTGRES_IMAGE:postgres,HIPASS_APP_IMAGE:imageId,HIPASS_CLOUD_SECRET_DIR:directory,
    HIPASS_CAPSTONE_PUBLIC_ORIGIN:'https://synthetic.invalid',HIPASS_PATIENT_KEY_VAULT_KEY_ID:'https://synthetic-demo.vault.azure.net/keys/demo/'+'a'.repeat(32)};
  const configuration=JSON.parse(compose(['config','--format','json'],true));
  for(const volume of Object.values(configuration.volumes))assert.ok(volume.name.startsWith(project+'_'));
  assert.equal(configuration.services.control.ports,undefined);assert.equal(configuration.services.postgres.ports,undefined);
  assert.equal(configuration.services['patient-catalog-fixture'].ports,undefined);
  stage='postgres-and-bootstrap';compose(['up','-d','--wait','--wait-timeout','45','postgres']);
  assert.match(compose(['run','--rm','--no-deps','bootstrap']),/CAPSTONE_DB_ROLE=PASS/);
  stage='baseline-control';compose(['up','-d','--no-deps','--wait','--wait-timeout','45','control']);
  checks.push('BASELINE_CONTROL_READONLY_SECRET_MOUNT_READY');
  compose(['stop','--timeout','5','control']);
  stage='preparation';
  assert.match(compose(['run','--rm','--no-deps','patient-prepare']),/"applied":false/);
  assert.match(compose(['run','--rm','--no-deps','patient-prepare','scripts/prepare-capstone-patient-database.js','--apply']),/"applied":true/);
  checks.push('ACTUAL_PREPARATION_ENTRYPOINT_AND_FILE_SECRETS');
  let rejected=false;
  try{compose(['run','--rm','--no-deps','patient-prepare','scripts/prepare-capstone-patient-database.js','--apply']);}
  catch(error){rejected=error.status===1 && String(error.stderr).includes('PATIENT_DATABASE_PREPARATION=FAIL');}
  assert.ok(rejected);checks.push('REPEATED_PREPARATION_DENIED_PRESERVING_EXISTING_STATE');
  stage='fixed-synthetic-catalog';
  assert.match(compose(['run','--rm','--no-deps','patient-catalog-fixture']),/FIXED_SYNTHETIC_CATALOG=PASS/);
  checks.push('NON_SUPERUSER_FIXED_CATALOG_OPERATOR_NO_HTTP_AUTH_CLAIM');
  stage='registration-preflight';
  const before=snapshot();assert.equal(before.auditValid,true);assert.equal(before.accounts,0);assert.equal(before.refs,0);
  assert.match(compose(['run','--rm','--no-deps','patient-prepare','scripts/register-capstone-patient-phantom.js']),/"applied":false/);
  assert.deepEqual(snapshot(),before);checks.push('ACTUAL_REGISTRATION_CLI_PREFLIGHT_NO_ACCOUNT_REF_OR_AUDIT_CHANGE');
  stage='registration-apply';
  assert.match(compose(['run','--rm','--no-deps','patient-prepare','scripts/register-capstone-patient-phantom.js','--apply']),/"applied":true/);
  const registered=snapshot();assert.deepEqual(registered,{accounts:1,refs:2,audit:before.audit+1,auditValid:true,linkedRefs:2});
  checks.push('ACTUAL_REGISTRATION_CLI_ONE_ACCOUNT_TWO_REFS_ONE_VALID_AUDIT');
  stage='registration-reapply-negative';rejected=false;
  try{compose(['run','--rm','--no-deps','patient-prepare','scripts/register-capstone-patient-phantom.js','--apply']);}
  catch(error){rejected=error.status===1&&String(error.stderr).includes('PATIENT_REGISTRATION_EXISTING_STATE_PRESERVED');}
  assert.ok(rejected);assert.deepEqual(snapshot(),registered);checks.push('ACTUAL_REGISTRATION_CLI_REAPPLY_DENIED_NO_SIDE_EFFECT');
  stage='patient-control';compose(['up','-d','--no-deps','--wait','--wait-timeout','45','control'],true);
  checks.push('PATIENT_CONTROL_REAL_ENTRYPOINT_DEDICATED_LOGIN_READY');
  const control=compose(['ps','-q','control'],true);assert.match(control,/^[a-f0-9]{64}$/);
  assert.equal(docker(['inspect',control,'--format','{{index .Config.Labels "com.docker.compose.project"}}']),project);
  assert.equal(docker(['inspect',control,'--format','{{.Image}}']),imageId);
  stage='internal-negative-routes';
  const probe=`const fs=require('fs');(async()=>{const a=fs.readFileSync('/run/secrets/patient-a-service-secret','utf8').trim(),b=fs.readFileSync('/run/secrets/patient-b-service-secret','utf8').trim();
    const out=[];for(const [key,body] of [[a,{}],[b,{}]]){const r=await fetch('http://127.0.0.1:3000/gateway/patient-self-view/package/wrap-authorize',{method:'POST',headers:{'content-type':'application/json','x-hipass-service-token':key},body:JSON.stringify(body),signal:AbortSignal.timeout(5000)});const json=await r.json();out.push({status:r.status,error:json.error});}console.log(JSON.stringify(out));})().catch(()=>process.exit(1));`;
  const responses=JSON.parse(docker(['exec',control,'/nodejs/bin/node','-e',probe]));
  assert.deepEqual(responses,[{status:400,error:'PATIENT_RELEASE_DENIED'},{status:403,error:'PATIENT_RELEASE_DENIED'}]);
  checks.push('REAL_PATIENT_RELEASE_ROUTE_BAD_BODY_AND_WRONG_B_PRINCIPAL_DENIED');
  stage='duplicate-service-secret';
  const original=await readFile(path.join(directory,'patient-b-service-secret'));
  await writeFile(path.join(directory,'patient-b-service-secret'),await readFile(path.join(directory,'patient-a-service-secret')));
  rejected=false;try{compose(['run','--rm','--no-deps','control'],true);}
  catch(error){rejected=error.status===1 && String(error.stderr).includes('PATIENT_RUNTIME_SECRET_REUSED');}
  assert.ok(rejected);await writeFile(path.join(directory,'patient-b-service-secret'),original);
  checks.push('ACTUAL_FILE_SECRET_REUSE_STARTUP_DENIED');
  stage='restored-readiness';
  const ready=JSON.parse(docker(['exec',control,'/nodejs/bin/node','-e',"fetch('http://127.0.0.1:3000/api/health',{signal:AbortSignal.timeout(3000)}).then(async r=>{console.log(JSON.stringify({status:r.status}));process.exit(r.ok?0:1)}).catch(()=>process.exit(1))"]));
  assert.equal(ready.status,200);checks.push('ORIGINAL_ISOLATED_PATIENT_CONTROL_REMAINS_READY');
}catch{process.exitCode=1;checks.push('FAIL_OR_ENVIRONMENT_BLOCKED:'+stage);}
finally{
  if(env && override){
    try{
      const ids=docker(['ps','-aq','--filter','label=com.docker.compose.project='+project]);
      for(const id of ids.split(/\s+/).filter(Boolean))assert.equal(docker(['inspect',id,'--format','{{index .Config.Labels "com.docker.compose.project"}}']),project);
      compose(['down','--volumes','--remove-orphans','--timeout','5'],true);
      assert.equal(docker(['ps','-aq','--filter','label=com.docker.compose.project='+project]),'');
      assert.equal(docker(['volume','ls','-q','--filter','label=com.docker.compose.project='+project]),'');
      cleanup=true;
    }catch{process.exitCode=1;checks.push('CLEANUP_FAILED');}
  }
  if(directory){for(const file of files)await unlink(file).catch(()=>{});await rmdir(directory).catch(()=>{
    process.exitCode=1;cleanup=false;checks.push('SECRET_FIXTURE_CLEANUP_FAILED');
  });}
  const result={status:process.exitCode?'FAIL':'PASS',review:'DRAFT / UNASSIGNED',project,imageId,checks,cleanup,elapsedMs:Date.now()-start,
    scope:'isolated Compose, readonly secret files, fixed synthetic catalog operator, actual registration CLI and audit, Control entrypoint; no HTTP catalog auth, public TLS, real Azure, browser or deployed database'};
  await mkdir('artifacts/workstation',{recursive:true});
  await writeFile('artifacts/workstation/'+project+'.json',JSON.stringify(result,null,2));
  console.log(JSON.stringify(result,null,2));
}
