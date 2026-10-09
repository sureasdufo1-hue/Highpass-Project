import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,randomBytes,createHmac} from 'node:crypto';
import {TestProvider} from '../src/auth.js';
import {V3PrincipalRegistry} from '../src/v3-principal-registry.js';
import {createPatientApprovalTransactions,guardPatientApprovalPool,assertPatientApprovalTransactions,
 selectPatientApprovalProjection,assertLivePatientApprovalProjection} from '../src/v3-patient-approval-projection.js';

const clause={clauseVersion:'synthetic-link-v1',clauseText:'합성 식별 연결 동의 — 공유와 독립 선택'};
function fixture(options={}){
 const now=Date.now(),secret=randomBytes(32).toString('hex');
 const record={actorId:randomUUID(),tenantId:randomUUID(),hospitalId:randomUUID(),patientRefId:randomUUID(),
  issuer:'synthetic-patient-projection',subject:'SYNTH-PATIENT',authHospitalId:'SYNTH-A',role:'PATIENT',status:'ACTIVE',
  scopes:['consent:approve'],...options.record};
 const registry=new V3PrincipalRegistry({provider:new TestProvider({JWT_ISSUER:record.issuer,JWT_AUDIENCE:'synthetic-v3',TEST_JWT_SECRET:secret}),records:[record]});
 const claims={iss:record.issuer,aud:'synthetic-v3',sub:record.subject,role:record.role,hospitalId:record.authHospitalId,
  scope:record.scopes.join(' '),patientId:'SYNTHETIC-ONLY',exp:Math.floor(now/1000)+180,acr:'urn:highpass:capstone:mock-mfa',
  amr:['pwd','otp','mfa'],highpass_test_assurance:true,auth_time:Math.floor(now/1000),...options.claims};
 const data=[{alg:'HS256'},claims].map(x=>Buffer.from(JSON.stringify(x)).toString('base64url')).join('.');
 const binding=registry.resolve({headers:{authorization:`Bearer ${data}.${createHmac('sha256',secret).update(data).digest('base64url')}`}},
  {requiredScope:record.scopes[0],allowedRoles:[record.role]});
 const p={preparation_id:randomUUID(),session_id:randomUUID(),session_version:1,patient_ref:record.patientRefId,
  owner_tenant_id:record.tenantId,source_hospital_id:record.hospitalId,target_tenant_id:randomUUID(),target_hospital_id:randomUUID(),
  state:'PENDING',evidence_status:'UNVERIFIED',purpose:'TREATMENT',valid_from:new Date(now),valid_until:new Date(now+60000),
  policy_version:'synthetic-v1',resource_count:1,action_count:1,...options.preparation};
 const s={session_id:p.session_id,patient_ref:p.patient_ref,owner_tenant_id:p.owner_tenant_id,source_hospital_id:p.source_hospital_id,
  state:'REQUESTED',version:1,live:true,valid_from:new Date(now-5000),valid_until:new Date(now+120000),...options.session};
 const safe={approval:true,mixed_capability:false,rolsuper:false,rolbypassrls:false,can_bypass:false,owns_schema_tables:false,owns_schema:false};
 const queries=[];let clockIndex=0,connects=0,released=false;
 const client={on(){},removeListener(){},release(destroy){released=destroy?'DESTROYED':'RELEASED';},async query(q){
  const {text,values=[]}=q;queries.push({text,values});
  if(text.startsWith('SELECT pg_has_role'))return {rows:[{...safe,...options.guard}]};
  if(text.startsWith('SELECT r.rolsuper'))return {rows:[safe]};
  if(text.startsWith('SELECT p.actor_id'))return {rows:[{actor_id:record.actorId}]};
  if(text.startsWith('SELECT floor'))return {rows:[{now_ms:options.clocks?.[clockIndex++]??Date.now()}]};
  if(text.includes('FROM highpass_v3.consent_preparation_requests WHERE preparation_id=$1 AND'))return {rows:options.missing?[]:[p]};
  if(text.includes('AS live FROM highpass_v3.exchange_sessions'))return {rows:[s]};
  if(text.startsWith('SELECT patient_ref'))return {rows:options.refMissing?[]:[{patient_ref:p.patient_ref}]};
  if(text.startsWith('SELECT session_id FROM highpass_v3.exchange_session_participants'))return {rows:options.partMissing?[]:[{session_id:p.session_id}]};
  if(text.startsWith('SELECT hospital_id FROM'))return {rows:options.targetMissing?[]:[{hospital_id:p.target_hospital_id}]};
  if(text.startsWith('SELECT tenant_id FROM'))return {rows:options.tenantMissing?[]:[{tenant_id:p.target_tenant_id}]};
  if(text.startsWith('SELECT ordinal,study'))return {rows:options.scopes??[{ordinal:1,study_instance_uid:'1.2.3',whole_study:false,series_instance_uids:['1.2.3.1']}]};
  if(text.startsWith('SELECT ordinal,action'))return {rows:options.actions??[{ordinal:1,action:'study:view'}]};
  if(text.startsWith('SELECT highpass_v3.patient_consent_content_digest'))return {rows:[{content_digest:options.digest??Buffer.alloc(32,1)}]};
  return {rows:[]};
 }};
 const factory=createPatientApprovalTransactions({pool:{async connect(){connects++;return client;}},maxReauthAgeMs:300000});
 const run=(version=1,policy=clause)=>factory.run(binding,tx=>selectPatientApprovalProjection(tx,binding,p.preparation_id,version,policy));
 return {record,binding,p,s,factory,run,queries,now,get connects(){return connects;},get released(){return released;}};
}
test('branded patient projection is deeply frozen, SQL-derived, same-live-transaction only',async()=>{
 const f=fixture();let liveTx,snapshot;
 assert.equal(assertPatientApprovalTransactions(f.factory),f.factory);
 await assert.rejects(async()=>assertPatientApprovalTransactions({...f.factory}),/CONFIGURATION_INVALID/);
 const out=await f.factory.run(f.binding,async tx=>{
  liveTx=tx;snapshot=await selectPatientApprovalProjection(tx,f.binding,f.p.preparation_id,1,clause);
  assert.equal(assertLivePatientApprovalProjection(tx,f.binding,snapshot),snapshot);
  assert.throws(()=>assertLivePatientApprovalProjection(tx,f.binding,{...snapshot}),/PROJECTION_REQUIRED/);
  return snapshot;
 });
 assert.equal(out.denied,false);assert.equal(out.selection.contentDigest,'01'.repeat(32));
 assert(Object.isFrozen(out.selection.resources[0].seriesInstanceUids));assert(Object.isFrozen(out.selection.identityLink));
 assert.equal(out.selection.identityLink.purpose,'PATIENT_IDENTITY_LINK');
 for(const key of ['submittedEvidenceCommitment','actorId','token','grant','targetTenantId'])assert.equal(Object.hasOwn(out.selection,key),false);
 assert.throws(()=>assertLivePatientApprovalProjection(liveTx,f.binding,snapshot),/TRANSACTION_REQUIRED/);
 const session=f.queries.findIndex(q=>q.text.includes('AS live FROM'));
 const ref=f.queries.findIndex(q=>q.text.startsWith('SELECT patient_ref'));
 const hospital=f.queries.findIndex(q=>q.text.startsWith('SELECT hospital_id FROM'));
 const tenant=f.queries.findIndex(q=>q.text.startsWith('SELECT tenant_id FROM'));
 assert(session<ref&&ref<hospital&&hospital<tenant);
 for(const i of [session,ref,hospital,tenant])assert(f.queries[i].text.includes('FOR SHARE'));
 assert(f.queries[0].text.includes('mixed_capability'));assert.equal(f.queries.at(-1).text,'COMMIT');
 assert.equal(f.released,'RELEASED');assert(!f.queries.some(q=>/INSERT|DELETE|patient_mappings/.test(q.text)));
});
test('copied unassured wrong-role and wrong-scope bindings cannot acquire DB',async()=>{
 const clone=fixture();await assert.rejects(clone.factory.run({...clone.binding},()=>{}),e=>e.code==='V3_AUTHENTICATED_BINDING_REQUIRED');assert.equal(clone.connects,0);
 for(const options of [{claims:{amr:['pwd']}},{claims:{auth_time:0}},{record:{role:'HOSPITAL_ADMIN',patientRefId:null}},
  {record:{scopes:['consent:write']}}]){
  const f=fixture(options);await assert.rejects(f.run(),e=>['V3_PATIENT_SYNTHETIC_REAUTH_REQUIRED','V3_ROLE_NOT_ALLOWED','V3_SCOPE_NOT_ALLOWED'].includes(e.code));
  assert.equal(f.connects,0);
 }
 const f=fixture();await assert.rejects(selectPatientApprovalProjection({query(){throw Error('MUST_NOT_QUERY');}},f.binding,f.p.preparation_id,1,clause),/TRANSACTION_REQUIRED/);
});
test('mixed unknown inherited unsafe owner and missing guard values fail before BEGIN',async()=>{
 for(const guard of [{approval:false},{mixed_capability:true},{rolsuper:true},{rolbypassrls:true},{can_bypass:true},
  {owns_schema:true},{owns_schema_tables:true},{mixed_capability:undefined}]){
  const f=fixture({guard});await assert.rejects(f.run(),e=>e.code==='V3_PATIENT_APPROVAL_DATABASE_ROLE_UNSAFE');
  assert.equal(f.queries.length,1);assert.equal(f.released,'DESTROYED');
 }
 await assert.rejects(guardPatientApprovalPool({async connect(){throw Error('SYNTHETIC_SECRET');}}).connect(),
  e=>e.code==='V3_DATABASE_UNAVAILABLE'&&!e.message.includes('SECRET'));
});
test('current missing stale terminal expired ref participant and target safely deny',async()=>{
 for(const [options,version,reason] of [[{missing:true},1,'PREPARATION_NOT_FOUND'],[{},2,'VERSION_MISMATCH'],
  [{session:{version:2}},1,'VERSION_MISMATCH'],[{session:{state:'CANCELLED'}},1,'SESSION_TERMINAL'],
  [{session:{live:false}},1,'SESSION_EXPIRED'],[{refMissing:true},1,'SOURCE_REF_UNAVAILABLE'],
  [{partMissing:true},1,'SOURCE_REF_UNAVAILABLE'],[{targetMissing:true},1,'TARGET_UNAVAILABLE'],[{tenantMissing:true},1,'TARGET_UNAVAILABLE']]){
  const f=fixture(options);assert.deepEqual(await f.run(version),{denied:true,reasonCode:reason});
 }
});
test('persisted malformed context windows counts ordered scopes actions digest and clocks fail closed',async()=>{
 for(const options of [{preparation:{patient_ref:randomUUID()}},{preparation:{state:'ACTIVE'}},
  {preparation:{valid_until:new Date(NaN)}},{preparation:{purpose:'<script>'}},{session:{live:'true'}},
  {preparation:{resource_count:2}},{scopes:[{ordinal:2,study_instance_uid:'1.2.3',whole_study:true,series_instance_uids:null}]},
  {scopes:[{ordinal:1,study_instance_uid:'BAD',whole_study:true,series_instance_uids:null}]},
  {actions:[{ordinal:1,action:'admin:all'}]},{digest:Buffer.alloc(31)},{clocks:['NaN']}]){
  const f=fixture(options);await assert.rejects(f.run(),e=>e.code==='V3_PATIENT_APPROVAL_PROJECTION_INVALID');
  assert(f.queries.some(q=>q.text==='ROLLBACK'));assert(!f.queries.some(q=>q.text==='COMMIT'));
 }
});
test('final expiry or reauth loss rolls back an otherwise valid projection',async()=>{
 const now=Date.now();
 const expired=fixture({clocks:[now,now,now+120001]});
 await assert.rejects(expired.run(),e=>e.code==='V3_PATIENT_CONSENT_EXPIRED');
 const old=fixture({clocks:[now,now,now+300001]});
 await assert.rejects(old.run(),e=>e.code==='V3_PATIENT_SYNTHETIC_REAUTH_REQUIRED');
 for(const f of [expired,old])assert.equal(f.queries.at(-1).text,'ROLLBACK');
});
test('server clause policy rejects getters extra fields missing configuration without reading them',async()=>{
 const f=fixture();let accessed=false;
 const getter={clauseVersion:'x',get clauseText(){accessed=true;return 'BAD';}};
 for(const policy of [getter,{...clause,bodyMfa:true},{clauseVersion:'v1',clauseText:''}])
  await assert.rejects(f.run(1,policy),e=>e.code==='V3_PATIENT_CONSENT_POLICY_REQUIRED');
 assert.equal(accessed,false);
});
