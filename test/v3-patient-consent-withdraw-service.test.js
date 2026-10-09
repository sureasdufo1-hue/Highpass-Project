import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes,randomUUID,createHmac} from 'node:crypto';
import {TestProvider} from '../src/auth.js';
import {V3PrincipalRegistry} from '../src/v3-principal-registry.js';
import {createPatientWithdrawalTransactions} from '../src/v3-patient-consent-withdraw-projection.js';
import {V3PatientConsentWithdrawalService} from '../src/v3-patient-consent-withdraw-service.js';

function fixture(overrides={}){
 const now=Math.floor(Date.now()/1000),secret=randomBytes(32).toString('hex');let acquired=0;
 const record={actorId:randomUUID(),tenantId:randomUUID(),hospitalId:randomUUID(),patientRefId:randomUUID(),issuer:'synthetic-withdraw-unit',
  subject:'SYNTH-PATIENT',authHospitalId:'SYNTH-A',role:'PATIENT',status:'ACTIVE',scopes:['consent:withdraw']};
 const registry=new V3PrincipalRegistry({provider:new TestProvider({JWT_ISSUER:record.issuer,JWT_AUDIENCE:'synthetic-v3',TEST_JWT_SECRET:secret}),records:[record]});
 const claims={iss:record.issuer,aud:'synthetic-v3',sub:record.subject,hospitalId:'SYNTH-A',role:'PATIENT',scope:'consent:withdraw',
  patientId:'SYNTHETIC-ONLY',exp:now+180,acr:'urn:highpass:capstone:mock-mfa',amr:['pwd','otp','mfa'],highpass_test_assurance:true,auth_time:now,...overrides};
 const data=[{alg:'HS256'},claims].map(v=>Buffer.from(JSON.stringify(v)).toString('base64url')).join('.');
 const binding=registry.resolve({headers:{authorization:`Bearer ${data}.${createHmac('sha256',secret).update(data).digest('base64url')}`}},
  {requiredScope:'consent:withdraw',allowedRoles:['PATIENT']});
 const factory=createPatientWithdrawalTransactions({pool:{async connect(){acquired++;throw Error('NO_SUCCESSFUL_DB_MOCK');}},maxReauthAgeMs:300000});
 const key=randomBytes(32),service=new V3PatientConsentWithdrawalService({transactions:factory,hmacKey:key});
 return {binding,factory,key,service,request:{consentId:randomUUID(),contentVersion:1,expectedEventSequence:2},get acquired(){return acquired;}};
}
test('withdraw service requires actual private factory and exactly 32-byte HMAC key',()=>{
 const f=fixture();try{
  assert.throws(()=>new V3PatientConsentWithdrawalService({transactions:{run(){}},hmacKey:randomBytes(32)}));
  for(const hmacKey of [undefined,'not-a-key',randomBytes(31),randomBytes(33)])
   assert.throws(()=>new V3PatientConsentWithdrawalService({transactions:f.factory,hmacKey}),e=>e.code==='V3_PATIENT_WITHDRAW_CONFIGURATION_INVALID');
  assert.equal(f.acquired,0);assert.equal(JSON.stringify(f.service),'{}');
 }finally{f.service.dispose();}
});
test('withdraw service rejects copied binding before DB acquisition',async()=>{
 const f=fixture();try{await assert.rejects(()=>f.service.withdraw({...f.binding},'synthetic-withdraw-key-001',f.request),e=>e.code==='V3_AUTHENTICATED_BINDING_REQUIRED');assert.equal(f.acquired,0);}
 finally{f.service.dispose();}
});
test('withdraw service rejects invalid key before DB acquisition',async()=>{
 const f=fixture();try{
  for(const key of ['', 'short','a'.repeat(129),'synthetic key spaces'])
   await assert.rejects(()=>f.service.withdraw(f.binding,key,f.request),e=>e.code==='V3_PATIENT_WITHDRAW_COMMAND_INVALID');
  assert.equal(f.acquired,0);
 }finally{f.service.dispose();}
});
test('withdraw service rejects authority fields, stale selector and getters without evaluating them',async()=>{
 const f=fixture();let calls=0;try{
  for(const request of [{...f.request,actorId:randomUUID()},{...f.request,contentVersion:2},{...f.request,expectedEventSequence:3}])
   await assert.rejects(()=>f.service.withdraw(f.binding,'synthetic-withdraw-key-001',request),e=>e.code==='V3_PATIENT_WITHDRAW_COMMAND_INVALID');
  const request={...f.request};Object.defineProperty(request,'consentId',{enumerable:true,get(){calls++;return f.request.consentId;}});
  await assert.rejects(()=>f.service.withdraw(f.binding,'synthetic-withdraw-key-001',request),e=>e.code==='V3_PATIENT_WITHDRAW_COMMAND_INVALID');
  assert.equal(calls,0);assert.equal(f.acquired,0);
 }finally{f.service.dispose();}
});
test('withdraw service without private signed synthetic reauth cannot acquire connection',async()=>{
 const f=fixture({highpass_test_assurance:false});try{
  await assert.rejects(()=>f.service.withdraw(f.binding,'synthetic-withdraw-key-001',f.request),e=>e.code==='V3_PATIENT_SYNTHETIC_REAUTH_REQUIRED');assert.equal(f.acquired,0);
 }finally{f.service.dispose();}
});
test('withdraw service dispose disables new calls without zeroing caller-owned key',async()=>{
 const f=fixture(),original=Buffer.from(f.key);f.service.dispose();f.service.dispose();
 assert.deepEqual(f.key,original);
 await assert.rejects(()=>f.service.withdraw(f.binding,'synthetic-withdraw-key-001',f.request),e=>e.code==='V3_PATIENT_WITHDRAW_PROVIDER_UNAVAILABLE');assert.equal(f.acquired,0);
});
