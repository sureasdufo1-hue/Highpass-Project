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
try{
  const postgres=docker(['inspect','hipass-postgres','--format','{{.Image}}']);
  imageId=docker(['image','inspect',image,'--format','{{.Id}}']);
  assert.match(postgres,/^sha256:[a-f0-9]{64}$/);assert.match(imageId,/^sha256:[a-f0-9]{64}$/);
  directory=await mkdtemp(path.join(tmpdir(),project+'-'));
  assert.equal(path.dirname(directory),path.resolve(tmpdir()));
  for(const name of ['admin-password','app-password','token-secret','test-auth-secret','ingress-secret','data-plane-secret',
    'patient-authority-password','patient-a-service-secret','patient-b-service-secret'])await write(name,randomBytes(32).toString('hex'));
  override=await write('compose.json',JSON.stringify({services:{control:{restart:'no'},postgres:{restart:'no'}}}));
  env={...process.env,HIPASS_POSTGRES_IMAGE:postgres,HIPASS_APP_IMAGE:imageId,HIPASS_CLOUD_SECRET_DIR:directory,
    HIPASS_CAPSTONE_PUBLIC_ORIGIN:'https://synthetic.invalid',HIPASS_PATIENT_KEY_VAULT_KEY_ID:'https://synthetic-demo.vault.azure.net/keys/demo/'+'a'.repeat(32)};
  const configuration=JSON.parse(compose(['config','--format','json'],true));
  for(const volume of Object.values(configuration.volumes))assert.ok(volume.name.startsWith(project+'_'));
  assert.equal(configuration.services.control.ports,undefined);assert.equal(configuration.services.postgres.ports,undefined);
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
    scope:'isolated Compose, actual readonly secret files and Control entrypoint; no public TLS, real Azure, patient registration, browser or deployed database'};
  await mkdir('artifacts/workstation',{recursive:true});
  await writeFile('artifacts/workstation/'+project+'.json',JSON.stringify(result,null,2));
  console.log(JSON.stringify(result,null,2));
}
