import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {loadCapstonePatientRuntimeSecrets} from '../src/capstone-patient-runtime-config.js';

function fixture(){
  const env={HIPASS_CAPSTONE_PATIENT_GRANTS:'1',HIPASS_CAPSTONE_PATIENT_KEY_RELEASE:'1',HIPASS_CONTROL_PLANE_ONLY:'1',AUTH_MODE:'TEST',
    HIPASS_STORE:'postgres',HIPASS_CAPSTONE_SINGLE_WRITER:'1',POSTGRES_HOST:'postgres',POSTGRES_DB:'hipass'};
  const files=new Map();
  for(const name of ['HIPASS_PATIENT_AUTHORITY_PASSWORD','HIPASS_PATIENT_SELF_VIEW_SERVICE_TOKEN','HIPASS_PATIENT_KEY_RELEASE_SERVICE_TOKEN']){
    env[name+'_FILE']='/run/secrets/'+name;files.set(env[name+'_FILE'],randomBytes(32).toString('hex'));
  }
  return {env,files,read:path=>{if(!files.has(path))throw new Error('concealed filesystem error');return files.get(path);}};
}
test('default-off patient runtime never reads secrets; release-only activation is rejected',()=>{
  const env={};loadCapstonePatientRuntimeSecrets(env,()=>assert.fail('must not read'));assert.deepEqual(env,{});
  assert.throws(()=>loadCapstonePatientRuntimeSecrets({HIPASS_CAPSTONE_PATIENT_KEY_RELEASE:'1'}),/PATIENT_RUNTIME_PROFILE_REQUIRED/);
});
test('patient runtime loads separate A/B keys and dedicated bounded database connection, not app URI',()=>{
  const f=fixture();f.env.DATABASE_URL='postgresql://hipass_app@postgres/hipass';f.env.HIPASS_PATIENT_AUTHORITY_DATABASE_URL='postgresql://postgres@arbitrary/other';
  loadCapstonePatientRuntimeSecrets(f.env,f.read);
  const uri=new URL(f.env.HIPASS_PATIENT_AUTHORITY_DATABASE_URL);
  assert.equal(uri.username,'hipass_patient_authority');assert.equal(uri.hostname,'postgres');assert.equal(uri.port,'5432');assert.equal(uri.pathname,'/hipass');
  assert.equal(uri.password,f.files.get(f.env.HIPASS_PATIENT_AUTHORITY_PASSWORD_FILE));
  assert.notEqual(f.env.HIPASS_PATIENT_SELF_VIEW_SERVICE_TOKEN,f.env.HIPASS_PATIENT_KEY_RELEASE_SERVICE_TOKEN);
});
test('missing, corrupt and unreadable patient secrets abort without publishing partial credentials',()=>{
  for(const invalid of [undefined,'short','x'.repeat(257),'x'.repeat(32)+'\nembedded','x'.repeat(32)+'\0']){
    const f=fixture();f.files.set(f.env.HIPASS_PATIENT_KEY_RELEASE_SERVICE_TOKEN_FILE,invalid);
    assert.throws(()=>loadCapstonePatientRuntimeSecrets(f.env,f.read),error=>error.message==='PATIENT_RUNTIME_SECRET_INVALID');
    assert.equal(f.env.HIPASS_PATIENT_SELF_VIEW_SERVICE_TOKEN,undefined);assert.equal(f.env.HIPASS_PATIENT_AUTHORITY_DATABASE_URL,undefined);
  }
});
test('duplicate patient A/B/database or presenter/doctor credentials cannot enable runtime',()=>{
  for(const name of ['HIPASS_PATIENT_AUTHORITY_PASSWORD','HIPASS_PATIENT_KEY_RELEASE_SERVICE_TOKEN','POSTGRES_PASSWORD','HIPASS_CAPSTONE_LOGIN_KEY','HIPASS_DATA_PLANE_SERVICE_TOKEN']){
    const f=fixture(),value=f.files.get(f.env.HIPASS_PATIENT_SELF_VIEW_SERVICE_TOKEN_FILE);
    if(f.env[name+'_FILE'])f.files.set(f.env[name+'_FILE'],value);else f.env[name]=value;
    assert.throws(()=>loadCapstonePatientRuntimeSecrets(f.env,f.read),/PATIENT_RUNTIME_SECRET_REUSED/);
  }
});
test('noncapstone database identity and invalid ports fail closed; key release can remain disabled',()=>{
  for(const values of [{POSTGRES_HOST:'external'},{POSTGRES_DB:'other'},{HIPASS_PATIENT_AUTHORITY_DATABASE_USER:'postgres'},{POSTGRES_PORT:'65536'},{AUTH_MODE:'DEVELOPMENT_MOCK'}]){
    const f=fixture();Object.assign(f.env,values);assert.throws(()=>loadCapstonePatientRuntimeSecrets(f.env,f.read),/PATIENT_RUNTIME_PROFILE_REQUIRED/);
  }
  const f=fixture();f.env.HIPASS_CAPSTONE_PATIENT_KEY_RELEASE='0';delete f.env.HIPASS_PATIENT_KEY_RELEASE_SERVICE_TOKEN_FILE;
  loadCapstonePatientRuntimeSecrets(f.env,f.read);assert.equal(f.env.HIPASS_PATIENT_KEY_RELEASE_SERVICE_TOKEN,undefined);
});
