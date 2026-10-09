import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes,randomUUID,createHmac} from 'node:crypto';
import {TestProvider} from '../src/auth.js';
import {V3PrincipalRegistry} from '../src/v3-principal-registry.js';
import {createPatientApprovalTransactions} from '../src/v3-patient-approval-projection.js';
import {V3PatientConsentDecisionService} from '../src/v3-patient-consent-decision-service.js';

// Real private binding/factory; no database or successful persistence is mocked.
function fixture(claimOverrides={}){
 const secret=randomBytes(32).toString('hex'),now=Math.floor(Date.now()/1000);
 const record={actorId:randomUUID(),tenantId:randomUUID(),hospitalId:randomUUID(),patientRefId:randomUUID(),
  issuer:'synthetic-decision',subject:'SYNTH-PATIENT',authHospitalId:'SYNTH-A',role:'PATIENT',status:'ACTIVE',scopes:['consent:approve']};
 const registry=new V3PrincipalRegistry({provider:new TestProvider({JWT_ISSUER:record.issuer,JWT_AUDIENCE:'synthetic-v3',TEST_JWT_SECRET:secret}),records:[record]});
 const claims={iss:record.issuer,aud:'synthetic-v3',sub:record.subject,role:'PATIENT',hospitalId:'SYNTH-A',scope:'consent:approve',
  patientId:'SYNTHETIC-ONLY',exp:now+180,acr:'urn:highpass:capstone:mock-mfa',amr:['pwd','otp','mfa'],
  highpass_test_assurance:true,auth_time:now,...claimOverrides};
 const data=[{alg:'HS256'},claims].map(v=>Buffer.from(JSON.stringify(v)).toString('base64url')).join('.');
 const binding=registry.resolve({headers:{authorization:`Bearer ${data}.${createHmac('sha256',secret).update(data).digest('base64url')}`}},
  {requiredScope:'consent:approve',allowedRoles:['PATIENT']});
 let connects=0;
 const transactions=createPatientApprovalTransactions({pool:{async connect(){connects++;throw Error('UNEXPECTED_DATABASE_ACQUISITION');}},maxReauthAgeMs:300000});
 const policy={clauseVersion:'synthetic-link-v1',clauseText:'합성 식별 연결 설명'};
 const service=new V3PatientConsentDecisionService({transactions,hmacKey:randomBytes(32),clausePolicy:policy});
 const body=()=>({ceremonyId:randomUUID(),nonce:randomBytes(32).toString('base64url'),command:{preparationId:randomUUID(),
  expectedSessionVersion:1,contentDigest:'01'.repeat(32),decision:'APPROVE',identityLink:{approved:false,clauseVersion:policy.clauseVersion}}});
 return {binding,transactions,policy,service,body,get connects(){return connects;}};
}

test('decision requires private approval factory and a 32-byte HMAC key',()=>{
 const f=fixture();
 try{
  assert.throws(()=>new V3PatientConsentDecisionService({transactions:{run(){}},hmacKey:randomBytes(32),clausePolicy:f.policy}));
  for(const hmacKey of [undefined,randomBytes(31),randomBytes(33),'synthetic-not-a-key'])
   assert.throws(()=>new V3PatientConsentDecisionService({transactions:f.transactions,hmacKey,clausePolicy:f.policy}),
    e=>e.code==='V3_PATIENT_DECISION_CONFIGURATION_INVALID');
  assert.equal(f.connects,0);
 }finally{f.service.dispose();}
});

test('decision exact nested shape rejects extra fields and getters before acquisition',async()=>{
 const f=fixture();
 try{
  for(const mutate of [b=>{b.token='SYNTHETIC';},b=>{b.command.scope=['1.2.3'];},b=>{b.command.identityLink.purpose='TREATMENT';},
   b=>{Object.defineProperty(b,'nonce',{get(){throw Error('GETTER_MUST_NOT_RUN');},enumerable:true});}]){
   const b=f.body();mutate(b);
   await assert.rejects(()=>f.service.decide(f.binding,'synthetic-decision-key-001',b),e=>e.code==='V3_PATIENT_DECISION_INPUT_INVALID');
  }
  assert.equal(f.connects,0);
 }finally{f.service.dispose();}
});

test('decision nonce must be canonical base64url for exactly 32 bytes',async()=>{
 const f=fixture();
 try{
  for(const nonce of [randomBytes(31).toString('base64url'),randomBytes(33).toString('base64url'),'A'.repeat(42)+'B', 'A'.repeat(43)+'='])
   await assert.rejects(()=>f.service.decide(f.binding,'synthetic-decision-key-001',{...f.body(),nonce}),
    e=>e.code==='V3_PATIENT_DECISION_INPUT_INVALID');
  assert.equal(f.connects,0);
 }finally{f.service.dispose();}
});

test('decision key, version, digest and choice validation precedes acquisition',async()=>{
 const f=fixture();
 try{
  for(const key of ['', 'short', 'x'.repeat(129),'synthetic key contains spaces'])
   await assert.rejects(()=>f.service.decide(f.binding,key,f.body()),e=>e.code==='V3_PATIENT_DECISION_INPUT_INVALID');
  for(const [field,value] of [['expectedSessionVersion',2],['contentDigest','FF'.repeat(32)],['decision','WITHDRAW'],['preparationId','not-uuid']]){
   const b=f.body();b.command[field]=value;
   await assert.rejects(()=>f.service.decide(f.binding,'synthetic-decision-key-001',b),e=>e.code==='V3_PATIENT_DECISION_INPUT_INVALID');
  }
  assert.equal(f.connects,0);
 }finally{f.service.dispose();}
});

test('decision copied binding cannot impersonate private patient authority',async()=>{
 const f=fixture();
 try{
  await assert.rejects(()=>f.service.decide({...f.binding},'synthetic-decision-key-001',f.body()));
  assert.equal(f.connects,0);
 }finally{f.service.dispose();}
});

test('decision without private synthetic reauthentication never acquires a connection',async()=>{
 const f=fixture({highpass_test_assurance:false});
 try{
  await assert.rejects(()=>f.service.decide(f.binding,'synthetic-decision-key-001',f.body()));
  assert.equal(f.connects,0);
 }finally{f.service.dispose();}
});

test('disposed decision service fails closed before acquisition',async()=>{
 const f=fixture();f.service.dispose();f.service.dispose();
 await assert.rejects(()=>f.service.decide(f.binding,'synthetic-decision-key-001',f.body()),
  e=>e.code==='V3_PATIENT_DECISION_PROVIDER_UNAVAILABLE');
 assert.equal(f.connects,0);
});
