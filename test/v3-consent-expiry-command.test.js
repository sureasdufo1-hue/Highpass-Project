import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes,randomUUID,createHmac} from 'node:crypto';
import {TestProvider} from '../src/auth.js';
import {V3PrincipalRegistry} from '../src/v3-principal-registry.js';
import {v3ExchangeExpiryPolicy,prepareExchangeExpiryBatch} from '../src/v3-exchange-expiry-contract.js';
import {v3ConsentExpiryPolicy,prepareConsentExpiryBatch,assertConsentExpiryBatch} from '../src/v3-consent-expiry-command.js';

function fixture(purpose='CONSENT_EXPIRY'){
 const scope=purpose==='CONSENT_EXPIRY'?'consent:expire':'exchange:expire';
 const env={JWT_ISSUER:'synthetic-consent-expiry',JWT_AUDIENCE:'synthetic-v3',TEST_JWT_SECRET:randomBytes(32).toString('hex')};
 const record={issuer:env.JWT_ISSUER,subject:'SYNTH-MAINTENANCE',role:'INTERNAL_SERVICE',servicePurpose:purpose,scopes:[scope],status:'ACTIVE',
  actorId:randomUUID(),tenantId:randomUUID(),hospitalId:randomUUID(),authHospitalId:'SYNTH-A'};
 const provider=new TestProvider(env),registry=new V3PrincipalRegistry({provider,records:[record]});
 const request=(patch={})=>{
  const data=[{alg:'HS256'},{iss:env.JWT_ISSUER,aud:env.JWT_AUDIENCE,sub:record.subject,hospitalId:record.authHospitalId,role:'INTERNAL_SERVICE',scope,exp:Math.floor(Date.now()/1000)+60,...patch}]
   .map(v=>Buffer.from(JSON.stringify(v)).toString('base64url')).join('.');
  return {headers:{authorization:`Bearer ${data}.${createHmac('sha256',env.TEST_JWT_SECRET).update(data).digest('base64url')}`}};
 };
 const policy=purpose==='CONSENT_EXPIRY'?v3ConsentExpiryPolicy:v3ExchangeExpiryPolicy;
 return {record,provider,registry,request,policy,binding:()=>registry.resolve(request(),policy)};
}
test('consent expiry uses explicit registered sole purpose scope and privately issued immutable command',()=>{
 const f=fixture(),b=f.binding(),c=prepareConsentExpiryBatch(b);
 assert.equal(b.servicePurpose,'CONSENT_EXPIRY');assert.equal(b.patientRefId,null);assert.deepEqual(b.scopes,['consent:expire']);
 assert.equal(c.kind,'CONSENT_EXPIRY_COMMAND_ONLY');assert.equal(c.limit,25);assert.equal(c.actorId,f.record.actorId);assert.ok(Object.isFrozen(c));
 assert.equal(assertConsentExpiryBatch(b,c),c);assert.equal(prepareConsentExpiryBatch(b,{limit:100}).limit,100);
});
test('both registered maintenance purposes reject mixed duplicate crossed unknown and impersonated enrollment',()=>{
 for(const purpose of ['CONSENT_EXPIRY','SESSION_EXPIRY']){
  const f=fixture(purpose),other=purpose==='CONSENT_EXPIRY'?'exchange:expire':'consent:expire';
  for(const patch of [{servicePurpose:null},{servicePurpose:'UNKNOWN'},{servicePurpose:'__proto__'},{patientRefId:randomUUID()},
   {scopes:[other]},{scopes:[...f.record.scopes,other]},{scopes:[...f.record.scopes,...f.record.scopes]},{role:'HOSPITAL_ADMIN'}])
   assert.throws(()=>new V3PrincipalRegistry({provider:f.provider,records:[{...f.record,...patch}]}),e=>e.code==='V3_REGISTRY_CONFIGURATION_INVALID');
 }
});
test('no human role can enroll either maintenance scope or purpose',()=>{
 const f=fixture();for(const role of ['PATIENT','DOCTOR','HOSPITAL_ADMIN','SECURITY_ADMIN','PLATFORM_ADMIN'])for(const scope of ['consent:expire','exchange:expire'])
  assert.throws(()=>new V3PrincipalRegistry({provider:f.provider,records:[{...f.record,role,scopes:[scope],servicePurpose:null,patientRefId:randomUUID()}]}),e=>e.code==='V3_REGISTRY_CONFIGURATION_INVALID');
});
test('signed claims must retain issuer audience subject hospital role sole scope and expiry',()=>{
 const f=fixture();for(const patch of [{iss:'other'},{aud:'other'},{sub:'unknown'},{hospitalId:'SYNTH-B'},{role:'PATIENT'},
  {scope:'exchange:expire'},{scope:'consent:expire consent:read'},{scope:'consent:expire consent:expire'},{roles:['INTERNAL_SERVICE','HOSPITAL_ADMIN']},{exp:1},{exp:'not-a-time'}])
  assert.throws(()=>f.registry.resolve(f.request(patch),f.policy),e=>[401,403].includes(e.statusCode));
 const request=f.request();request.headers.authorization=request.headers.authorization.slice(0,-8)+'invalid!';
 assert.throws(()=>f.registry.resolve(request,f.policy),e=>e.statusCode===401);
});
test('maintenance purposes cannot cross operation or command boundaries',()=>{
 const c=fixture(),s=fixture('SESSION_EXPIRY'),cb=c.binding(),sb=s.binding();
 assert.throws(()=>c.registry.resolve(c.request(),v3ExchangeExpiryPolicy),e=>e.code==='V3_SERVICE_SCOPE_NOT_ALLOWED');
 assert.throws(()=>s.registry.resolve(s.request(),v3ConsentExpiryPolicy),e=>e.code==='V3_SERVICE_SCOPE_NOT_ALLOWED');
 assert.throws(()=>prepareExchangeExpiryBatch(cb),e=>e.code==='V3_EXPIRY_SERVICE_REQUIRED');
 assert.throws(()=>prepareConsentExpiryBatch(sb),e=>e.code==='V3_CONSENT_EXPIRY_SERVICE_REQUIRED');
 for(const scope of ['consent:approve','consent:withdraw','exchange:read','mapping:write','audit:read'])
  assert.throws(()=>c.registry.resolve(c.request(),{requiredScope:scope,allowedRoles:['INTERNAL_SERVICE']}),e=>e.code==='V3_SERVICE_SCOPE_NOT_ALLOWED');
});
test('body and signed claim purpose fields cannot change server-owned enrollment snapshot',()=>{
 const f=fixture(),r=f.request({servicePurpose:'SESSION_EXPIRY',patientRefId:randomUUID()});r.body={servicePurpose:'CLINICAL',tenantId:randomUUID()};r.headers['x-hipass-role']='HOSPITAL_ADMIN';
 f.record.servicePurpose='SESSION_EXPIRY';f.record.scopes.push('exchange:expire');
 const b=f.registry.resolve(r,f.policy);assert.equal(b.servicePurpose,'CONSENT_EXPIRY');assert.deepEqual(b.scopes,['consent:expire']);
});
test('batch options reject authority fields prototypes getters symbols and unbounded limits',()=>{
 const b=fixture().binding();for(const options of [null,[],{limit:null},{limit:undefined},{limit:0},{limit:101},{limit:Infinity},{limit:1.5},{limit:'25'},
  {actorId:randomUUID()},{tenantId:randomUUID()},{hospitalId:randomUUID()},{servicePurpose:'CONSENT_EXPIRY'},Object.create({limit:1}),{[Symbol('limit')]:1}])
  assert.throws(()=>prepareConsentExpiryBatch(b,options),e=>e.code==='V3_CONSENT_EXPIRY_BATCH_INVALID');
 const getter={};Object.defineProperty(getter,'limit',{get(){assert.fail('GETTER_MUST_NOT_RUN');}});
 assert.throws(()=>prepareConsentExpiryBatch(b,getter),e=>e.code==='V3_CONSENT_EXPIRY_BATCH_INVALID');
});
test('copied fabricated or newly resolved bindings/commands cannot inherit command provenance',()=>{
 const f=fixture(),b=f.binding(),c=prepareConsentExpiryBatch(b);
 assert.throws(()=>prepareConsentExpiryBatch({...b}),e=>e.code==='V3_AUTHENTICATED_BINDING_REQUIRED');
 for(const other of [{...c},Object.freeze({...c}),{}])assert.throws(()=>assertConsentExpiryBatch(b,other),e=>e.code==='V3_CONSENT_EXPIRY_COMMAND_REQUIRED');
 assert.throws(()=>assertConsentExpiryBatch(f.binding(),c),e=>e.code==='V3_CONSENT_EXPIRY_COMMAND_REQUIRED');
});
test('an omitted limit does not consult inherited Object prototype accessors',()=>{
 const b=fixture().binding(),prior=Object.getOwnPropertyDescriptor(Object.prototype,'limit');let consulted=0;
 try{
  Object.defineProperty(Object.prototype,'limit',{configurable:true,get(){consulted++;return 100;}});
  assert.equal(prepareConsentExpiryBatch(b,{}).limit,25);assert.equal(consulted,0);
 }finally{if(prior)Object.defineProperty(Object.prototype,'limit',prior);else Reflect.deleteProperty(Object.prototype,'limit');}
});
test('command reuse rechecks registered credential expiry and inactive enrollment rejects resolution',()=>{
 const f=fixture(),b=f.binding(),c=prepareConsentExpiryBatch(b),now=Date.now;
 try{Date.now=()=>now()+120000;assert.throws(()=>assertConsentExpiryBatch(b,c),e=>e.code==='JWT_EXPIRED');}finally{Date.now=now;}
 const registry=new V3PrincipalRegistry({provider:f.provider,records:[{...f.record,status:'SUSPENDED'}]});
 assert.throws(()=>registry.resolve(f.request(),f.policy),e=>e.code==='V3_PRINCIPAL_NOT_REGISTERED');
});
