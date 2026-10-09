import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes,randomUUID,createHmac} from 'node:crypto';
import {TestProvider} from '../src/auth.js';
import {V3PrincipalRegistry} from '../src/v3-principal-registry.js';
import {V3TenantTransaction} from '../src/v3-tenant-transaction.js';
import {V3ExchangeExpiryService} from '../src/v3-exchange-expiry-service.js';
import {v3ExchangeExpiryPolicy} from '../src/v3-exchange-expiry-contract.js';
function fixture(){
 const secret=randomBytes(32).toString('hex'),record={issuer:'synthetic-expiry-service',subject:'synthetic-worker',role:'INTERNAL_SERVICE',
  actorId:randomUUID(),tenantId:randomUUID(),hospitalId:randomUUID(),authHospitalId:'SYNTHETIC-A',scopes:['exchange:expire'],servicePurpose:'SESSION_EXPIRY',status:'ACTIVE'};
 const input=[{alg:'HS256'},{iss:record.issuer,aud:'synthetic-expiry-api',sub:record.subject,role:record.role,hospitalId:record.authHospitalId,
  scope:'exchange:expire',exp:Math.floor(Date.now()/1000)+60}].map(v=>Buffer.from(JSON.stringify(v)).toString('base64url')).join('.');
 const registry=new V3PrincipalRegistry({provider:new TestProvider({JWT_ISSUER:record.issuer,JWT_AUDIENCE:'synthetic-expiry-api',TEST_JWT_SECRET:secret}),records:[record]});
 const binding=registry.resolve({headers:{authorization:`Bearer ${input}.${createHmac('sha256',secret).update(input).digest('base64url')}`}},v3ExchangeExpiryPolicy);
 let calls=0;const transactions=new V3TenantTransaction({pool:{connect(){calls++;throw Error('MUST NOT CONNECT');}},deadlineMs:8000});
 return {binding,transactions,calls:()=>calls};
}
test('expiry batch requires bounded transaction configuration',()=>{
 assert.throws(()=>new V3ExchangeExpiryService(),e=>e.code==='V3_EXPIRY_CONFIGURATION_INVALID');
 assert.throws(()=>new V3ExchangeExpiryService({transactions:new V3TenantTransaction({pool:{connect(){}}})}),e=>e.code==='V3_EXPIRY_CONFIGURATION_INVALID');
});
test('expiry invalid command/correlation or closed service cannot acquire a pool',async()=>{
 const f=fixture(),service=new V3ExchangeExpiryService({transactions:f.transactions});
 await assert.rejects(service.expireBatch({...f.binding}),e=>e.code==='V3_AUTHENTICATED_BINDING_REQUIRED');
 await assert.rejects(service.expireBatch(f.binding,{limit:101}),e=>e.statusCode===422);
 await assert.rejects(service.expireBatch(f.binding,{}, {token:'SYNTHETIC'}),e=>e.statusCode===422);
 service.close();service.close();await assert.rejects(service.expireBatch(f.binding),e=>e.code==='V3_EXPIRY_SERVICE_CLOSED');
 assert.equal(f.calls(),0);
});

test('expiry close waits for admitted success or failure and blocks late admission',async()=>{
 for(const fails of [false,true]){
  const f=fixture();let settle,calls=0;
  class ControlledTransaction extends V3TenantTransaction {
   run(){calls++;return new Promise((resolve,reject)=>{settle=()=>fails?reject(Object.assign(Error('SYNTHETIC_FAILURE'),{code:'SYNTHETIC_FAILURE'})):resolve({processed:0,receipts:[]});});}
  }
  const service=new V3ExchangeExpiryService({transactions:new ControlledTransaction({pool:{connect(){}},deadlineMs:8000})});
  const pending=service.expireBatch(f.binding);
  const observed=pending.then(value=>({value}),error=>({error}));
  let drained=false;const closing=service.close();closing.then(()=>{drained=true;});
  assert.equal(service.close(),closing);
  await Promise.resolve();assert.equal(drained,false);
  await assert.rejects(service.expireBatch(f.binding),error=>error.code==='V3_EXPIRY_SERVICE_CLOSED');
  assert.equal(calls,1);settle();
  const result=await observed;await closing;assert.equal(drained,true);
  if(fails)assert.equal(result.error.code,'SYNTHETIC_FAILURE');else assert.deepEqual(result.value,{processed:0,receipts:[]});
 }
});
