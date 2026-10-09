import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,randomBytes,createHmac} from 'node:crypto';
import {TestProvider} from '../src/auth.js';
import {V3PrincipalRegistry} from '../src/v3-principal-registry.js';
import {preparePendingConsentIntent,assertPendingConsentIntent,parsePendingConsentIntent,validatePendingConsentIntentWindow} from '../src/v3-consent-pending-contract.js';

function fixture(role='DOCTOR',scope='consent:write'){
 const secret=randomBytes(32).toString('hex'),nowMs=Date.now(),patientRefId=randomUUID();
 const record={issuer:'synthetic-consent-pending',subject:randomUUID(),role,tenantId:randomUUID(),hospitalId:randomUUID(),actorId:randomUUID(),
  authHospitalId:'SYNTHETIC-A',patientRefId:role==='PATIENT'?patientRefId:null,status:'ACTIVE',scopes:[scope]};
 const registry=new V3PrincipalRegistry({provider:new TestProvider({JWT_ISSUER:record.issuer,JWT_AUDIENCE:'synthetic-api',TEST_JWT_SECRET:secret}),records:[record]});
 const input=[{alg:'HS256'},{iss:record.issuer,aud:'synthetic-api',sub:record.subject,role,hospitalId:record.authHospitalId,scope,
  exp:Math.floor(nowMs/1000)+60,...(role==='PATIENT'?{patientId:'SYNTHETIC-PATIENT'}:role==='DOCTOR'?{doctorId:'SYNTHETIC-DOCTOR'}:{})}]
  .map(value=>Buffer.from(JSON.stringify(value)).toString('base64url')).join('.');
 const binding=registry.resolve({headers:{authorization:`Bearer ${input}.${createHmac('sha256',secret).update(input).digest('base64url')}`}},
  {requiredScope:scope,allowedRoles:[role]});
 const selection={sessionId:randomUUID(),patientRefId,ownerTenantId:record.tenantId,sourceHospitalId:record.hospitalId,targetHospitalId:randomUUID(),
  purpose:'TREATMENT',requestedActions:['study:view','study:download'],resources:[{studyInstanceUid:'1.2.3'},{studyInstanceUid:'1.2.4',seriesInstanceUids:['1.2.4.1','1.2.4.2']}],
  validFrom:new Date(nowMs-1000).toISOString(),validUntil:new Date(nowMs+60000).toISOString(),version:1};
 const request={patientRefId,sourceHospitalId:selection.sourceHospitalId,targetHospitalId:selection.targetHospitalId,purpose:'TREATMENT',
  allowedActions:['study:view'],resources:[{studyInstanceUid:'1.2.4',seriesInstanceUids:['1.2.4.1']}],state:'PENDING',
  validFrom:new Date(nowMs+1000).toISOString(),validUntil:new Date(nowMs+20000).toISOString(),policyVersion:'synthetic-policy-v1',evidenceDigest:'a'.repeat(64)};
 const policy={nowMs,maxLifetimeMs:60000};
 return {binding,request,selection,policy,prepare:(r=request,s=selection,p=policy)=>preparePendingConsentIntent(binding,r,s,p)};
}
const denied=(code)=>error=>error instanceof Error&&error.code===code;
test('PENDING control is immutable preparation with unverified evidence, never approval',()=>{
 for(const role of ['PATIENT','DOCTOR','HOSPITAL_ADMIN']){
  const f=fixture(role),intent=f.prepare();
  assert.equal(intent.state,'PENDING');assert.equal(intent.evidenceStatus,'UNVERIFIED');assert.equal(intent.actorId,f.binding.actorId);
  assert.equal(assertPendingConsentIntent(f.binding,intent),intent);
  assert.ok(Object.isFrozen(intent)&&Object.isFrozen(intent.allowedActions)&&Object.isFrozen(intent.resources)&&Object.isFrozen(intent.resources[0].seriesInstanceUids));
  for(const key of ['approved','consentArtifactId','grantId','token','key','recipientActive','evidenceDigest'])assert.equal(Object.hasOwn(intent,key),false);
  f.request.resources[0].seriesInstanceUids[0]='9.9';f.request.allowedActions[0]='study:download';
  assert.equal(intent.resources[0].seriesInstanceUids[0],'1.2.4.1');assert.deepEqual(intent.allowedActions,['study:view']);
 }
});
test('binding, role, scope, source and patient spoofing deny',()=>{
 const f=fixture();assert.throws(()=>preparePendingConsentIntent({...f.binding},f.request,f.selection,f.policy),denied('V3_AUTHENTICATED_BINDING_REQUIRED'));
 for(const [role,scope,code] of [['SECURITY_ADMIN','consent:write','V3_ROLE_NOT_ALLOWED'],['PLATFORM_ADMIN','consent:write','V3_ROLE_NOT_ALLOWED'],['DOCTOR','exchange:create','V3_SCOPE_NOT_ALLOWED']]){
  const g=fixture(role,scope);assert.throws(()=>g.prepare(),denied(code));
 }
 for(const key of ['ownerTenantId','sourceHospitalId','targetHospitalId','patientRefId'])assert.throws(()=>f.prepare(f.request,{...f.selection,[key]:randomUUID()}),denied('V3_CONSENT_PENDING_CONTEXT_MISMATCH'));
 const p=fixture('PATIENT'),other=randomUUID();assert.throws(()=>p.prepare({...p.request,patientRefId:other},{...p.selection,patientRefId:other}),denied('V3_CONSENT_PENDING_PATIENT_MISMATCH'));
});
test('ACTIVE or additional authority fields and malformed evidence are rejected',()=>{
 const f=fixture();
 for(const patch of [{state:'ACTIVE'},{state:'WITHDRAWN'},{approved:true},{identityLinkApproved:true},{token:'SYNTHETIC'},{evidenceDigest:'short'},
  {evidenceDigest:'a'.repeat(129)},{evidenceDigest:'a'.repeat(42)+' '},{policyVersion:''},{policyVersion:'a\n'}])
  assert.throws(()=>f.prepare({...f.request,...patch}),denied('V3_CONSENT_PENDING_INVALID'));
 const missing={...f.request};delete missing.state;assert.throws(()=>f.prepare(missing),denied('V3_CONSENT_PENDING_INVALID'));
});
test('purpose/action/Study/Series expansion denies; whole-Study can narrow only',()=>{
 const f=fixture();
 for(const patch of [{purpose:'RESEARCH'},{allowedActions:['study:pacs-transfer']},{resources:[{studyInstanceUid:'9.9'}]},
  {resources:[{studyInstanceUid:'1.2.4'}]},{resources:[{studyInstanceUid:'1.2.4',seriesInstanceUids:['1.2.4.9']}]}])
  assert.throws(()=>f.prepare({...f.request,...patch}),denied('V3_CONSENT_PENDING_SCOPE_MISMATCH'));
 assert.deepEqual(f.prepare({...f.request,resources:[{studyInstanceUid:'1.2.3',seriesInstanceUids:['1.2.3.8']}]}).resources,
  [{studyInstanceUid:'1.2.3',seriesInstanceUids:['1.2.3.8']}]);
 assert.deepEqual(f.prepare({...f.request,resources:[{studyInstanceUid:'1.2.3'}]}).resources,[{studyInstanceUid:'1.2.3'}]);
});
test('empty duplicate malformed and sparse selections deny',()=>{
 const f=fixture();
 for(const patch of [{allowedActions:[]},{allowedActions:['study:view','study:view']},{allowedActions:new Array(1)},
  {resources:[]},{resources:[{studyInstanceUid:'1.2.3'},{studyInstanceUid:'1.2.3'}]},
  {resources:[{studyInstanceUid:'1.2.4',seriesInstanceUids:[]}]},{resources:[{studyInstanceUid:'1.2.4',seriesInstanceUids:['1.2.4.1','1.2.4.1']}]},
  {resources:[{studyInstanceUid:'not-a-uid'}]}])assert.throws(()=>f.prepare({...f.request,...patch}),denied('V3_CONSENT_PENDING_INVALID'));
});
test('finite server policy and narrower parent window required',()=>{
 const f=fixture();
 for(const patch of [{validFrom:new Date(f.policy.nowMs-1).toISOString()},{validUntil:new Date(f.policy.nowMs+60001).toISOString()},
  {validUntil:f.request.validFrom},{validFrom:'2026-02-30T00:00:00Z'}])assert.throws(()=>f.prepare({...f.request,...patch}),error=>error.statusCode===422);
 for(const patch of [{nowMs:NaN},{maxLifetimeMs:Infinity},{maxLifetimeMs:86400001}])assert.throws(()=>f.prepare(f.request,f.selection,{...f.policy,...patch}),denied('V3_CONSENT_PENDING_POLICY_REQUIRED'));
 assert.throws(()=>f.prepare(f.request,{...f.selection,validUntil:f.request.validFrom}),denied('V3_CONSENT_PENDING_WINDOW_INVALID'));
});
test('accessor prototype and cloned intent do not confer preparation provenance',()=>{
 const f=fixture();let getterCalls=0;
 const accessor={...f.request};Object.defineProperty(accessor,'state',{get(){getterCalls++;return 'PENDING';},enumerable:true});
 assert.throws(()=>f.prepare(accessor),denied('V3_CONSENT_PENDING_INVALID'));assert.equal(getterCalls,0);
 assert.throws(()=>f.prepare(Object.assign(Object.create({}),f.request)),denied('V3_CONSENT_PENDING_INVALID'));
 const intent=f.prepare();assert.throws(()=>assertPendingConsentIntent(f.binding,{...intent}),denied('V3_CONSENT_PENDING_INTENT_REQUIRED'));
 const other=fixture();assert.throws(()=>assertPendingConsentIntent(other.binding,intent),denied('V3_CONSENT_PENDING_INTENT_REQUIRED'));
 assert.throws(()=>f.prepare(f.request,{...f.selection,authoritative:true}),denied('V3_CONSENT_PENDING_INVALID'));
});

