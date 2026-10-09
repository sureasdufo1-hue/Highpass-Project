import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,randomBytes,createHmac,createHash} from 'node:crypto';
import {TestProvider} from '../src/auth.js';
import {V3PrincipalRegistry} from '../src/v3-principal-registry.js';
import {V3TenantTransaction} from '../src/v3-tenant-transaction.js';
import {V3ExchangeSessionService,originalExchangeCreateReceipt} from '../src/v3-exchange-session-service.js';
import {parseExchangeSessionCreate,prepareExchangeSessionCreate} from '../src/v3-exchange-session-contract.js';

function fixture(){
 const secret=randomBytes(32).toString('hex'),r={issuer:'synthetic-session-service',subject:'synthetic-admin',role:'HOSPITAL_ADMIN',
  tenantId:randomUUID(),hospitalId:randomUUID(),actorId:randomUUID(),authHospitalId:'SYNTHETIC-A',scopes:['exchange:create'],status:'ACTIVE'};
 const registry=new V3PrincipalRegistry({provider:new TestProvider({JWT_ISSUER:r.issuer,JWT_AUDIENCE:'synthetic-api',TEST_JWT_SECRET:secret}),records:[r]});
 const input=[{alg:'HS256'},{iss:r.issuer,aud:'synthetic-api',sub:r.subject,role:r.role,hospitalId:r.authHospitalId,scope:'exchange:create',exp:Math.floor(Date.now()/1000)+60}]
  .map(v=>Buffer.from(JSON.stringify(v)).toString('base64url')).join('.');
 const binding=registry.resolve({headers:{authorization:`Bearer ${input}.${createHmac('sha256',secret).update(input).digest('base64url')}`}},
  {requiredScope:'exchange:create',allowedRoles:['HOSPITAL_ADMIN']});
 let calls=0;const transactions=new V3TenantTransaction({pool:{connect(){calls++;throw Error('POOL_MUST_NOT_BE_USED');}},deadlineMs:8000});
 const service=new V3ExchangeSessionService({transactions,hmacKey:randomBytes(32),maxLifetimeMs:3600000});
 const request={patientRefId:randomUUID(),ownerTenantId:r.tenantId,sourceHospitalId:r.hospitalId,targetHospitalId:randomUUID(),requesterId:r.actorId,
  purpose:'TREATMENT',initiationType:'PROVIDER_INITIATED',validUntil:new Date(Date.now()+600000).toISOString(),resources:[{studyInstanceUid:'1.2.3'}],requestedActions:['study:view']};
 return {binding,request,transactions,service,calls:()=>calls};
}
test('Session repository requires finite transaction policy and injected keyed provider',()=>{
 const f=fixture();try{
  for(const config of [undefined,{transactions:f.transactions,maxLifetimeMs:3600000},{transactions:f.transactions,hmacKey:randomBytes(31),maxLifetimeMs:3600000},
   {transactions:f.transactions,hmacKey:randomBytes(32),maxLifetimeMs:Infinity},{transactions:new V3TenantTransaction({pool:{connect(){}}}),hmacKey:randomBytes(32),maxLifetimeMs:3600000}])
   assert.throws(()=>new V3ExchangeSessionService(config),e=>e.code==='V3_SESSION_CONFIGURATION_INVALID');
 }finally{f.service.dispose();}
});
test('invalid context/key/correlation/shape never acquires Session DB connection',async()=>{
 const f=fixture();try{
  await assert.rejects(f.service.create({...f.binding},'synthetic_session_001',f.request),e=>e.code==='V3_AUTHENTICATED_BINDING_REQUIRED');
  for(const key of ['', 'too-short', 'synthetic session with spaces'])await assert.rejects(f.service.create(f.binding,key,f.request),e=>e.statusCode===422);
  for(const options of [{token:'SYNTHETIC-PRIVATE'},{auditSessionId:'invalid'},{traceId:'invalid'}])
   await assert.rejects(f.service.create(f.binding,'synthetic_session_001',f.request,options),e=>e.statusCode===422);
  await assert.rejects(f.service.create(f.binding,'synthetic_session_001',{...f.request,state:'AUTHORIZED'}),e=>e.statusCode===422);
  await assert.rejects(f.service.create(f.binding,'synthetic_session_001',{...f.request,requesterId:randomUUID()}),e=>e.code==='V3_SESSION_CONTEXT_MISMATCH');
  assert.equal(f.calls(),0);
 }finally{f.service.dispose();}
});
test('disposed Session HMAC provider fails closed without DB or raw secrets',async()=>{
 const f=fixture();f.service.dispose();
 await assert.rejects(f.service.create(f.binding,'synthetic_session_001',f.request),e=>e.code==='V3_SESSION_PROVIDER_UNAVAILABLE'&&e.statusCode===503);
 assert.equal(f.calls(),0);f.service.dispose();
});

