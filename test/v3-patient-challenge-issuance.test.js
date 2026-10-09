import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes,randomUUID,createHmac,createHash} from 'node:crypto';
import {TestProvider} from '../src/auth.js';
import {V3PrincipalRegistry} from '../src/v3-principal-registry.js';
import {createPatientApprovalTransactions} from '../src/v3-patient-approval-projection.js';
import {V3PatientChallengeIssuanceService} from '../src/v3-patient-challenge-issuance.js';

function fixture(options={}){
 const now=Date.now(),secret=randomBytes(32).toString('hex');
 const r={actorId:randomUUID(),tenantId:randomUUID(),hospitalId:randomUUID(),patientRefId:randomUUID(),
  issuer:'synthetic-challenge',subject:'SYNTH-PATIENT',authHospitalId:'SYNTH-A',role:'PATIENT',status:'ACTIVE',scopes:['consent:approve']};
 const registry=new V3PrincipalRegistry({provider:new TestProvider({JWT_ISSUER:r.issuer,JWT_AUDIENCE:'synthetic-v3',TEST_JWT_SECRET:secret}),records:[r]});
 const claims={iss:r.issuer,aud:'synthetic-v3',sub:r.subject,role:'PATIENT',hospitalId:'SYNTH-A',scope:'consent:approve',patientId:'SYNTHETIC-ONLY',
  exp:Math.floor(now/1000)+180,acr:'urn:highpass:capstone:mock-mfa',amr:['pwd','otp','mfa'],highpass_test_assurance:true,auth_time:Math.floor(now/1000),...options.claims};
 const data=[{alg:'HS256'},claims].map(x=>Buffer.from(JSON.stringify(x)).toString('base64url')).join('.');
 const b=registry.resolve({headers:{authorization:`Bearer ${data}.${createHmac('sha256',secret).update(data).digest('base64url')}`}},
  {requiredScope:'consent:approve',allowedRoles:['PATIENT']});
 const p={preparation_id:randomUUID(),session_id:randomUUID(),session_version:1,patient_ref:r.patientRefId,owner_tenant_id:r.tenantId,
  source_hospital_id:r.hospitalId,target_tenant_id:randomUUID(),target_hospital_id:randomUUID(),state:'PENDING',evidence_status:'UNVERIFIED',
  purpose:'TREATMENT',valid_from:new Date(now-1000),valid_until:new Date(now+60000),policy_version:'synthetic-v1',resource_count:1,action_count:1};
 const queries=[];let connects=0,row,prior;
 const safe={approval:true,mixed_capability:false,rolsuper:false,rolbypassrls:false,can_bypass:false,owns_schema_tables:false,owns_schema:false};
 const client={on(){},removeListener(){},release(){},async query({text,values=[]}){
  queries.push({text,values});
  if(text==='COMMIT'&&options.lostAck)throw Error('SYNTHETIC_COMMIT_ACK_LOSS');
  if(text.startsWith('SELECT pg_has_role'))return {rows:[safe]};
  if(text.startsWith('SELECT r.rolsuper'))return {rows:[safe]};
  if(text.startsWith('SELECT p.actor_id'))return {rows:[{actor_id:r.actorId}]};
  if(text.startsWith('SELECT floor'))return {rows:[{now_ms:Date.now()}]};
  if(text.includes('FROM highpass_v3.consent_preparation_requests WHERE preparation_id=$1 AND'))return {rows:options.missing?[]:[p]};
  if(text.includes('AS live FROM'))return {rows:[{session_id:p.session_id,patient_ref:p.patient_ref,owner_tenant_id:p.owner_tenant_id,
   source_hospital_id:p.source_hospital_id,state:'REQUESTED',version:1,valid_from:new Date(now-5000),valid_until:new Date(now+120000),live:true}]};
  if(text.startsWith('SELECT patient_ref'))return {rows:[{patient_ref:p.patient_ref}]};
  if(text.startsWith('SELECT session_id FROM'))return {rows:[{session_id:p.session_id}]};
  if(text.startsWith('SELECT hospital_id FROM'))return {rows:[{hospital_id:p.target_hospital_id}]};
  if(text.startsWith('SELECT tenant_id FROM'))return {rows:[{tenant_id:p.target_tenant_id}]};
  if(text.startsWith('SELECT ordinal,study'))return {rows:[{ordinal:1,study_instance_uid:'1.2.3',whole_study:false,series_instance_uids:['1.2.3.1']}]};
  if(text.startsWith('SELECT ordinal,action'))return {rows:[{ordinal:1,action:'study:view'}]};
  if(text.startsWith('SELECT highpass_v3.patient_consent_content_digest'))return {rows:[{content_digest:Buffer.alloc(32,1)}]};
  if(text.startsWith('SELECT request_digest'))return {rows:prior?[prior]:[]};
  if(text.startsWith('WITH timing')){
   row={ceremony_id:values[0],preparation_id:p.preparation_id,session_version:1,content_digest:values[4],issued_at:new Date(),expires_at:new Date(now+60000)};
   return {rows:[{...row,...options.row}]};
  }
  if(text.startsWith('INSERT INTO highpass_v3.consent_patient_challenge_results'))prior={...row,request_digest:values[2]};
  return {rows:[]};
 }};
 const transactions=createPatientApprovalTransactions({pool:{async connect(){connects++;return client;}},maxReauthAgeMs:300000});
 const policy={clauseVersion:'synthetic-link-v1',clauseText:'합성 식별 연결 설명'};
 const service=new V3PatientChallengeIssuanceService({transactions,hmacKey:randomBytes(32),clausePolicy:policy});
 const input={preparationId:p.preparation_id,expectedSessionVersion:1};
 const issue=(key='synthetic-challenge-key-001',body=input,binding=b)=>service.issue(binding,key,body);
 return {service,transactions,input,issue,queries,b,policy,get connects(){return connects;},set prior(value){prior=value;}};
}