test('started fixed window can be structurally replayed but not freshly admitted',()=>{
 const f=fixture(),intent=parsePendingConsentIntent(f.binding,f.request,f.selection),later={...f.policy,nowMs:f.policy.nowMs+2000};
 assert.throws(()=>validatePendingConsentIntentWindow(f.binding,intent,later),denied('V3_CONSENT_PENDING_WINDOW_INVALID'));
 assert.equal(validatePendingConsentIntentWindow(f.binding,intent,later,'REPLAY'),intent);
 assert.equal(intent.validFrom,f.request.validFrom);assert.equal(intent.validUntil,f.request.validUntil);
 assert.throws(()=>validatePendingConsentIntentWindow(f.binding,intent,{...later,nowMs:Date.parse(intent.validUntil)},'REPLAY'),denied('V3_CONSENT_PENDING_WINDOW_INVALID'));
 assert.throws(()=>validatePendingConsentIntentWindow(f.binding,{...intent},later,'REPLAY'),denied('V3_CONSENT_PENDING_INTENT_REQUIRED'));
 assert.throws(()=>f.prepare({...f.request,mode:'REPLAY'}),denied('V3_CONSENT_PENDING_INVALID'));
});
test('missing malformed policy and invalid internal replay mode fail closed',()=>{
 const f=fixture(),intent=parsePendingConsentIntent(f.binding,f.request,f.selection);
 for(const policy of [undefined,{},null,{...f.policy,skipExpiry:true},{...f.policy,nowMs:Infinity},{...f.policy,maxLifetimeMs:0}])
  assert.throws(()=>validatePendingConsentIntentWindow(f.binding,intent,policy,'REPLAY'),denied('V3_CONSENT_PENDING_POLICY_REQUIRED'));
 assert.throws(()=>validatePendingConsentIntentWindow(f.binding,intent,f.policy,'IGNORE'),denied('V3_CONSENT_PENDING_POLICY_REQUIRED'));
 assert.throws(()=>validatePendingConsentIntentWindow(f.binding,intent,{...f.policy,maxLifetimeMs:1000},'REPLAY'),denied('V3_CONSENT_PENDING_WINDOW_INVALID'));
});
