import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {randomBytes,randomUUID,createHmac} from 'node:crypto';
import {TestProvider} from '../src/auth.js';
import {V3PrincipalRegistry} from '../src/v3-principal-registry.js';
import {V3IdentifierProtection} from '../src/v3-identifier-protection.js';
import {createV3IdentityCapstoneRuntime} from '../src/v3-identity-capstone-runtime.js';

function setup({stuck=false}={}){
 const secret=randomBytes(32).toString('hex'),record={issuer:'synthetic-runtime',subject:'synthetic-admin',actorId:randomUUID(),tenantId:randomUUID(),hospitalId:randomUUID(),
  role:'HOSPITAL_ADMIN',authHospitalId:'SYNTH-A',scopes:['mapping:read'],status:'ACTIVE'};
 const registry=new V3PrincipalRegistry({provider:new TestProvider({JWT_ISSUER:record.issuer,JWT_AUDIENCE:'synthetic',TEST_JWT_SECRET:secret}),records:[record]});
 const claims={iss:record.issuer,aud:'synthetic',sub:record.subject,role:record.role,hospitalId:record.authHospitalId,scope:'mapping:read',exp:Math.floor(Date.now()/1000)+60};
 const input=[{alg:'HS256'},claims].map(value=>Buffer.from(JSON.stringify(value)).toString('base64url')).join('.');
 const binding=registry.resolve({headers:{authorization:'Bearer '+input+'.'+createHmac('sha256',secret).update(input).digest('base64url')}},{requiredScope:'mapping:read',allowedRoles:['HOSPITAL_ADMIN']});
 const protection=new V3IdentifierProtection({encryptionKeys:new Map([['synthetic',randomBytes(32)]]),activeKeyId:'synthetic',lookupKey:randomBytes(32)});
 let calls=0;
 const pool=()=>({end(){throw Error('EXTERNAL_POOL_MUST_NOT_BE_CLOSED');},async connect(){calls++;if(stuck)return new Promise(()=>{});throw Error('PRIVATE_DATABASE_FAILURE');}});
 const read=name=>readFileSync(new URL('../tmp/certs/'+name,import.meta.url));
 return {binding,protection,calls:()=>calls,config:{mode:'CAPSTONE_SYNTHETIC_ONLY',registry,protection,clinicalPool:pool(),publisherPool:pool(),readerPool:pool(),
  ingressSecret:randomBytes(32),idempotencyKey:randomBytes(32),readinessMs:50,tls:{key:read('edge/localhost.key'),cert:read('edge/localhost.crt'),ca:read('mtls/ca.crt')}}};
}

test('runtime rejects unsafe configuration and forged binding; unavailable DB never binds or provisions',async()=>{
 const f=setup();let runtime;
 try{
  for(const patch of [{mode:'PRODUCTION'},{registry:{}},{protection:{}},{idempotencyKey:f.config.ingressSecret},{readerPool:f.config.clinicalPool}])
   assert.throws(()=>createV3IdentityCapstoneRuntime({...f.config,...patch}),/RUNTIME_CONFIGURATION/);
  runtime=createV3IdentityCapstoneRuntime(f.config);
  await assert.rejects(runtime.start({...f.binding}),/RUNTIME_BINDING_REQUIRED/);assert.equal(f.calls(),0);
  assert.equal(runtime.address(),null);assert.equal(runtime.state().phase,'CREATED');
  await assert.rejects(runtime.start(f.binding),/RUNTIME_NOT_STARTED/);assert.equal(f.calls(),3);
  assert.equal(runtime.address(),null);assert.equal(runtime.state().phase,'FAILED');
  await assert.rejects(runtime.start(f.binding),/START_ALREADY_REQUESTED/);
  await Promise.all([runtime.stop(),runtime.stop()]);assert.equal(runtime.state().phase,'CLOSED');
  assert.equal((await runtime.checkReadiness(f.binding)).status,'NOT VERIFIED');
 }finally{await runtime?.stop();f.protection.dispose();}
});

test('stop during bounded preflight cannot activate listener; supplied keys remain caller owned',async()=>{
 const f=setup({stuck:true}),key=Buffer.from(f.config.idempotencyKey),runtime=createV3IdentityCapstoneRuntime(f.config);
 try{
  const start=runtime.start(f.binding);const rejection=assert.rejects(start,/RUNTIME_NOT_STARTED/);
  await assert.rejects(runtime.start(f.binding),/START_ALREADY_REQUESTED/);
  await runtime.stop();await rejection;
  assert.equal(runtime.address(),null);assert.equal(runtime.state().phase,'CLOSED');assert.deepEqual(f.config.idempotencyKey,key);
 }finally{await runtime.stop();f.protection.dispose();}
});
