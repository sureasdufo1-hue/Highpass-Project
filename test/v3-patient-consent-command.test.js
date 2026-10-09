import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,randomBytes,createHmac} from 'node:crypto';
import {TestProvider} from '../src/auth.js';
import {V3PrincipalRegistry} from '../src/v3-principal-registry.js';
import {parsePatientConsentCommand,assertPatientConsentCommand} from '../src/v3-patient-consent-command.js';

function fixture({role='PATIENT',scope='consent:approve',claims={}}={}){
 const nowMs=Date.now(),secret=randomBytes(32).toString('hex'),patientRefId=randomUUID();
 const record={issuer:'synthetic-patient-consent',subject:randomUUID(),role,scopes:[scope],status:'ACTIVE',
  tenantId:randomUUID(),hospitalId:randomUUID(),actorId:randomUUID(),authHospitalId:'SYNTHETIC-A',patientRefId:role==='PATIENT'?patientRefId:null};
 const registry=new V3PrincipalRegistry({provider:new TestProvider({JWT_ISSUER:record.issuer,JWT_AUDIENCE:'synthetic',TEST_JWT_SECRET:secret}),records:[record]});
 const encoded=[{alg:'HS256'},{iss:record.issuer,aud:'synthetic',sub:record.subject,role,scope,hospitalId:record.authHospitalId,
  patientId:'SYNTHETIC-PATIENT',doctorId:'SYNTHETIC-DOCTOR',exp:Math.floor(nowMs/1000)+60,auth_time:Math.floor(nowMs/1000),
  acr:'urn:highpass:capstone:mock-mfa',amr:['pwd','otp','mfa'],highpass_test_assurance:true,...claims}]
  .map(value=>Buffer.from(JSON.stringify(value)).toString('base64url')).join('.');
 const binding=registry.resolve({headers:{authorization:`Bearer ${encoded}.${createHmac('sha256',secret).update(encoded).digest('base64url')}`}},
  {requiredScope:scope,allowedRoles:[role]});
 const projection={preparationId:randomUUID(),sessionId:randomUUID(),expectedSessionVersion:1,patientRefId,ownerTenantId:record.tenantId,
  sourceHospitalId:record.hospitalId,targetHospitalId:randomUUID(),state:'PENDING',evidenceStatus:'UNVERIFIED',contentDigest:'a'.repeat(64),
  validFrom:new Date(nowMs-1000).toISOString(),validUntil:new Date(nowMs+30000).toISOString()};
 const request={preparationId:projection.preparationId,expectedSessionVersion:1,contentDigest:projection.contentDigest,decision:'APPROVE',
  identityLink:{approved:false,clauseVersion:'synthetic-link-v1'}};
 const policy={nowMs,maxReauthAgeMs:60000,linkClauseVersion:'synthetic-link-v1'};
 return {binding,projection,request,policy,parse:(r=request,p=projection,q=policy)=>parsePatientConsentCommand(binding,r,p,q)};
}
const code=value=>error=>error.code===value;
test('patient approval and rejection commands are immutable intentions not persisted consent',()=>{
 const f=fixture(),command=f.parse();assert.equal(assertPatientConsentCommand(f.binding,command),command);
 assert.equal(command.kind,'PATIENT_CONSENT_COMMAND_ONLY');assert.ok(Object.isFrozen(command)&&Object.isFrozen(command.identityLink));
 f.request.identityLink.approved=true;assert.equal(command.identityLink.approved,false);
 assert.equal(f.parse({...f.request,decision:'REJECT',identityLink:{...f.request.identityLink,approved:false}}).decision,'REJECT');
 for(const key of ['state','consentArtifactId','approvalEventId','grantId','token','evidenceStatus'])assert.equal(Object.hasOwn(command,key),false);
 assert.throws(()=>assertPatientConsentCommand(f.binding,{...command}),code('V3_PATIENT_CONSENT_COMMAND_REQUIRED'));
});
test('patient binding provenance role scope and context cannot be spoofed',()=>{
 const f=fixture();assert.throws(()=>parsePatientConsentCommand({...f.binding},f.request,f.projection,f.policy),code('V3_AUTHENTICATED_BINDING_REQUIRED'));
 for(const role of ['DOCTOR','HOSPITAL_ADMIN','SECURITY_ADMIN'])assert.throws(()=>fixture({role}).parse(),code('V3_ROLE_NOT_ALLOWED'));
 assert.throws(()=>fixture({scope:'consent:write'}).parse(),code('V3_SCOPE_NOT_ALLOWED'));
 for(const key of ['patientRefId','ownerTenantId','sourceHospitalId'])assert.throws(()=>f.parse(f.request,{...f.projection,[key]:randomUUID()}),code('V3_PATIENT_CONSENT_CONTEXT_MISMATCH'));
 assert.throws(()=>f.parse(f.request,{...f.projection,targetHospitalId:f.binding.hospitalId}),code('V3_PATIENT_CONSENT_CONTEXT_MISMATCH'));
});
test('signed synthetic assurance requires exact MFA and recent nonfuture auth time',()=>{
 for(const claims of [{acr:null},{amr:['pwd']},{amr:['pwd','otp','otp']},{highpass_test_assurance:'true'},
  {auth_time:undefined},{auth_time:'123'},{auth_time:1},{auth_time:Math.floor(Date.now()/1000)+60}])
  assert.throws(()=>fixture({claims}).parse(),code('V3_PATIENT_SYNTHETIC_REAUTH_REQUIRED'));
 const f=fixture();assert.throws(()=>f.parse(f.request,f.projection,{...f.policy,nowMs:f.policy.nowMs+60001}),code('V3_PATIENT_SYNTHETIC_REAUTH_REQUIRED'));
 for(const patch of [{maxReauthAgeMs:0},{maxReauthAgeMs:300001},{nowMs:NaN}])
  assert.throws(()=>f.parse(f.request,f.projection,{...f.policy,...patch}),code('V3_REAUTH_POLICY_REQUIRED'));
});
test('preparation content version state and expiry must match displayed server projection',()=>{
 const f=fixture();
 for(const patch of [{preparationId:randomUUID()},{contentDigest:'b'.repeat(64)}])assert.throws(()=>f.parse({...f.request,...patch}),code('V3_PATIENT_CONSENT_CONTENT_MISMATCH'));
 assert.throws(()=>f.parse({...f.request,expectedSessionVersion:2}),code('V3_PATIENT_CONSENT_VERSION_MISMATCH'));
 for(const patch of [{state:'ACTIVE'},{evidenceStatus:'VERIFIED'}])assert.throws(()=>f.parse(f.request,{...f.projection,...patch}),code('V3_PATIENT_CONSENT_STATE_MISMATCH'));
 assert.throws(()=>f.parse(f.request,{...f.projection,validUntil:new Date(f.policy.nowMs).toISOString()}),code('V3_PATIENT_CONSENT_EXPIRED'));
});
test('identity linking is independent explicit versioned choice and reject cannot approve link',()=>{
 const f=fixture();assert.equal(f.parse({...f.request,identityLink:{approved:true,clauseVersion:'synthetic-link-v1'}}).identityLink.approved,true);
 for(const patch of [{decision:'REJECT',identityLink:{approved:true,clauseVersion:'synthetic-link-v1'}},
  {identityLink:{approved:false,clauseVersion:'unknown'}}])assert.throws(()=>f.parse({...f.request,...patch}),code('V3_PATIENT_CONSENT_LINK_CHOICE_INVALID'));
});
test('additional authority fields accessors prototypes malformed and incomplete inputs fail closed',()=>{
 const f=fixture();
 for(const patch of [{state:'ACTIVE'},{actorId:randomUUID()},{grantId:randomUUID()},{mfa:true},{decision:true},{contentDigest:'short'},
  {expectedSessionVersion:0},{identityLink:{approved:'true',clauseVersion:'synthetic-link-v1'}}])
  assert.throws(()=>f.parse({...f.request,...patch}),code('V3_PATIENT_CONSENT_COMMAND_INVALID'));
 const incomplete={...f.request};delete incomplete.identityLink;assert.throws(()=>f.parse(incomplete),code('V3_PATIENT_CONSENT_COMMAND_INVALID'));
 let read=0;const accessor={...f.request};Object.defineProperty(accessor,'decision',{get(){read++;return 'APPROVE';}});
 assert.throws(()=>f.parse(accessor),code('V3_PATIENT_CONSENT_COMMAND_INVALID'));assert.equal(read,0);
 assert.throws(()=>f.parse(Object.assign(Object.create({}),f.request)),code('V3_PATIENT_CONSENT_COMMAND_INVALID'));
});
