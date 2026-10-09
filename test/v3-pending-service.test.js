import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,randomBytes,createHmac} from 'node:crypto';
import {TestProvider} from '../src/auth.js';
import {V3PrincipalRegistry} from '../src/v3-principal-registry.js';
import {V3TenantTransaction} from '../src/v3-tenant-transaction.js';
import {createPendingTransactions} from '../src/v3-pending-projection.js';
import {V3PendingPreparationService} from '../src/v3-pending-service.js';
import {normalizePendingConsentRequest} from '../src/v3-consent-pending-contract.js';

function fixture(){
 const secret=randomBytes(32).toString('hex'),record={actorId:randomUUID(),tenantId:randomUUID(),hospitalId:randomUUID(),role:'HOSPITAL_ADMIN',
  issuer:'synthetic-service',subject:'source',authHospitalId:'SYNTH-A',scopes:['consent:write'],status:'ACTIVE'};
 const registry=new V3PrincipalRegistry({provider:new TestProvider({JWT_ISSUER:record.issuer,JWT_AUDIENCE:'synthetic',TEST_JWT_SECRET:secret}),records:[record]});
 const data=[{alg:'HS256'},{iss:record.issuer,aud:'synthetic',sub:record.subject,role:record.role,hospitalId:record.authHospitalId,
  scope:'consent:write',exp:Math.floor(Date.now()/1000)+60}].map(v=>Buffer.from(JSON.stringify(v)).toString('base64url')).join('.');
 const binding=registry.resolve({headers:{authorization:`Bearer ${data}.${createHmac('sha256',secret).update(data).digest('base64url')}`}},
  {requiredScope:'consent:write',allowedRoles:['HOSPITAL_ADMIN']});
 let connections=0;const pool={async connect(){connections++;throw Error('MUST_NOT_CONNECT');}};
 const transactions=createPendingTransactions({pool}),hmacKey=randomBytes(32),sessionId=randomUUID();
 const request={patientRefId:randomUUID(),sourceHospitalId:binding.hospitalId,targetHospitalId:randomUUID(),purpose:'TREATMENT',state:'PENDING',
  allowedActions:['study:view'],resources:[{studyInstanceUid:'1.2.3',seriesInstanceUids:['1.2.3.1']}],policyVersion:'synthetic-v1',
  evidenceDigest:'SYNTHETIC_UNVERIFIED_'.padEnd(64,'X'),validFrom:new Date(Date.now()+1000).toISOString(),validUntil:new Date(Date.now()+60000).toISOString()};
 return {binding,pool,transactions,hmacKey,sessionId,request,connections:()=>connections};
}
test('pending service cannot accept a generic or copied transaction runner',()=>{
 const f=fixture();
 for(const transactions of [new V3TenantTransaction({pool:f.pool}),{...f.transactions},undefined])
  assert.throws(()=>new V3PendingPreparationService({...f,transactions,maxLifetimeMs:3600000}),e=>e.code==='V3_PENDING_CONFIGURATION_INVALID');
 for(const patch of [{hmacKey:randomBytes(31)},{maxLifetimeMs:0},{maxLifetimeMs:86400001},
  {transactions:createPendingTransactions({pool:f.pool,deadlineMs:11000})}])
  assert.throws(()=>new V3PendingPreparationService({...f,maxLifetimeMs:3600000,...patch}),e=>e.code==='V3_PENDING_CONFIGURATION_INVALID');
 assert.equal(f.connections(),0);
});
test('invalid pending command and selector reject before any pool acquisition',async()=>{
 const f=fixture(),service=new V3PendingPreparationService({...f,maxLifetimeMs:3600000});
 try{
  for(const [key,id,version,request] of [['short',f.sessionId,'"1"',f.request],['synthetic:valid-key', 'invalid','"1"',f.request],
   ['synthetic:valid-key',f.sessionId,'1',f.request],['synthetic:valid-key',f.sessionId,'"2147483647"',f.request],
   ['synthetic:valid-key',f.sessionId,'"1"',{...f.request,state:'ACTIVE'}],['synthetic:valid-key',f.sessionId,'"1"',{...f.request,approved:true}]])
   await assert.rejects(service.prepare(f.binding,key,id,version,request),e=>e.code==='V3_CONSENT_PENDING_INVALID');
  await assert.rejects(service.prepare({...f.binding},'synthetic:valid-key',f.sessionId,'"1"',f.request),e=>e.code==='V3_AUTHENTICATED_BINDING_REQUIRED');
  assert.equal(f.connections(),0);
 }finally{service.dispose();}
});
test('disposed pending provider refuses work without exposing caller key',async()=>{
 const f=fixture(),keyCopy=Buffer.from(f.hmacKey),service=new V3PendingPreparationService({...f,maxLifetimeMs:3600000});
 service.dispose();service.dispose();assert.deepEqual(f.hmacKey,keyCopy);
 await assert.rejects(service.prepare(f.binding,'synthetic:valid-key',f.sessionId,'"1"',f.request),e=>e.code==='V3_PENDING_PROVIDER_UNAVAILABLE');
 assert.equal(f.connections(),0);
});

test('strict pending service refuses missing or forged network input before pool acquisition',async()=>{
 const f=fixture(),service=new V3PendingPreparationService({...f,maxLifetimeMs:3600000,requireNetworkAudit:true});
 try{for(const input of [undefined,{},Object.freeze({sourceIp:'127.0.0.1'})])
  await assert.rejects(service.prepare(f.binding,'synthetic:valid-key',f.sessionId,'"1"',f.request,{},input),e=>e.code==='V3_PENDING_NETWORK_CONTEXT_INVALID');
  assert.equal(f.connections(),0);
 }finally{service.dispose();}
});
test('structural normalization deep-copies canonical input without granting approval',()=>{
 const f=fixture(),command=normalizePendingConsentRequest(f.binding,f.request);
 f.request.resources[0].seriesInstanceUids[0]='1.2.999';f.request.allowedActions[0]='study:download';
 assert.deepEqual(command.resources,[{studyInstanceUid:'1.2.3',seriesInstanceUids:['1.2.3.1']}]);
 assert.deepEqual(command.allowedActions,['study:view']);assert.ok(Object.isFrozen(command.resources[0].seriesInstanceUids));
 assert.equal(command.state,'PENDING');assert.equal(Object.hasOwn(command,'approved'),false);
});
