import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,randomBytes,createHmac} from 'node:crypto';
import {TestProvider,InternalServiceProvider} from '../src/auth.js';
import {V3PrincipalRegistry} from '../src/v3-principal-registry.js';
import {v3ExchangeExpiryPolicy,prepareExchangeExpiryBatch} from '../src/v3-exchange-expiry-contract.js';

function fixture(){
 const env={JWT_ISSUER:'synthetic-expiry-issuer',JWT_AUDIENCE:'synthetic-expiry-audience',TEST_JWT_SECRET:randomBytes(32).toString('hex')};
 const record={issuer:env.JWT_ISSUER,subject:'synthetic-expiry-worker-A',role:'INTERNAL_SERVICE',tenantId:randomUUID(),hospitalId:randomUUID(),
  actorId:randomUUID(),authHospitalId:'SYNTHETIC-A',status:'ACTIVE',scopes:['exchange:expire'],servicePurpose:'SESSION_EXPIRY'};
 const provider=new TestProvider(env),registry=new V3PrincipalRegistry({provider,records:[record]});
 const request=(patch={})=>{
  const input=[{alg:'HS256'},{iss:env.JWT_ISSUER,aud:env.JWT_AUDIENCE,sub:record.subject,role:record.role,hospitalId:record.authHospitalId,
   scope:'exchange:expire',exp:Math.floor(Date.now()/1000)+60,...patch}].map(v=>Buffer.from(JSON.stringify(v)).toString('base64url')).join('.');
  return {headers:{authorization:`Bearer ${input}.${createHmac('sha256',env.TEST_JWT_SECRET).update(input).digest('base64url')}`}};
 };
 return {env,record,provider,registry,request};
}
test('expiry enrollment is explicit separate purpose, exact scope and no patient impersonation',()=>{
 const f=fixture(),binding=f.registry.resolve(f.request(),v3ExchangeExpiryPolicy);
 assert.equal(binding.role,'INTERNAL_SERVICE');assert.equal(binding.servicePurpose,'SESSION_EXPIRY');assert.equal(binding.patientRefId,null);
 assert.deepEqual(prepareExchangeExpiryBatch(binding),{tenantId:f.record.tenantId,hospitalId:f.record.hospitalId,actorId:f.record.actorId,limit:25});
 for(const patch of [{servicePurpose:null},{servicePurpose:'OTHER'},{patientRefId:randomUUID()},{scopes:['exchange:expire','exchange:read']},
  {role:'HOSPITAL_ADMIN'},{scopes:['exchange:expire','exchange:expire']}])
  assert.throws(()=>new V3PrincipalRegistry({provider:f.provider,records:[{...f.record,...patch}]}),e=>e.code==='V3_REGISTRY_CONFIGURATION_INVALID');
 assert.throws(()=>new V3PrincipalRegistry({provider:new InternalServiceProvider({}),records:[f.record]}),e=>e.code==='V3_REGISTRY_CONFIGURATION_INVALID');
});
test('expiry JWT requires its issuer audience subject institution role and sole maintenance scope',()=>{
 const f=fixture();for(const patch of [{iss:'other'},{aud:'other'},{sub:'unregistered'},{hospitalId:'SYNTHETIC-B'},{role:'HOSPITAL_ADMIN'},
  {scope:'exchange:expire exchange:read'},{scope:'exchange:read'},{roles:['INTERNAL_SERVICE','HOSPITAL_ADMIN']},{exp:1}])
  assert.throws(()=>f.registry.resolve(f.request(patch),v3ExchangeExpiryPolicy),e=>[401,403].includes(e.statusCode));
 for(const scope of ['exchange:read','exchange:create','exchange:cancel','mapping:read','audit:read'])
  assert.throws(()=>f.registry.resolve(f.request(),{requiredScope:scope,allowedRoles:['INTERNAL_SERVICE']}),e=>e.code==='V3_SERVICE_SCOPE_NOT_ALLOWED');
});
test('client headers/body cannot alter maintenance enrollment; batch is bounded and exact',()=>{
 const f=fixture(),request=f.request({servicePurpose:'CLINICAL',patientRefId:randomUUID()});
 request.body={tenantId:randomUUID(),hospitalId:randomUUID(),servicePurpose:'OTHER'};request.headers['x-hipass-role']='HOSPITAL_ADMIN';
 const binding=f.registry.resolve(request,v3ExchangeExpiryPolicy);assert.equal(binding.servicePurpose,'SESSION_EXPIRY');
 const command=prepareExchangeExpiryBatch(binding,{limit:100});assert.ok(Object.isFrozen(command));assert.equal(command.tenantId,f.record.tenantId);
 assert.throws(()=>prepareExchangeExpiryBatch({...binding}),e=>e.code==='V3_AUTHENTICATED_BINDING_REQUIRED');
 for(const options of [{limit:0},{limit:101},{limit:Infinity},{limit:1.5},{tenantId:randomUUID()},Object.create({limit:1})])
  assert.throws(()=>prepareExchangeExpiryBatch(binding,options),e=>e.statusCode===422);
 const getter={};Object.defineProperty(getter,'limit',{get(){throw Error('MUST NOT INVOKE');}});
 assert.throws(()=>prepareExchangeExpiryBatch(binding,getter),e=>e.statusCode===422);
});