test('challenge nonce is32 CSPRNG bytes and hash only reaches SQL after live checks',async()=>{
 const f=fixture(),out=await f.issue();
 assert.equal(out.status,'ISSUED');assert(Object.isFrozen(out));assert.equal(Buffer.from(out.nonce,'base64url').length,32);
 const insert=f.queries.find(q=>q.text.startsWith('WITH timing'));
 assert.equal(insert.values[3].toString('hex'),createHash('sha256').update(Buffer.from(out.nonce,'base64url')).digest('hex'));
 assert(!f.queries.some(q=>q.values.includes(out.nonce)));assert.equal(f.queries.at(-1).text,'COMMIT');
 assert(f.queries.findIndex(q=>q.text.startsWith('SELECT pg_advisory'))<f.queries.findIndex(q=>q.text.includes('AS live FROM')));
 assert(f.queries.some(q=>q.text.startsWith('INSERT INTO highpass_v3.consent_patient_ceremony_audit')));
 assert(!f.queries.some(q=>/UPDATE|DELETE/.test(q.text)));
 const second=await f.issue('synthetic-challenge-key-002');
 // Mock receipt supplies one row regardless of key: cannot substitute a usable nonce.
 assert.equal(second.nonceAvailable,false);
});
test('same key retry returns original metadata without nonce or new INSERT',async()=>{
 const f=fixture(),first=await f.issue(),n=f.queries.filter(q=>q.text.startsWith('WITH timing')).length;
 const again=await f.issue();
 assert.equal(again.status,'ISSUED_NONCE_UNAVAILABLE');assert.equal(again.requiresFreshChallenge,true);
 assert.equal(again.ceremonyId,first.ceremonyId);assert.equal(again.issuedAt,first.issuedAt);assert.equal(again.expiresAt,first.expiresAt);
 assert.equal(Object.hasOwn(again,'nonce'),false);assert.equal(f.queries.filter(q=>q.text.startsWith('WITH timing')).length,n);
});
test('input getter unknown authority fields bad key and unassured binding never acquire pool',async()=>{
 const f=fixture();let accessed=false;
 for(const body of [{...f.input,actorId:randomUUID()},{...f.input,nonce:'client'},
  {expectedSessionVersion:1,get preparationId(){accessed=true;return f.input.preparationId;}},{...f.input,expectedSessionVersion:2}])
  await assert.rejects(()=>f.issue(undefined,body),e=>e.code==='V3_PATIENT_CHALLENGE_INPUT_INVALID');
 await assert.rejects(()=>f.issue('bad'),e=>e.code==='V3_PATIENT_CHALLENGE_INPUT_INVALID');
 await assert.rejects(()=>f.issue(undefined,undefined,{...f.b}),e=>e.code==='V3_AUTHENTICATED_BINDING_REQUIRED');
 assert.equal(f.connects,0);assert.equal(accessed,false);
 const unassured=fixture({claims:{amr:['pwd']}});
 await assert.rejects(()=>unassured.issue(),e=>e.code==='V3_PATIENT_SYNTHETIC_REAUTH_REQUIRED');assert.equal(unassured.connects,0);
});
test('missing projection cannot create ceremony and malformed result rolls back',async()=>{
 const missing=fixture({missing:true});await assert.rejects(()=>missing.issue(),e=>e.code==='V3_PATIENT_CHALLENGE_PREPARATION_NOT_FOUND');
 assert(!missing.queries.some(q=>q.text.startsWith('WITH timing')));
 const bad=fixture({row:{content_digest:Buffer.alloc(1)}});
 await assert.rejects(()=>bad.issue(),e=>e.code==='V3_PATIENT_CHALLENGE_RESULT_INVALID');assert.equal(bad.queries.at(-1).text,'ROLLBACK');
});
test('receipt conflict corrupted receipt and unknown commit never return raw nonce',async()=>{
 const f=fixture();f.prior={request_digest:Buffer.alloc(32)};
 await assert.rejects(()=>f.issue(),e=>e.code==='V3_PATIENT_CHALLENGE_IDEMPOTENCY_CONFLICT');
 f.prior={request_digest:Buffer.alloc(1)};await assert.rejects(()=>f.issue(),e=>e.code==='V3_PATIENT_CHALLENGE_RESULT_INVALID');
 const lost=fixture({lostAck:true});await assert.rejects(()=>lost.issue(),e=>e.code==='V3_COMMIT_OUTCOME_UNKNOWN');
});
test('configuration copies policy/key and disposed service cannot issue',async()=>{
 const f=fixture();assert.throws(()=>new V3PatientChallengeIssuanceService({transactions:{...f.transactions},hmacKey:randomBytes(32),clausePolicy:f.policy}),/CONFIGURATION_INVALID/);
 f.policy.clauseText='changed';const out=await f.issue();assert.equal(out.status,'ISSUED');
 assert.equal(f.queries.find(q=>q.text.startsWith('WITH timing')).values[6],'합성 식별 연결 설명');
 f.service.dispose();await assert.rejects(()=>f.issue(),e=>e.code==='V3_PATIENT_CHALLENGE_PROVIDER_UNAVAILABLE');
});