test('strict Session creation refuses missing or fabricated ingress before DB access',async()=>{
 const f=fixture(),service=new V3ExchangeSessionService({transactions:f.transactions,hmacKey:randomBytes(32),maxLifetimeMs:3600000,requireNetworkAudit:true});
 try{
  assert.equal(service.requireNetworkAudit,true);
  for(const network of [undefined,{}, {input:Object.freeze({sourceIp:'127.0.0.1'})}])
   await assert.rejects(service.create(f.binding,'synthetic_session_001',f.request,{},network),e=>e.code==='V3_IDENTITY_NETWORK_CONTEXT_INVALID');
  await assert.rejects(f.service.create(f.binding,'synthetic_session_001',f.request,{},{}),e=>e.code==='V3_SESSION_NETWORK_MODE_MISMATCH');
  assert.equal(f.calls(),0);
 }finally{service.dispose();f.service.dispose();}
});

test('elapsed retry structural parsing retains command but fresh creation still rejects',()=>{
 const f=fixture();try{
  const request={...f.request,validUntil:'2020-01-01T00:00:00.000Z'};
  assert.equal(parseExchangeSessionCreate(f.binding,request).validUntil,request.validUntil);
  assert.throws(()=>prepareExchangeSessionCreate(f.binding,request,{nowMs:Date.now(),maxLifetimeMs:3600000}),e=>e.statusCode===422);
  assert.throws(()=>parseExchangeSessionCreate(f.binding,{...request,validUntil:'not-a-date'}),e=>e.statusCode===422);
 }finally{f.service.dispose();}
});

test('original receipt uses immutable ledger even when current lifecycle fields differ',()=>{
 const f=fixture();try{
  const command=parseExchangeSessionCreate(f.binding,f.request),created='2026-01-01T00:00:00.000Z',id=randomUUID();
  const row={session_id:id,patient_ref:command.patientRefId,owner_tenant_id:command.ownerTenantId,source_hospital_id:command.sourceHospitalId,
   target_hospital_id:command.targetHospitalId,requester_id:command.requesterId,purpose:command.purpose,initiation_type:command.initiationType,
   requested_actions:command.requestedActions,valid_from:created,valid_until:command.validUntil,created_at:created,
   state:'READY',version:5,updated_at:'2026-01-02T00:00:00.000Z',resource_snapshot_digest:createHash('sha256').update(JSON.stringify(command.resources)).digest()};
  const ledger={session_id:id,response_state:'REQUESTED',response_version:1,response_created_at:created};
  const receipt=originalExchangeCreateReceipt(row,ledger,command.resources,command);
  assert.equal(receipt.state,'REQUESTED');assert.equal(receipt.version,1);assert.equal(receipt.updatedAt,created);
  for(const corrupt of [{response_version:2},{response_state:'READY'},{response_created_at:'2026-01-02T00:00:00.000Z'},{session_id:randomUUID()}])
   assert.throws(()=>originalExchangeCreateReceipt(row,{...ledger,...corrupt},command.resources,command),e=>e.code==='V3_SESSION_RESULT_INVALID');
  assert.throws(()=>originalExchangeCreateReceipt({...row,purpose:'RESEARCH'},ledger,command.resources,command),e=>e.code==='V3_SESSION_RESULT_INVALID');
 }finally{f.service.dispose();}
});
