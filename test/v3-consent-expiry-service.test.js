import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes,randomUUID,createHmac} from 'node:crypto';
import {TestProvider} from '../src/auth.js';
import {V3PrincipalRegistry} from '../src/v3-principal-registry.js';
import {v3ConsentExpiryPolicy} from '../src/v3-consent-expiry-command.js';
import {createConsentExpiryTransactions} from '../src/v3-consent-expiry-transactions.js';
import {V3ConsentExpiryService} from '../src/v3-consent-expiry-service.js';
function fixture(){
 const key=randomBytes(32),issuer='synthetic-expiry-service',secret=randomBytes(32).toString('hex');let acquired=0;
 const registry=new V3PrincipalRegistry({provider:new TestProvider({JWT_ISSUER:issuer,JWT_AUDIENCE:'synthetic-v3',TEST_JWT_SECRET:secret}),records:[{
  issuer,subject:'SYNTH-MAINTENANCE',authHospitalId:'SYNTH-A',actorId:randomUUID(),tenantId:randomUUID(),hospitalId:randomUUID(),
  role:'INTERNAL_SERVICE',status:'ACTIVE',servicePurpose:'CONSENT_EXPIRY',scopes:['consent:expire']}]});
 const data=[{alg:'HS256'},{iss:issuer,aud:'synthetic-v3',sub:'SYNTH-MAINTENANCE',hospitalId:'SYNTH-A',role:'INTERNAL_SERVICE',scope:'consent:expire',exp:Math.floor(Date.now()/1000)+180}]
  .map(v=>Buffer.from(JSON.stringify(v)).toString('base64url')).join('.');
 const binding=registry.resolve({headers:{authorization:`Bearer ${data}.${createHmac('sha256',secret).update(data).digest('base64url')}`}},v3ConsentExpiryPolicy);
 const transactions=createConsentExpiryTransactions({pool:{async connect(){acquired++;throw Error('PRIVATE_DB_DETAIL');}}});
 const service=new V3ConsentExpiryService({transactions,hmacKey:key});return {key,binding,transactions,service,get acquired(){return acquired;}};
}
test('expiry service requires exact private factory and copied 32-byte HMAC key',()=>{
 const f=fixture();try{
  for(const transactions of [{run(){}},{...f.transactions}])assert.throws(()=>new V3ConsentExpiryService({transactions,hmacKey:f.key}));
  for(const hmacKey of [undefined,'key',randomBytes(31),randomBytes(33)])assert.throws(()=>new V3ConsentExpiryService({transactions:f.transactions,hmacKey}));
  assert.equal(JSON.stringify(f.service),'{}');assert.equal(f.acquired,0);
 }finally{f.service.dispose();}
});
test('expiry service denies fabricated actor execution metadata and batch authority before connection',async()=>{
 const f=fixture();try{
  await assert.rejects(()=>f.service.expireBatch({...f.binding},'synthetic-expiry-key-001'),e=>e.code==='V3_AUTHENTICATED_BINDING_REQUIRED');
  for(const k of ['', 'short','x'.repeat(129),'contains invalid spaces'])await assert.rejects(()=>f.service.expireBatch(f.binding,k),e=>e.code==='V3_CONSENT_EXPIRY_EXECUTION_INVALID');
  for(const options of [{limit:0},{limit:101},{limit:null},{actorId:randomUUID()},{consentId:randomUUID()}])await assert.rejects(()=>f.service.expireBatch(f.binding,'synthetic-expiry-key-001',options),e=>e.code==='V3_CONSENT_EXPIRY_BATCH_INVALID');
  assert.equal(f.acquired,0);
 }finally{f.service.dispose();}
});
test('expiry service DB acquisition fault is safe and never returns fabricated receipt',async()=>{
 const f=fixture();try{
  await assert.rejects(()=>f.service.expireBatch(f.binding,'synthetic-expiry-key-001'),e=>e.code==='V3_DATABASE_UNAVAILABLE'&&!e.message.includes('DETAIL'));assert.equal(f.acquired,1);
 }finally{f.service.dispose();}
});
test('expiry service disposal disables admission without modifying caller key',async()=>{
 const f=fixture(),original=Buffer.from(f.key);f.service.dispose();f.service.dispose();assert.deepEqual(f.key,original);
 await assert.rejects(()=>f.service.expireBatch(f.binding,'synthetic-expiry-key-001'),e=>e.code==='V3_CONSENT_EXPIRY_SERVICE_CLOSED');assert.equal(f.acquired,0);
});
